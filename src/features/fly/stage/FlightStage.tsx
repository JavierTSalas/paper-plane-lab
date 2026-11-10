/**
 * <FlightStage/>: React wrapper of the three.js FlightStageEngine. Props are declarative (place, plane,
 * flight, camera, ghosts); playback is imperative through the ref handle. three.js loads lazily the first
 * time a stage mounts. Without WebGL2 the stage shows an SVG side view of the same flight.
 */
import { useEffect, useImperativeHandle, useRef, useState, type ReactElement, type Ref } from 'react';
import type { Airframe, Conditions, Environment, FlightResult, Launch, PaperSpec, PosedModel, Vec3 } from '../../../core/types';
import type { UnitSystem } from '../../../ui/format';
import { Button } from '../../../ui/Button';
import type { CameraMode } from './cameraRig';
import { FallbackStage } from './FallbackStage';
import type { FlightStageEngine } from './FlightStageEngine';
import type { LiveSample } from './playback';
import './stage.css';

export interface FlightStagePlane {
  model: PosedModel;
  paper: PaperSpec;
  airframe: Airframe;
}

export interface FlightStageHandle {
  play(): void;
  pause(): void;
  /** Jump the play head to `t` seconds of flight time. */
  seek(t: number): void;
  getTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
}

export interface FlightStageProps {
  env: Environment;
  /** Wind settings for the windsock and drifting seeds outdoors. */
  conditions?: Conditions;
  plane?: FlightStagePlane | null;
  /** null = ready pose: the plane held at the release point. */
  flight?: FlightResult | null;
  /** Throw shown in the ready pose (nose direction). */
  launch?: Launch;
  /** Faint aiming arc while the player drags to throw. */
  aim?: Launch | null;
  camera?: CameraMode;
  /** Earlier flights as CG paths, newest first. */
  ghosts?: readonly (readonly Vec3[])[];
  /** Playback speed, 1 = real time. */
  rate?: number;
  /** Start playing as soon as a new flight arrives. */
  autoPlay?: boolean;
  /** Screen space covered by overlays, CSS px: the camera frames the plane in the rest. */
  insets?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Drag on the scene orbits the camera. */
  orbit?: boolean;
  units?: UnitSystem;
  reducedMotion?: boolean;
  /** Every frame, with the flight at the play head (reused object: copy what you keep). */
  onFrame?: (sample: LiveSample) => void;
  /** Playback reached the end of the flight. */
  onEnd?: () => void;
  /** Show the SVG fallback even when WebGL2 works (testing). */
  forceFallback?: boolean;
  className?: string;
  /** Accessible description of the scene. */
  label?: string;
  ref?: Ref<FlightStageHandle>;
}

type Mode = 'loading' | 'webgl' | 'fallback';

export function FlightStage(props: FlightStageProps): ReactElement {
  const [mode, setMode] = useState<Mode>(() => (props.forceFallback ? 'fallback' : 'loading'));
  // A lost GPU context is recovered by building a fresh canvas and engine at the same play-head time.
  const [generation, setGeneration] = useState(0);
  const resumeAt = useRef<number | null>(null);
  if (mode === 'fallback') return <FallbackStage {...props} />;
  return (
    <WebGLStage
      key={generation}
      {...props}
      resumeAt={resumeAt}
      onRestart={(t) => {
        resumeAt.current = t;
        setGeneration((g) => g + 1);
      }}
      onUnavailable={() => setMode('fallback')}
      onLoaded={() => setMode('webgl')}
    />
  );
}

interface WebGLStageExtra {
  onUnavailable: () => void;
  onLoaded: () => void;
  onRestart: (time: number) => void;
  resumeAt: { current: number | null };
}

function WebGLStage(props: FlightStageProps & WebGLStageExtra): ReactElement {
  const { env, conditions, plane, flight = null, launch, aim = null, camera = 'chase', ghosts, rate = 1, autoPlay = false, orbit = false, insets, units = 'metric', reducedMotion = false, className, label, ref } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<FlightStageEngine | null>(null);
  const [lost, setLost] = useState(false);
  const cb = useRef(props);
  cb.current = props;

  // Create the engine once; three.js arrives in its own chunk.
  useEffect(() => {
    let disposed = false;
    let created: FlightStageEngine | null = null;
    import('./FlightStageEngine')
      .then((m) => {
        if (disposed || !hostRef.current) return;
        if (!m.isWebGL2Available()) {
          cb.current.onUnavailable();
          return;
        }
        try {
          created = new m.FlightStageEngine(hostRef.current, { reducedMotion: cb.current.reducedMotion, units: cb.current.units });
        } catch {
          cb.current.onUnavailable();
          return;
        }
        created.onFrame = (s) => cb.current.onFrame?.(s);
        created.onEnd = () => cb.current.onEnd?.();
        created.onContextChange = setLost;
        setEngine(created);
        cb.current.onLoaded();
      })
      .catch(() => cb.current.onUnavailable());
    return () => {
      disposed = true;
      created?.dispose();
    };
  }, []);

  useEffect(() => {
    engine?.setEnvironment(env, conditions);
    // Conditions are applied separately below; the scene is only rebuilt for a new place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, env]);
  useEffect(() => {
    if (engine && conditions) engine.setConditions(conditions);
  }, [engine, conditions]);
  useEffect(() => {
    if (engine && plane) engine.setPlane(plane.model, plane.paper, plane.airframe);
  }, [engine, plane]);
  useEffect(() => {
    if (!engine) return;
    engine.setFlight(flight);
    const resume = props.resumeAt.current;
    props.resumeAt.current = null;
    if (flight && resume !== null) engine.setTime(resume);
    else if (flight && autoPlay) engine.play();
    // resumeAt is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, flight, autoPlay]);
  useEffect(() => {
    if (engine && launch) engine.setLaunch(launch);
  }, [engine, launch]);
  useEffect(() => {
    engine?.setAim(aim);
  }, [engine, aim]);
  useEffect(() => {
    engine?.setCamera(camera);
  }, [engine, camera]);
  useEffect(() => {
    engine?.setGhosts(ghosts ?? []);
  }, [engine, ghosts]);
  useEffect(() => {
    engine?.setRate(rate);
  }, [engine, rate]);
  const insetKey = insets ? `${insets.top ?? 0},${insets.right ?? 0},${insets.bottom ?? 0},${insets.left ?? 0}` : '';
  useEffect(() => {
    if (engine && insets) engine.setInsets(insets);
    // Compare by value: callers often pass a fresh object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, insetKey]);
  useEffect(() => {
    engine?.setOrbitEnabled(orbit);
  }, [engine, orbit]);
  useEffect(() => {
    engine?.setUnits(units);
  }, [engine, units]);
  useEffect(() => {
    engine?.setReducedMotion(reducedMotion);
  }, [engine, reducedMotion]);

  useImperativeHandle(
    ref,
    (): FlightStageHandle => ({
      play: () => engine?.play(),
      pause: () => engine?.pause(),
      seek: (t) => engine?.setTime(t),
      getTime: () => engine?.getTime() ?? 0,
      getDuration: () => engine?.getDuration() ?? 0,
      isPlaying: () => engine?.isPlaying() ?? false,
    }),
    [engine],
  );

  return (
    <div ref={hostRef} className={['ppl-stage', className].filter(Boolean).join(' ')} role="img" aria-label={label ?? `3D view of the ${env.name}`}>
      {!engine && <div className="ppl-stage__loading" aria-hidden="true" />}
      {lost && (
        <div className="ppl-stage__lost">
          <p>The 3D view paused to save memory.</p>
          <Button variant="primary" onClick={() => props.onRestart(engine?.getTime() ?? 0)}>
            Restore view
          </Button>
        </div>
      )}
    </div>
  );
}
