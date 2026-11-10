/**
 * No WebGL2: the same flight as a flat SVG side view (height over distance), played back in real time.
 */
import { useEffect, useImperativeHandle, useMemo, useRef, type ReactElement } from 'react';
import { terrainHeight } from '../../../core/env';
import type { Environment, FlightResult } from '../../../core/types';
import { createLiveSample, flightDuration, PlaybackClock, sampleInto } from './playback';
import type { FlightStageHandle, FlightStageProps } from './FlightStage';

const W = 400;
const H = 220;
const PAD = 16;

interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function viewFor(env: Environment, flight: FlightResult | null): View {
  let x1 = env.bounds ? env.bounds.xMax : 30;
  let y1 = env.bounds ? env.bounds.ceiling : 6;
  let y0 = 0;
  let x0 = env.bounds ? env.bounds.xMin : -3;
  if (flight) {
    for (const s of flight.samples) {
      if (!env.bounds) x1 = Math.max(x1, s.pos[0] + 2);
      y1 = Math.max(y1, s.pos[1] + 1);
      y0 = Math.min(y0, s.pos[1] - 1);
      x0 = Math.min(x0, s.pos[0] - 1);
    }
  }
  for (let x = x0; x <= x1; x += (x1 - x0) / 40) y0 = Math.min(y0, terrainHeight(env.terrain, x) - 0.5);
  // Keep metres square.
  const sx = (W - 2 * PAD) / (x1 - x0);
  const sy = (H - 2 * PAD) / (y1 - y0);
  if (sy > sx) y1 = y0 + (H - 2 * PAD) / sx;
  else x1 = x0 + (W - 2 * PAD) / sy;
  return { x0, x1, y0, y1 };
}

export function FallbackStage({ env, flight = null, rate = 1, autoPlay = false, onFrame, onEnd, className, label, ref }: FlightStageProps): ReactElement {
  const clock = useRef(new PlaybackClock());
  const sample = useRef(createLiveSample());
  const planeRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPolylineElement>(null);
  const cb = useRef({ onFrame, onEnd });
  cb.current = { onFrame, onEnd };
  const view = useMemo(() => viewFor(env, flight), [env, flight]);
  const sx = (x: number): number => PAD + ((x - view.x0) / (view.x1 - view.x0)) * (W - 2 * PAD);
  const sy = (y: number): number => H - PAD - ((y - view.y0) / (view.y1 - view.y0)) * (H - 2 * PAD);

  const points = useMemo(() => (flight ? flight.samples.filter((_, i) => i % 4 === 0).map((s) => [s.pos[0], s.pos[1]] as const) : []), [flight]);
  const ground = useMemo(() => {
    const pts: string[] = [];
    const n = 80;
    for (let i = 0; i <= n; i++) {
      const x = view.x0 + ((view.x1 - view.x0) * i) / n;
      pts.push(`${sx(x).toFixed(1)},${sy(terrainHeight(env.terrain, x)).toFixed(1)}`);
    }
    return `${PAD},${H} ${pts.join(' ')} ${W - PAD},${H}`;
    // sx / sy depend only on view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env, view]);

  useEffect(() => {
    clock.current.reset(flightDuration(flight));
    if (flight && autoPlay) clock.current.play();
  }, [flight, autoPlay]);

  useEffect(() => {
    clock.current.rate = rate;
  }, [rate]);

  useImperativeHandle(ref, (): FlightStageHandle => ({
    play: () => clock.current.play(),
    pause: () => {
      clock.current.playing = false;
    },
    seek: (t) => clock.current.seek(t),
    getTime: () => clock.current.t,
    getDuration: () => clock.current.duration,
    isPlaying: () => clock.current.playing,
  }), []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const ended = clock.current.tick(dt);
      const s = sample.current;
      if (flight) sampleInto(flight, clock.current.t, s);
      else {
        s.pos[0] = env.launch[0];
        s.pos[1] = env.launch[1];
        s.pos[2] = env.launch[2];
      }
      const px = sx(s.pos[0]);
      const py = sy(s.pos[1]);
      const pitch = flight ? (-Math.atan2(s.vel[1], Math.hypot(s.vel[0], s.vel[2])) * 180) / Math.PI : 0;
      planeRef.current?.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${pitch.toFixed(1)})`);
      if (pathRef.current && flight) {
        const shown = points.filter((_, i) => i * 4 <= Math.round(clock.current.t * flight.sampleHz));
        pathRef.current.setAttribute('points', shown.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' '));
      }
      cb.current.onFrame?.(s);
      if (ended) cb.current.onEnd?.();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight, env, view, points]);

  const ticks: number[] = [];
  const step = view.x1 - view.x0 > 60 ? 10 : view.x1 - view.x0 > 20 ? 5 : 1;
  for (let x = 0; x <= view.x1; x += step) ticks.push(x);

  return (
    <div className={['ppl-stage', 'ppl-stage--fallback', className].filter(Boolean).join(' ')} role="img" aria-label={label ?? `Side view of the flight in the ${env.name}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="ppl-stage__svg">
        <rect x="0" y="0" width={W} height={H} fill={env.indoor ? '#efe2c8' : '#dfeaf3'} />
        <polygon points={ground} fill={env.indoor ? '#d3a777' : '#9fc27c'} />
        {ticks.map((x) => (
          <g key={x}>
            <line x1={sx(x)} x2={sx(x)} y1={sy(terrainHeight(env.terrain, x))} y2={sy(terrainHeight(env.terrain, x)) + 4} stroke="#2f2e2b" strokeWidth="1" />
            <text x={sx(x)} y={Math.min(H - 2, sy(terrainHeight(env.terrain, x)) + 13)} fontSize="8" textAnchor="middle" fill="#2f2e2b">
              {x}
            </text>
          </g>
        ))}
        <polyline ref={pathRef} fill="none" stroke="#d9694c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <g ref={planeRef}>
          <path d="M8 0 L-7 -3 L-4 0 L-7 3 Z" fill="#fffaf0" stroke="#2f2e2b" strokeWidth="1.2" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}
