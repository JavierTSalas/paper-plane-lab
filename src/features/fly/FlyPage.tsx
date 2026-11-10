import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { usePlaneBuild, useCurrentDesign } from '../../app/hooks';
import { useLab } from '../../app/store';
import type { FlightSummary } from '../../app/types';
import { getPreset } from '../../core/designs';
import { DEFAULT_ENVIRONMENT_ID, ENVIRONMENTS, getEnvironment, groundHeight } from '../../core/env';
import { defaultLaunch, simulateFlight, THROW_LIMITS } from '../../core/sim';
import type { Arena, Launch, PlaneDesign, TrimSpec, Vec3 } from '../../core/types';
import { Button, IconButton } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { cx } from '../../ui/cx';
import { formatSpeed, lengthParts, signedDeg, speedParts, timeParts } from '../../ui/format';
import { Icon } from '../../ui/icons';
import { InfoDot } from '../../ui/InfoDot';
import { Menu } from '../../ui/Menu';
import { useMediaQuery } from '../../ui/hooks';
import { useReducedMotion } from '../../ui/motion';
import { Sheet } from '../../ui/Sheet';
import { Slider } from '../../ui/Slider';
import { toast } from '../../ui/Toast';
import { TrimPanel } from '../fold';
import { DetailsSheet } from './DetailsSheet';
import { defaultWind, EnvironmentSheet, placeSummary, type WindSetting } from './EnvironmentSheet';
import { clampLaunch, conditionsFor, nextSeed, pushGhost, swipeToThrow, trailOf } from './flight';
import { PlaneSheet } from './PlaneSheet';
import { matchingArenas } from './ranking';
import { ResultCard } from './ResultCard';
import { FlightStage, type FlightStageHandle } from './stage/FlightStage';
import type { CameraMode } from './stage/cameraRig';
import type { LiveSample } from './stage/playback';
import { ThrowPad } from './ThrowPad';
import type { ThrowRecord } from './types';
import { useOverlayInsets } from './useOverlayInsets';
import './fly.css';

type Phase = 'ready' | 'flying' | 'landed';
type SheetId = 'env' | 'plane' | 'trim' | 'details' | null;

const CAMERA_LABEL: Record<CameraMode, string> = { chase: 'Chase', side: 'Side', thrower: 'From the thrower', orbit: 'Free orbit' };
const CAMERA_HINT: Record<CameraMode, string> = {
  chase: 'Behind and above the plane',
  side: 'Side-on: best for the glide path',
  thrower: 'Watch it fly away from you',
  orbit: 'Drag to look around',
};

const SESSION_KEY = 'ppl-fly';

interface Saved {
  envId: string;
  camera: CameraMode;
  winds: Record<string, WindSetting>;
}

function loadSaved(): Partial<Saved> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Partial<Saved>) : {};
  } catch {
    return {};
  }
}

/** The preset's own recommended throw, else a sensible one for the kind of plane. */
function firstThrow(presetId: string | undefined, category: PlaneDesign['category']): Launch {
  const base = defaultLaunch(category);
  const hint = presetId ? getPreset(presetId)?.throwHint : undefined;
  return hint ? { ...base, speed: hint.speed, pitchDeg: hint.pitchDeg } : base;
}

let throwCounter = 0;
const newId = (): string => `f-${Date.now().toString(36)}-${(throwCounter++).toString(36)}`;

export default function FlyPage(): ReactElement {
  const design = useCurrentDesign();
  const build = usePlaneBuild(design);
  const units = useLab((s) => s.settings.units);
  const showTrails = useLab((s) => s.settings.showTrails);
  const planes = useLab((s) => s.planes);
  const flights = useLab((s) => s.flights);
  const logFlight = useLab((s) => s.logFlight);
  const updateTrim = useLab((s) => s.updateTrim);
  const savePlane = useLab((s) => s.savePlane);
  const reducedMotion = useReducedMotion();
  const wide = useMediaQuery('(min-width: 900px)');
  // `?nogl` before the hash shows the SVG fallback even with WebGL (testing).
  const forceFallback = typeof window !== 'undefined' && /[?&]nogl\b/.test(window.location.search);

  const saved = useMemo(loadSaved, []);
  const [envId, setEnvId] = useState<string>(() => {
    const id = saved.envId ?? flights[0]?.envId ?? DEFAULT_ENVIRONMENT_ID;
    return ENVIRONMENTS.some((e) => e.id === id) ? id : DEFAULT_ENVIRONMENT_ID;
  });
  const env = getEnvironment(envId);
  const [winds, setWinds] = useState<Record<string, WindSetting>>(() => saved.winds ?? {});
  const wind = winds[envId] ?? defaultWind(env);
  const conditions = useMemo(() => conditionsFor(env, wind), [env, wind]);
  const [camera, setCamera] = useState<CameraMode>(() => saved.camera ?? 'chase');
  const [launch, setLaunch] = useState<Launch>(() => firstThrow(design.presetId, design.category));
  const [advanced, setAdvanced] = useState(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [record, setRecord] = useState<ThrowRecord | null>(null);
  const [ghosts, setGhosts] = useState<Vec3[][]>([]);
  const [rate, setRate] = useState(1);
  const [paused, setPaused] = useState(false);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [aim, setAim] = useState<Launch | null>(null);
  const [time, setTime] = useState(0);
  const stage = useRef<FlightStageHandle>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ envId, camera, winds } satisfies Saved));
    } catch {
      /* storage blocked: the screen still works */
    }
  }, [envId, camera, winds]);

  // A different plane gets its own sensible first throw.
  const designId = design.id;
  const category = design.category;
  const presetId = design.presetId;
  useEffect(() => {
    setLaunch(firstThrow(presetId, category));
  }, [designId, presetId, category]);

  /* ------------------------------------------------------------ live HUD (written straight to the DOM) */

  const hud = {
    dist: useRef<HTMLElement>(null),
    height: useRef<HTMLElement>(null),
    speed: useRef<HTMLElement>(null),
    time: useRef<HTMLElement>(null),
  };
  const lastTimeState = useRef(0);
  const recordRef = useRef<ThrowRecord | null>(null);
  recordRef.current = record;
  const onFrame = useCallback(
    (s: LiveSample) => {
      const l = env.launch;
      const set = (el: HTMLElement | null, text: string): void => {
        if (el && el.textContent !== text) el.textContent = text;
      };
      // At touchdown show the competition distance (to the point that touched), as the result card does.
      const r = recordRef.current?.result;
      const end = r && r.samples.length > 0 && s.t >= r.samples[r.samples.length - 1].t - 1e-6;
      const dist = end ? r.metrics.distance : Math.hypot(s.pos[0] - l[0], s.pos[2] - l[2]);
      const d = lengthParts(dist, units, { digits: 1, unit: units === 'imperial' ? 'ft' : 'm' });
      const h = lengthParts(Math.max(0, s.pos[1] - groundHeight(env, s.pos[0], s.pos[2])), units, { digits: 1, unit: units === 'imperial' ? 'ft' : 'm' });
      const v = speedParts(s.airspeed, units);
      const t = timeParts(s.t);
      set(hud.dist.current, `${d.value} ${d.unit}`);
      set(hud.height.current, `${h.value} ${h.unit}`);
      set(hud.speed.current, `${v.value} ${v.unit}`);
      set(hud.time.current, `${t.value} ${t.unit}`);
      // React state only a few times a second (scrubber, charts).
      if (Math.abs(s.t - lastTimeState.current) > 0.12 || (s.t === 0 && lastTimeState.current !== 0)) {
        lastTimeState.current = s.t;
        setTime(s.t);
      }
    },
    // hud refs are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [env, units],
  );

  /* ------------------------------------------------------------ throwing */

  const doThrow = useCallback(
    (l: Launch) => {
      if (!build) return;
      const seed = nextSeed(env, Math.random());
      let result;
      try {
        result = simulateFlight(build.airframe, l, env, conditions, seed);
      } catch {
        toast({ title: 'That throw could not be simulated', body: 'Try a different speed or angle.', tone: 'danger' });
        return;
      }
      if (record && showTrails && record.env.id === env.id) setGhosts((g) => pushGhost(g, trailOf(record.result)));
      const next: ThrowRecord = { id: newId(), result, launch: l, conditions, seed, env, build };
      setRecord(next);
      setPhase('flying');
      setPaused(false);
      setRate(1);
      setAim(null);
      setSheet(null);
      const summary: FlightSummary = {
        id: next.id,
        planeId: build.design.id,
        planeName: build.design.name,
        envId: env.id,
        conditions,
        launch: l,
        seed,
        metrics: result.metrics,
        diagnosisCodes: result.diagnosis.map((d) => d.code),
        at: new Date().toISOString(),
      };
      logFlight(summary);
    },
    [build, env, conditions, record, showTrails, logFlight],
  );

  const onEnd = useCallback(() => {
    setPhase('landed');
    setPaused(false);
  }, []);

  const again = (): void => {
    setPhase('ready');
    if (record && showTrails) setGhosts((g) => pushGhost(g, trailOf(record.result)));
    setRecord(null);
  };

  const replay = (): void => {
    setPhase('flying');
    setPaused(false);
    stage.current?.seek(0);
    stage.current?.play();
  };

  const togglePause = (): void => {
    if (paused) stage.current?.play();
    else stage.current?.pause();
    setPaused(!paused);
  };

  const skip = (): void => {
    const d = stage.current?.getDuration() ?? 0;
    stage.current?.pause();
    stage.current?.seek(d);
    setPhase('landed');
    setPaused(false);
  };

  const chooseEnv = (id: string): void => {
    if (id === envId) return;
    setEnvId(id);
    setGhosts([]);
    setRecord(null);
    setPhase('ready');
  };

  const onTrim = (trim: TrimSpec): void => {
    if (planes[design.id]) updateTrim(design.id, trim);
    else savePlane({ ...design, trim });
  };

  const rank = (arena: Arena): void => {
    toast({ title: `This throw meets the ${arena.name} rules`, body: 'Compare it with the lab benchmarks in Ranks.', tone: 'success' });
    window.location.hash = `#/ranks`;
  };

  /* ------------------------------------------------------------ swipe to throw */

  const swipe = useRef<{ id: number; x: number; y: number; trail: { x: number; y: number; t: number }[] } | null>(null);
  const swipeResult = (e: ReactPointerEvent<HTMLDivElement>): { speed: number; pitchDeg: number } | null => {
    const s = swipe.current;
    if (!s) return null;
    const pts = s.trail;
    const last = pts[pts.length - 1];
    // Release velocity over the last ~80 ms of the stroke.
    let first = pts[0];
    for (let i = pts.length - 1; i >= 0; i--) {
      first = pts[i];
      if (last.t - pts[i].t > 80) break;
    }
    const dt = Math.max(16, last.t - first.t) / 1000;
    return swipeToThrow(e.clientX - s.x, e.clientY - s.y, (last.x - first.x) / dt, (last.y - first.y) / dt, e.currentTarget.clientHeight);
  };
  const onSwipeDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, trail: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  };
  const onSwipeMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    s.trail.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (s.trail.length > 30) s.trail.shift();
    const r = swipeResult(e);
    if (r) setAim({ ...launch, ...r });
  };
  const onSwipeUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    s.trail.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    const r = swipeResult(e);
    swipe.current = null;
    setAim(null);
    if (!r) return;
    const l = clampLaunch({ ...launch, ...r });
    setLaunch(l);
    doThrow(l);
  };

  /* ------------------------------------------------------------ derived bits */

  const plane = useMemo(() => (build ? { model: build.model, paper: design.paper, airframe: build.airframe } : null), [build, design.paper]);
  const ghostTrails = showTrails ? ghosts : [];
  const arenas = useMemo(() => (record ? matchingArenas(record.conditions, record.launch) : []), [record]);
  const personalBest = useMemo(() => {
    if (!record) return false;
    const others = flights.filter((f) => f.id !== record.id && f.planeId === record.build.design.id && f.envId === record.env.id);
    return others.length > 0 && others.every((f) => f.metrics.distance < record.result.metrics.distance);
  }, [flights, record]);
  const showResult = phase === 'landed' && record !== null;
  const flying = phase === 'flying';
  const overlay = useOverlayInsets(pageRef, [panelRef, resultRef], `${phase}|${showResult}`);
  const insets = useMemo(() => ({ ...overlay, top: overlay.top + 64 }), [overlay]);

  return (
    <div ref={pageRef} className={cx('ppl-fly', `ppl-fly--${phase}`)}>
      <h1 className="ppl-sr-only">Fly</h1>
      <FlightStage
        ref={stage}
        className="ppl-fly__stage"
        env={env}
        conditions={conditions}
        plane={plane}
        flight={record?.result ?? null}
        launch={launch}
        aim={aim}
        camera={camera}
        ghosts={ghostTrails}
        rate={rate}
        autoPlay
        insets={insets}
        orbit={phase === 'landed' || paused}
        units={units}
        reducedMotion={reducedMotion}
        onFrame={onFrame}
        onEnd={onEnd}
        forceFallback={forceFallback}
        label={`${env.name}: ${phase === 'ready' ? 'the plane is ready to throw' : phase === 'flying' ? 'the plane is flying' : 'the plane has landed'}`}
      />

      {phase === 'ready' && (
        <div
          className="ppl-fly__swipe"
          onPointerDown={onSwipeDown}
          onPointerMove={onSwipeMove}
          onPointerUp={onSwipeUp}
          onPointerCancel={() => {
            swipe.current = null;
            setAim(null);
          }}
          aria-hidden="true"
        >
          <span className={cx('ppl-fly__swipe-hint', aim && 'is-aiming')}>
            {aim ? (
              <>
                {formatSpeed(aim.speed, units)} · {signedDeg(aim.pitchDeg)}
              </>
            ) : (
              <>
                <Icon name="hand" size={18} /> Swipe up to throw
              </>
            )}
          </span>
        </div>
      )}

      <header className="ppl-fly__top">
        <Chip icon={env.indoor ? 'hangar' : 'wind'} onClick={() => setSheet('env')} aria-label={`Place: ${env.name}. ${placeSummary(env, wind, units)}. Change`} className="ppl-fly__chip ppl-fly__chip--env">
          <span className="ppl-fly__chip-main">{env.name}</span>
          <span className="ppl-fly__chip-sub">{placeSummary(env, wind, units)}</span>
        </Chip>
        <Chip onClick={() => setSheet('plane')} aria-label={`Plane: ${design.name}. Change`} className="ppl-fly__chip ppl-fly__chip--plane">
          <span className="ppl-fly__dot" style={{ background: design.paper.front }} aria-hidden="true" />
          <span className="ppl-fly__chip-main">{design.name}</span>
        </Chip>
        <Menu
          label={`Camera: ${CAMERA_LABEL[camera]}`}
          icon="camera"
          className="ppl-fly__camera"
          items={(Object.keys(CAMERA_LABEL) as CameraMode[]).map((m) => ({
            id: m,
            label: CAMERA_LABEL[m],
            hint: CAMERA_HINT[m],
            icon: m === camera ? 'check' : undefined,
            onSelect: () => setCamera(m),
          }))}
        />
      </header>

      {phase !== 'ready' && (
        <dl className="ppl-fly__readouts" aria-live="off">
          <div>
            <dt>Distance</dt>
            <dd ref={hud.dist}>0.0 m</dd>
          </div>
          <div>
            <dt>Height</dt>
            <dd ref={hud.height}>0.0 m</dd>
          </div>
          <div>
            <dt>Airspeed</dt>
            <dd ref={hud.speed}>0.0 m/s</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd ref={hud.time}>0.0 s</dd>
          </div>
        </dl>
      )}

      {flying && (
        <div className="ppl-fly__playbar" role="group" aria-label="Playback">
          <IconButton icon={paused ? 'play' : 'pause'} label={paused ? 'Play' : 'Pause'} variant="secondary" onClick={togglePause} />
          <Button variant={rate < 1 ? 'primary' : 'secondary'} aria-pressed={rate < 1} onClick={() => setRate(rate < 1 ? 1 : 0.25)} className="ppl-fly__slowmo">
            0.25×
          </Button>
          <Button variant="secondary" iconRight="next" onClick={skip}>
            Skip
          </Button>
        </div>
      )}

      {phase === 'ready' && (
        <aside ref={panelRef} className="ppl-fly__panel" aria-label="Throw">
          <ThrowPad
            speed={launch.speed}
            pitchDeg={launch.pitchDeg}
            units={units}
            disabled={!build}
            onChange={(v) => setLaunch((l) => ({ ...l, ...v }))}
            onThrow={() => doThrow(launch)}
          >
            <button type="button" className="ppl-fly__more" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
              <Icon name={advanced ? 'minus' : 'plus'} size={16} /> Bank and aim
            </button>
            {advanced && (
              <div className="ppl-fly__advanced">
                <Slider
                  label="Bank"
                  min={-THROW_LIMITS.maxRollDeg}
                  max={THROW_LIMITS.maxRollDeg}
                  step={1}
                  origin={0}
                  value={launch.rollDeg}
                  onChange={(v) => setLaunch((l) => ({ ...l, rollDeg: v }))}
                  format={(v) => (v === 0 ? 'Level' : `${signedDeg(v)} ${v > 0 ? 'right' : 'left'} wing down`)}
                  info={
                    <InfoDot label="About bank" title="Bank at release">
                      How tilted the wings are when you let go. Real throws are rarely perfectly level; a few degrees is enough to start a turn.
                    </InfoDot>
                  }
                />
                <Slider
                  label="Aim"
                  min={-30}
                  max={30}
                  step={1}
                  origin={0}
                  value={launch.yawDeg}
                  onChange={(v) => setLaunch((l) => ({ ...l, yawDeg: v }))}
                  format={(v) => (v === 0 ? 'Straight' : `${Math.abs(v)}° ${v > 0 ? 'right' : 'left'}`)}
                  info={
                    <InfoDot label="About aim" title="Aim">
                      The direction of the throw, left or right of the measuring tape. Useful to throw into a crosswind.
                    </InfoDot>
                  }
                />
              </div>
            )}
          </ThrowPad>
        </aside>
      )}

      {showResult && record && (
        <ResultCard
          ref={resultRef}
          className="ppl-fly__result"
          record={record}
          units={units}
          personalBest={personalBest}
          wide={wide}
          arenas={arenas}
          onAgain={again}
          onReplay={replay}
          onTrim={() => setSheet('trim')}
          onDetails={() => setSheet('details')}
          onRank={rank}
        />
      )}

      <EnvironmentSheet
        open={sheet === 'env'}
        onClose={() => setSheet(null)}
        envId={envId}
        onSelect={chooseEnv}
        wind={wind}
        onWind={(w) => setWinds((all) => ({ ...all, [envId]: w }))}
        units={units}
      />
      <PlaneSheet open={sheet === 'plane'} onClose={() => setSheet(null)} current={design} />
      <Sheet
        open={sheet === 'trim'}
        onClose={() => setSheet(null)}
        title={`Trim the ${design.name}`}
        description="Small bends after folding. The next throw flies with them."
        size="md"
        footer={
          <Button
            variant="primary"
            block
            icon="fly"
            onClick={() => {
              setSheet(null);
              again();
            }}
          >
            Back to throwing
          </Button>
        }
      >
        <TrimPanel design={design} onChange={onTrim} />
      </Sheet>
      {record && (
        <DetailsSheet
          open={sheet === 'details'}
          onClose={() => setSheet(null)}
          record={record}
          units={units}
          time={time}
          onSeek={(t) => {
            stage.current?.pause();
            stage.current?.seek(t);
            setTime(t);
          }}
        />
      )}
    </div>
  );
}
