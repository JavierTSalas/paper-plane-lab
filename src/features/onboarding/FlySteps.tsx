import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { usePlaneBuild, type PlaneBuild } from '../../app/hooks';
import { useLab } from '../../app/store';
import type { FlightResult, Launch } from '../../core/types';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { formatSpeed, lengthParts, signedDeg, timeParts, type UnitSystem } from '../../ui/format';
import { Icon } from '../../ui/icons';
import { InfoDot } from '../../ui/InfoDot';
import { useReducedMotion } from '../../ui/motion';
import { FlightStage, swipeToThrow, ThrowPad, trailOf, type FlightStagePlane } from '../fly';
import { clamp, clampLaunch } from '../fly/flight';
import { flyIntro, getWrenDesign, INTRO_MAX_SPEED, introEnv, makePlayerDesign, MAX_THROWS, PLAYER_START_LAUNCH, WREN_LAUNCH } from './flow';
import { compareLine, DIAGNOSIS_HEADLINE, WATCH_THROW, YOUR_THROW } from './script';
import { StepFrame, type StepProps } from './StepFrame';

type Phase = 'ready' | 'flying' | 'landed';

const stagePlane = (b: PlaneBuild): FlightStagePlane => ({
  model: b.model,
  paper: b.design.paper,
  airframe: b.airframe,
});

function useWrenFlight(): { build: PlaneBuild; result: FlightResult } {
  const build = usePlaneBuild(getWrenDesign())!;
  const result = useMemo(() => flyIntro(build.airframe, WREN_LAUNCH), [build]);
  return { build, result };
}

const DISTANCE_INFO = (
  <InfoDot label="How distance is measured" title="Distance">
    Measured as in competitions: from the hand that let go to the spot where the plane first touched.
  </InfoDot>
);
const TIME_INFO = (
  <InfoDot label="How time aloft is measured" title="Time aloft">
    Seconds from release until the plane first touches the floor, a wall or the ceiling.
  </InfoDot>
);

/** Distance and time of one or more flights, as a compact table. */
function FlightTable({ rows, units }: { rows: readonly { who: string; result: FlightResult; mine?: boolean }[]; units: UnitSystem }): ReactElement {
  return (
    <table className="ppl-onb__table ppl-num">
      <thead>
        <tr>
          <th scope="col">
            <span className="ppl-sr-only">Thrower</span>
          </th>
          <th scope="col">Distance {DISTANCE_INFO}</th>
          <th scope="col">Time {TIME_INFO}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ who, result, mine }) => {
          const d = lengthParts(result.metrics.distance, units);
          const t = timeParts(result.metrics.airtime);
          return (
            <tr key={who} className={cx(mine && 'is-mine')}>
              <th scope="row">{who}</th>
              <td>
                <b>{d.value}</b> {d.unit}
              </td>
              <td>
                <b>{t.value}</b> {t.unit}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Step 3: the Professor throws his dart in the classroom. */
export function WatchThrow({ next }: StepProps): ReactElement {
  const units = useLab((s) => s.settings.units);
  const reduced = useReducedMotion();
  const env = useMemo(introEnv, []);
  const { build, result } = useWrenFlight();
  const plane = useMemo(() => stagePlane(build), [build]);
  const [phase, setPhase] = useState<Phase>('ready');

  // A beat in the ready pose, then he throws.
  useEffect(() => {
    if (phase !== 'ready') return;
    const t = window.setTimeout(() => setPhase('flying'), reduced ? 600 : 1500);
    return () => window.clearTimeout(t);
  }, [phase, reduced]);

  const clean = result.diagnosis[0]?.code === 'clean-glide';
  const line = phase === 'ready' ? WATCH_THROW.ready : phase === 'flying' ? WATCH_THROW.flying : clean ? WATCH_THROW.clean : WATCH_THROW.otherwise;

  return (
    <StepFrame
      className="ppl-onb__step--watch-throw"
      pose={phase === 'ready' ? 'throw' : phase === 'flying' ? 'point' : 'talk'}
      title={WATCH_THROW.title}
      stage={
        <div className="ppl-onb__fly">
          <FlightStage
            className="ppl-onb__flystage"
            env={env}
            plane={plane}
            flight={phase === 'ready' ? null : result}
            launch={WREN_LAUNCH}
            autoPlay
            camera={phase === 'landed' ? 'thrower' : 'chase'}
            units={units}
            reducedMotion={reduced}
            onEnd={() => setPhase('landed')}
            label={`${env.name}: Professor Wren's dart ${phase === 'ready' ? 'in his hand' : phase === 'flying' ? 'in flight' : 'has landed'}`}
          />
        </div>
      }
      extra={phase === 'landed' ? <FlightTable rows={[{ who: 'Wren', result }]} units={units} /> : undefined}
      actions={
        phase === 'landed' ? (
          <>
            <Button variant="ghost" icon="replay" onClick={() => setPhase('ready')}>
              Again
            </Button>
            <Button variant="primary" size="lg" iconRight="next" onClick={next}>
              My turn
            </Button>
          </>
        ) : (
          <Button variant="secondary" iconRight="next" onClick={next}>
            Skip ahead
          </Button>
        )
      }
    >
      {line}
    </StepFrame>
  );
}

interface SwipeState {
  id: number;
  x: number;
  y: number;
  trail: { x: number; y: number; t: number }[];
}

/** Step 5: the player throws their own dart; afterwards their numbers beside the Professor's and a first diagnosis. */
export function YourThrow({ progress, update, next }: StepProps): ReactElement {
  const units = useLab((s) => s.settings.units);
  const reduced = useReducedMotion();
  const env = useMemo(introEnv, []);
  const design = useMemo(() => makePlayerDesign(progress.planeId, progress.color ?? 'white'), [progress.planeId, progress.color]);
  const build = usePlaneBuild(design)!;
  const plane = useMemo(() => stagePlane(build), [build]);
  const wren = useWrenFlight();
  const ghosts = useMemo(() => [trailOf(wren.result)], [wren.result]);

  const [launch, setLaunch] = useState<Launch>(() => progress.throws[progress.throws.length - 1] ?? PLAYER_START_LAUNCH);
  const [thrown, setThrown] = useState<Launch | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [aim, setAim] = useState<Launch | null>(null);
  const result = useMemo(() => (thrown ? flyIntro(build.airframe, thrown) : null), [build, thrown]);

  const throwsRef = useRef(progress.throws);
  throwsRef.current = progress.throws;
  const doThrow = (l: Launch): void => {
    const clamped = clampLaunch(l);
    const safe: Launch = {
      ...clamped,
      speed: Math.min(clamped.speed, INTRO_MAX_SPEED),
      pitchDeg: clamp(clamped.pitchDeg, -20, 60),
    };
    setLaunch(safe);
    setThrown(safe);
    setPhase('flying');
    update({ throws: [...throwsRef.current, safe].slice(-MAX_THROWS) });
  };

  /* Swipe up on the room to throw (same mapping as the Fly screen). */
  const swipe = useRef<SwipeState | null>(null);
  const swipeResult = (e: ReactPointerEvent<HTMLDivElement>): { speed: number; pitchDeg: number } | null => {
    const s = swipe.current;
    if (!s) return null;
    const pts = s.trail;
    const last = pts[pts.length - 1]!;
    // Release velocity over the last ~80 ms of the stroke.
    let first = pts[0]!;
    for (let i = pts.length - 1; i >= 0; i--) {
      first = pts[i]!;
      if (last.t - first.t > 80) break;
    }
    const dt = Math.max(16, last.t - first.t) / 1000;
    const r = swipeToThrow(e.clientX - s.x, e.clientY - s.y, (last.x - first.x) / dt, (last.y - first.y) / dt, e.currentTarget.clientHeight);
    return r && { speed: Math.min(r.speed, INTRO_MAX_SPEED), pitchDeg: r.pitchDeg };
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    swipe.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      trail: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
    };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    s.trail.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (s.trail.length > 30) s.trail.shift();
    const r = swipeResult(e);
    setAim(r ? { ...launch, ...r } : null);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    s.trail.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    const r = swipeResult(e);
    swipe.current = null;
    setAim(null);
    if (r) doThrow({ ...launch, ...r });
  };

  const again = (): void => {
    setPhase('ready');
    setThrown(null);
  };

  const diag = result?.diagnosis[0] ?? null;
  const landed = phase === 'landed' && result !== null;
  let line: string = YOUR_THROW.ready;
  if (phase === 'flying') line = YOUR_THROW.flying;
  if (landed) line = diag ? DIAGNOSIS_HEADLINE[diag.code] : YOUR_THROW.again;
  const title = landed ? compareLine(result.metrics.distance, wren.result.metrics.distance) : YOUR_THROW.title;

  return (
    <StepFrame
      className={cx('ppl-onb__step--your-throw', landed && 'is-landed')}
      title={title}
      pose={
        phase === 'ready' ? 'idle' : phase === 'flying' ? 'point' : result && result.metrics.distance >= wren.result.metrics.distance * 0.9 ? 'cheer' : 'think'
      }
      stage={
        <div className="ppl-onb__fly">
          <FlightStage
            className="ppl-onb__flystage"
            env={env}
            plane={plane}
            flight={phase === 'ready' ? null : result}
            launch={launch}
            aim={aim}
            ghosts={ghosts}
            autoPlay
            camera={phase === 'landed' ? 'thrower' : 'chase'}
            units={units}
            reducedMotion={reduced}
            onEnd={() => setPhase('landed')}
            label={`${env.name}: your dart ${phase === 'ready' ? 'is ready to throw' : phase === 'flying' ? 'is flying' : 'has landed'}. The faint line is the Professor's flight.`}
          />
          {phase === 'ready' && (
            <div
              className="ppl-onb__swipe"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => {
                swipe.current = null;
                setAim(null);
              }}
              aria-hidden="true"
            >
              <span className={cx('ppl-onb__swipe-hint', aim && 'is-aiming')}>
                {aim ? (
                  <>
                    {formatSpeed(aim.speed, units)} · {signedDeg(aim.pitchDeg)}
                  </>
                ) : (
                  <>
                    <Icon name="swipe-up" size={18} /> Swipe up to throw
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      }
      extra={
        landed ? (
          <div className="ppl-onb__compare">
            <FlightTable rows={[{ who: 'Wren', result: wren.result }, { who: 'You', result, mine: true }]} units={units} />
            {diag && diag.code !== 'clean-glide' && (diag.fix || diag.why) && (
              <div className="ppl-onb__note">
                {diag.fix || diag.why}{' '}
                {diag.fix && diag.why && (
                  <InfoDot label="Why did it fly like that?" title="Why">
                    {diag.why}
                  </InfoDot>
                )}
              </div>
            )}
          </div>
        ) : undefined
      }
      actions={
        landed ? (
          <>
            <Button variant="secondary" icon="replay" onClick={again}>
              Throw again
            </Button>
            <Button variant="primary" size="lg" iconRight="next" onClick={next}>
              Continue
            </Button>
          </>
        ) : (
          <div className="ppl-onb__pad">
            <ThrowPad
              speed={launch.speed}
              pitchDeg={launch.pitchDeg}
              maxSpeed={INTRO_MAX_SPEED}
              units={units}
              disabled={phase !== 'ready'}
              onChange={(v) => setLaunch((l) => ({ ...l, ...v }))}
              onThrow={() => doThrow(launch)}
            />
            {phase === 'ready' && progress.throws.length > 0 && (
              <Button variant="ghost" size="sm" iconRight="next" onClick={next}>
                Done throwing
              </Button>
            )}
          </div>
        )
      }
    >
      {line}
    </StepFrame>
  );
}
