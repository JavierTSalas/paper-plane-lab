import type { ReactElement } from 'react';
import { Arrow, C, CgMark, Figure, pathOf, rot, T } from './kit';

/** how-it-works: the five stages of the simulation. */
export function SimPipeline(): ReactElement {
  const labels = ['Fold', 'Mass + CG', 'Strips', 'Forces', 'Wind'];
  const x0 = 12;
  const w = 56;
  const gap = 14;
  const y = 18;
  const tiles = [
    // Fold: sheet with dart creases
    <g key="fold">
      <rect x={10} y={8} width={36} height={42} rx={2} fill={C.card} stroke={C.ink} strokeWidth={1.6} />
      <path d="M28,8 L28,50 M28,8 L10,26 M28,8 L46,26" stroke={C.sky} strokeWidth={1.6} strokeDasharray="4 3" fill="none" />
    </g>,
    // Mass: dart with CG
    <g key="mass">
      <path d="M28,6 L46,50 L10,50 Z" fill={C.mustardWash} stroke={C.ink} strokeWidth={1.6} strokeLinejoin="round" />
      <CgMark x={28} y={36} r={5} />
    </g>,
    // Strips
    <g key="strips">
      <path d="M28,6 L46,50 L10,50 Z" fill={C.skyWash} stroke={C.ink} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M16,36 L16,50 M22,22 L22,50 M34,22 L34,50 M40,36 L40,50" stroke={C.sky} strokeWidth={1.4} />
    </g>,
    // Forces on a plate
    <g key="forces">
      <path d="M8,40 L48,32" stroke={C.ink} strokeWidth={2.4} strokeLinecap="round" />
      <Arrow x1={28} y1={36} x2={31} y2={8} color={C.accent} />
      <Arrow x1={28} y1={36} x2={12} y2={39} color={C.ink2} head={6} />
    </g>,
    // Wind
    <g key="wind">
      <path d="M6,18 C16,12 24,24 34,18 S48,14 50,16 M6,32 C16,26 24,38 34,32 S48,28 50,30 M6,46 C16,40 24,52 34,46 S48,42 50,44" stroke={C.sage} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </g>,
  ];
  return (
    <Figure width={360} height={108} label="Five stages: fold geometry, then mass and centre of gravity, then flat-plate strips, then forces and motion, then wind.">
      {tiles.map((tile, i) => {
        const x = x0 + i * (w + gap);
        return (
          <g key={labels[i]}>
            <rect x={x} y={y} width={w} height={w} rx={12} fill={C.paper2} stroke={C.line} strokeWidth={1.5} />
            <g transform={`translate(${x},${y})`}>{tile}</g>
            <T x={x + w / 2} y={y + w + 18} textAnchor="middle" bold>
              {labels[i]}
            </T>
            <T x={x + w / 2} y={12} textAnchor="middle" muted>
              {i + 1}
            </T>
            {i < 4 && <Arrow x1={x + w + 2} y1={y + w / 2} x2={x + w + gap - 2} y2={y + w / 2} color={C.ink2} width={1.6} head={6} />}
          </g>
        );
      })}
    </Figure>
  );
}

/** lift-and-drag: a flat plate at angle of attack, normal force split into lift and drag. */
export function AngleOfAttack(): ReactElement {
  const cx = 190;
  const cy = 118;
  const a = 14;
  const half = 82;
  const rad = (a * Math.PI) / 180;
  // Leading edge left and high, trailing edge right and low: the plate's normal tilts back, downstream.
  const le2 = rot(cx - half, cy, cx, cy, a);
  const te2 = rot(cx + half, cy, cx, cy, a);
  const n = 84;
  const nEnd: [number, number] = [cx + n * Math.sin(rad), cy - n * Math.cos(rad)];
  const lift: [number, number] = [cx, cy - n * Math.cos(rad)];
  const drag: [number, number] = [cx + n * Math.sin(rad), cy];
  const flowYs = [46, 76, 160, 186];
  const arcR = 48;
  return (
    <Figure width={360} height={210} label="A flat plate tilted nose-up into a horizontal airflow. The force on it acts at right angles to the plate, tilted back; its vertical part is lift and its horizontal part is drag.">
      {flowYs.map((y) => (
        <Arrow key={y} x1={8} y1={y} x2={70} y2={y} color={C.sky} width={1.6} head={6} />
      ))}
      <T x={8} y={118} muted>
        airflow
      </T>
      {/* reference line along the flow through the leading edge */}
      <line x1={le2[0]} y1={le2[1]} x2={le2[0] + arcR + 40} y2={le2[1]} stroke={C.ink3} strokeWidth={1.2} strokeDasharray="4 4" />
      <path
        d={`M${le2[0] + arcR},${le2[1]} A${arcR},${arcR} 0 0 1 ${le2[0] + arcR * Math.cos(rad)},${le2[1] + arcR * Math.sin(rad)}`}
        fill="none"
        stroke={C.ink2}
        strokeWidth={1.5}
      />
      <T x={le2[0] + arcR + 6} y={le2[1] + 14} bold>
        α
      </T>
      {/* separated flow curl at the sharp leading edge */}
      <path d={`M${le2[0]},${le2[1]} C${le2[0] + 10},${le2[1] - 18} ${le2[0] + 40},${le2[1] - 16} ${le2[0] + 52},${le2[1] - 2}`} stroke={C.sky} strokeWidth={1.4} fill="none" strokeDasharray="3 3" />
      {/* the plate */}
      <line x1={le2[0]} y1={le2[1]} x2={te2[0]} y2={te2[1]} stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
      <T x={le2[0] - 4} y={le2[1] - 10} textAnchor="end" muted>
        sharp edge
      </T>
      {/* components */}
      <line x1={lift[0]} y1={lift[1]} x2={nEnd[0]} y2={nEnd[1]} stroke={C.ink3} strokeWidth={1.2} strokeDasharray="3 3" />
      <line x1={drag[0]} y1={drag[1]} x2={nEnd[0]} y2={nEnd[1]} stroke={C.ink3} strokeWidth={1.2} strokeDasharray="3 3" />
      <Arrow x1={cx} y1={cy} x2={lift[0]} y2={lift[1]} color={C.sage} width={2} />
      <Arrow x1={cx} y1={cy} x2={drag[0] + 6} y2={drag[1]} color={C.plum} width={2} head={7} />
      <Arrow x1={cx} y1={cy} x2={nEnd[0]} y2={nEnd[1]} color={C.accent} width={2.6} />
      <T x={nEnd[0] + 8} y={nEnd[1] + 6} bold>
        force on plate
      </T>
      <T x={lift[0] - 8} y={lift[1] + 12} textAnchor="end">
        lift
      </T>
      <T x={drag[0] + 14} y={drag[1] + 4}>
        drag
      </T>
    </Figure>
  );
}

function SidePlane({ x, y, deg, scale = 1 }: { x: number; y: number; deg: number; scale?: number }): ReactElement {
  return (
    <g transform={`translate(${x},${y}) rotate(${deg}) scale(${scale})`}>
      <path d="M44,0 L-40,-5 L-38,2 Z" fill={C.card} stroke={C.ink} strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M44,0 L-38,2 L-34,13 Z" fill={C.mustardWash} stroke={C.ink} strokeWidth={1.8} strokeLinejoin="round" />
    </g>
  );
}

/** lift-and-drag: forces on a steady glide. */
export function GlideForces(): ReactElement {
  const g = 12;
  const rad = (g * Math.PI) / 180;
  const cx = 170;
  const cy = 92;
  const W = 92;
  const L = W * Math.cos(rad);
  const D = W * Math.sin(rad);
  const v: [number, number] = [Math.cos(rad), Math.sin(rad)];
  const up: [number, number] = [v[1], -v[0]];
  const pathStart: [number, number] = [cx - 160 * v[0], cy - 160 * v[1]];
  const pathEnd: [number, number] = [cx + 175 * v[0], cy + 175 * v[1]];
  return (
    <Figure width={360} height={210} label="A plane gliding down a shallow slope. Lift points at right angles to the path, drag points backward along it, and weight points straight down. The three balance.">
      <line x1={pathStart[0]} y1={pathStart[1]} x2={pathEnd[0]} y2={pathEnd[1]} stroke={C.ink3} strokeWidth={1.4} strokeDasharray="6 5" />
      <line x1={250} y1={cy + 80 * v[1] + 0} x2={340} y2={cy + 80 * v[1]} stroke={C.ink3} strokeWidth={1.2} />
      <path d={`M${290},${cy + 80 * v[1]} A40,40 0 0 1 ${250 + 40 * v[0]},${cy + 80 * v[1] + 40 * v[1]}`} fill="none" stroke={C.ink2} strokeWidth={1.4} />
      <T x={296} y={cy + 80 * v[1] + 16} bold>
        γ
      </T>
      <SidePlane x={cx} y={cy} deg={g} />
      <Arrow x1={cx} y1={cy} x2={cx + L * up[0]} y2={cy + L * up[1]} color={C.sage} width={2.4} />
      <Arrow x1={cx} y1={cy} x2={cx - (D + 10) * v[0]} y2={cy - (D + 10) * v[1]} color={C.plum} width={2.4} head={7} />
      <Arrow x1={cx} y1={cy} x2={cx} y2={cy + W} color={C.ink} width={2.4} />
      <CgMark x={cx} y={cy} r={5} />
      <T x={cx + L * up[0] + 8} y={cy + L * up[1] + 4} bold>
        lift
      </T>
      <T x={cx - (D + 10) * v[0] - 8} y={cy - (D + 10) * v[1] - 6} textAnchor="end" bold>
        drag
      </T>
      <T x={cx + 8} y={cy + W - 2} bold>
        weight
      </T>
      <T x={pathEnd[0] - 4} y={pathEnd[1] - 8} textAnchor="end" muted>
        flight path
      </T>
    </Figure>
  );
}

/* Sketch curves in the spirit of the model: linear lift to stall, Polhamus vortex lift for the dart, then a flat-plate post-stall curve. */
function plateCL(aDeg: number): number {
  const a = (aDeg * Math.PI) / 180;
  const cn = (1.17 * Math.sin(a)) / (0.56 + 0.44 * Math.sin(a));
  return cn * Math.cos(a);
}
function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
function gliderCL(aDeg: number): number {
  const stall = 13;
  const attached = 3.33 * (Math.min(aDeg, stall) * Math.PI) / 180;
  const t = smooth((aDeg - stall) / 6);
  return attached * (1 - t) + plateCL(aDeg) * t;
}
function dartCL(aDeg: number): number {
  const stall = 38;
  const attached = (aD: number): number => {
    const r = (aD * Math.PI) / 180;
    return (1.34 * Math.sin(r) * Math.cos(r) + 2.84 * Math.sin(r) ** 2) * Math.cos(r);
  };
  const t = smooth((aDeg - stall) / 20);
  return attached(Math.min(aDeg, stall)) * (1 - t) + plateCL(aDeg) * t;
}

/** lift-and-drag: sketch of lift coefficient against angle of attack. */
export function LiftCurve(): ReactElement {
  const X0 = 46;
  const X1 = 340;
  const Y0 = 186;
  const Y1 = 18;
  const aMax = 60;
  const cMax = 1.6;
  const px = (a: number): number => X0 + ((X1 - X0) * a) / aMax;
  const py = (c: number): number => Y0 - ((Y0 - Y1) * c) / cMax;
  const sample = (f: (a: number) => number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let a = 0; a <= aMax; a += 0.5) pts.push([px(a), py(f(a))]);
    return pts;
  };
  const gStall = 13;
  const dStall = 38;
  return (
    <Figure width={360} height={214} label="Sketch: lift coefficient against angle of attack. The glider-like wing rises steeply to about 0.75 and stalls near 13 degrees. The dart rises slowly but keeps rising to about 1.36 near 38 degrees.">
      {[0.4, 0.8, 1.2, 1.6].map((c) => (
        <g key={c}>
          <line x1={X0} x2={X1} y1={py(c)} y2={py(c)} stroke="var(--viz-grid)" strokeWidth={1} />
          <T x={X0 - 6} y={py(c) + 4} textAnchor="end" muted className="ppl-nb-svg__num">
            {c.toFixed(1)}
          </T>
        </g>
      ))}
      {[0, 10, 20, 30, 40, 50, 60].map((a) => (
        <T key={a} x={px(a)} y={Y0 + 16} textAnchor="middle" muted className="ppl-nb-svg__num">
          {a}°
        </T>
      ))}
      <line x1={X0} x2={X1} y1={Y0} y2={Y0} stroke="var(--viz-axis)" strokeWidth={1.4} />
      <T x={X1} y={Y0 + 30} textAnchor="end" muted>
        angle of attack
      </T>
      <T x={X0 - 6} y={Y1 - 4} textAnchor="end" muted>
        C_L
      </T>
      <path d={pathOf(sample(gliderCL))} fill="none" stroke={C.sky} strokeWidth={2.4} strokeLinejoin="round" />
      <path d={pathOf(sample(dartCL))} fill="none" stroke={C.accent} strokeWidth={2.4} strokeLinejoin="round" strokeDasharray="7 4" />
      <circle cx={px(gStall)} cy={py(gliderCL(gStall))} r={4} fill={C.sky} />
      <circle cx={px(dStall)} cy={py(dartCL(dStall))} r={4} fill={C.accent} />
      <T x={px(gStall) + 6} y={py(gliderCL(gStall)) - 8}>
        glider stalls ≈ 13°
      </T>
      <T x={px(dStall)} y={py(dartCL(dStall)) - 10} textAnchor="middle">
        dart ≈ 38°
      </T>
      <T x={px(52)} y={py(plateCL(52)) - 10} textAnchor="middle" muted>
        flat-plate drop
      </T>
    </Figure>
  );
}
