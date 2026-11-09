import { useId, useMemo, useRef, type ReactElement } from 'react';
import type { PosedModel, TunnelReading, Vec3 } from '../../core/types';
import { useElementWidth } from '../../ui/hooks';
import { useReducedMotion } from '../../ui/motion';
import { fixed } from '../../ui/format';
import { flowPicture, pathData, type Pt } from './flow';
import { bodyToPicture, sideSilhouette } from './silhouette';

export interface TunnelViewProps {
  model: PosedModel;
  cg: Vec3;
  reading: TunnelReading;
  /** Weight, newtons. */
  weight: number;
  stalled: boolean;
  /** Formatted airspeed for the wind label. */
  speedText: string;
}

/* Picture window, in plane lengths, CG at the origin. */
const X0 = -1.5;
const X1 = 1.5;
const Y0 = -0.95;
const Y1 = 0.95;
const WALL = 0.06;
const SEED_GAP = 0.105;
const DEG = Math.PI / 180;

const svg = (p: Pt): Pt => [p[0], -p[1]];

interface ArrowSpec {
  from: Pt;
  /** Picture-frame vector. */
  vec: Pt;
  tone: 'lift' | 'drag' | 'weight';
  label: string;
  /** Where the label sits relative to the tip. */
  anchor: 'above' | 'right' | 'below';
}

function Arrow({ a, unit }: { a: ArrowSpec; unit: number }): ReactElement | null {
  const len = Math.hypot(a.vec[0], a.vec[1]);
  const head = Math.min(9 * unit, len * 0.6);
  const tip: Pt = [a.from[0] + a.vec[0], a.from[1] + a.vec[1]];
  const ux = len > 0 ? a.vec[0] / len : 0;
  const uy = len > 0 ? a.vec[1] / len : 1;
  const base: Pt = [tip[0] - ux * head, tip[1] - uy * head];
  const w = head * 0.55;
  const left: Pt = [base[0] - uy * w, base[1] + ux * w];
  const right: Pt = [base[0] + uy * w, base[1] - ux * w];
  const [tx, ty] = svg(tip);
  const fs = 12.5 * unit;
  const lx = a.anchor === 'right' ? tx + 6 * unit : tx;
  const ly = a.anchor === 'above' ? ty - 7 * unit : a.anchor === 'below' ? ty + fs + 4 * unit : ty + fs * 0.35;
  return (
    <g className={`ppl-tunnel__arrow is-${a.tone}`}>
      {len > head * 1.05 && <path d={pathData([a.from, base], svg)} strokeWidth={3 * unit} />}
      <path d={pathData([tip, left, right], svg) + 'Z'} className="ppl-tunnel__head" />
      <text x={lx} y={ly} fontSize={fs} textAnchor={a.anchor === 'right' ? 'start' : 'middle'} strokeWidth={3.5 * unit}>
        {a.label}
      </text>
    </g>
  );
}

/** Side view of the test section: smoke streamlines, the plane on its sting, and the forces drawn to scale. */
export function TunnelView({ model, cg, reading, weight, stalled, speedText }: TunnelViewProps): ReactElement {
  const wrap = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrap, 360);
  const reduced = useReducedMotion();
  const clipId = `ppl-tunnel-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // Picture units per CSS pixel, so text and strokes keep their screen size at any width.
  const unit = (X1 - X0) / Math.max(200, width);
  const alpha = reading.alphaDeg * DEG;
  const length = model.length || 1;

  const pieces = useMemo(() => sideSilhouette(model, cg, alpha), [model, cg, alpha]);
  // The 2D plate stands in for the plane's chord: from tail to nose along the body axis through the CG.
  const plateCentre = useMemo(() => bodyToPicture([length / 2, cg[1]], cg, length, alpha), [length, cg, alpha]);
  const flow = useMemo(() => {
    const seeds: number[] = [];
    for (let y = Y0 - 0.2; y <= Y1 + 0.2; y += SEED_GAP) seeds.push(y - plateCentre[1]);
    return flowPicture({
      alphaRad: alpha,
      cl: reading.cl,
      stalled,
      xMin: X0 - 0.1 - plateCentre[0],
      xMax: X1 + 0.1 - plateCentre[0],
      seeds,
    });
  }, [alpha, reading.cl, stalled, plateCentre]);
  const shift = (p: Pt): Pt => svg([p[0] + plateCentre[0], p[1] + plateCentre[1]]);

  // One scale for every force: weight about 0.4 plane lengths, shrunk if lift or drag would leave the window.
  const biggest = Math.max(weight, Math.abs(reading.lift), Math.abs(reading.drag), 1e-9);
  const scale = Math.min(0.4 / weight, 0.62 / biggest);
  const cp: Pt = reading.cpX === null ? [0, 0] : bodyToPicture([reading.cpX, cg[1]], cg, length, alpha);
  const mN = (n: number): string => `${fixed(n * 1000, 0)} mN`;
  const arrows: ArrowSpec[] = [
    { from: [0, 0], vec: [0, -weight * scale], tone: 'weight', label: `Weight ${mN(weight)}`, anchor: 'below' },
    { from: cp, vec: [0, reading.lift * scale], tone: 'lift', label: `Lift ${mN(reading.lift)}`, anchor: reading.lift >= 0 ? 'above' : 'below' },
    { from: cp, vec: [reading.drag * scale, 0], tone: 'drag', label: `Drag ${mN(reading.drag)}`, anchor: 'right' },
  ];

  // Pitching moment: a curved arrow round the CG, clockwise on screen (nose-left) when nose-up.
  const noseUp = reading.cm > 0;
  const showMoment = Math.abs(reading.cm) > 0.004;
  const r = 0.13;
  const arcFrom = noseUp ? 200 : -20;
  const arcTo = noseUp ? 110 : 70;
  const arcPts: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = (arcFrom + ((arcTo - arcFrom) * i) / 16) * DEG;
    arcPts.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  const arcEnd = arcPts[arcPts.length - 1]!;
  const arcPrev = arcPts[arcPts.length - 2]!;

  const smokeDur = `${(2.6 / Math.sqrt(Math.max(1, reading.speed))).toFixed(2)}s`;
  const label = `Side view of the test section at ${speedText} and ${fixed(reading.alphaDeg, 0)} degrees angle of attack. ${
    stalled ? 'The flow has separated from the top of the plane and a wavy wake trails behind it.' : 'Smoke lines bend smoothly around the plane.'
  } Lift ${mN(reading.lift)}, drag ${mN(reading.drag)}, weight ${mN(weight)}.`;

  return (
    <div ref={wrap} className="ppl-tunnel__view">
      <svg viewBox={`${X0} ${-Y1} ${X1 - X0} ${Y1 - Y0}`} width="100%" role="img" aria-label={label} className="ppl-tunnel__svg">
        <defs>
          <clipPath id={clipId}>
            <rect x={X0} y={-Y1 + WALL} width={X1 - X0} height={Y1 - Y0 - 2 * WALL} />
          </clipPath>
        </defs>
        <rect x={X0} y={-Y1} width={X1 - X0} height={Y1 - Y0} className="ppl-tunnel__air" />

        <g clipPath={`url(#${clipId})`}>
          <g className="ppl-tunnel__streams" strokeWidth={1.6 * unit}>
            {flow.streamlines.map((l, i) => (
              <path key={i} d={pathData(l, shift)} />
            ))}
          </g>
          <g
            className={reduced ? 'ppl-tunnel__smoke' : 'ppl-tunnel__smoke is-moving'}
            strokeWidth={4 * unit}
            strokeDasharray="0.05 0.11"
          >
            {flow.streamlines.map((l, i) => (
              <path key={i} d={pathData(l, shift)} style={{ animationDuration: smokeDur }} strokeDashoffset={(i % 3) * 0.05} />
            ))}
          </g>
          {flow.eddies.length > 0 && (
            <g className={reduced ? 'ppl-tunnel__eddy' : 'ppl-tunnel__eddy is-moving'} strokeWidth={2.2 * unit} strokeDasharray="0.04 0.05">
              {flow.eddies.map((l, i) => (
                <path key={i} d={pathData(l, shift)} style={{ animationDuration: smokeDur }} />
              ))}
            </g>
          )}

          {/* Sting: a strut from the floor to the CG pivot. */}
          <path d={`M${0.42} ${-Y0} L0 0`} className="ppl-tunnel__sting" strokeWidth={5 * unit} />

          <g className="ppl-tunnel__plane" strokeWidth={1.2 * unit}>
            {pieces.map((p) => (
              <path key={p.id} d={pathData(p.points, svg) + 'Z'} fill={p.fill} className={p.far ? 'is-far' : undefined} />
            ))}
          </g>

          {showMoment && (
            <g className="ppl-tunnel__moment" strokeWidth={2 * unit}>
              <path d={pathData(arcPts, svg)} />
              <Arrow
                a={{ from: arcPrev, vec: [(arcEnd[0] - arcPrev[0]) * 1.0001, (arcEnd[1] - arcPrev[1]) * 1.0001], tone: 'weight', label: '', anchor: 'right' }}
                unit={unit * 0.8}
              />
            </g>
          )}

          {arrows.map((a) => (
            <Arrow key={a.tone} a={a} unit={unit} />
          ))}

          {/* CG pivot: the classic quartered balance mark. */}
          <g className="ppl-tunnel__cg" strokeWidth={1.2 * unit}>
            <circle cx={0} cy={0} r={6 * unit} />
            <path d={`M0 0 L${6 * unit} 0 A${6 * unit} ${6 * unit} 0 0 1 0 ${6 * unit} Z M0 0 L${-6 * unit} 0 A${6 * unit} ${6 * unit} 0 0 1 0 ${-6 * unit} Z`} />
          </g>
          {reading.cpX !== null && <circle cx={cp[0]} cy={-cp[1]} r={3.5 * unit} className="ppl-tunnel__cp" />}
        </g>

        <rect x={X0} y={-Y1} width={X1 - X0} height={WALL} className="ppl-tunnel__wall" />
        <rect x={X0} y={-Y0 - WALL} width={X1 - X0} height={WALL} className="ppl-tunnel__wall" />
        <text x={X0 + 10 * unit} y={-Y1 + WALL + 18 * unit} fontSize={12.5 * unit} className="ppl-tunnel__caption" strokeWidth={3.5 * unit}>
          Wind {speedText} →
        </text>
        <text x={X0 + 10 * unit} y={-Y1 + WALL + 34 * unit} fontSize={12.5 * unit} className="ppl-tunnel__caption" strokeWidth={3.5 * unit}>
          α {fixed(reading.alphaDeg, 0)}°{stalled ? ' · stalled' : ''}
        </text>
      </svg>
    </div>
  );
}
