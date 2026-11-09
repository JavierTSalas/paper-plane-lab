import type { ReactElement, ReactNode, SVGProps } from 'react';

/* Palette tokens, so every diagram follows the app theme. */
export const C = {
  ink: 'var(--ink)',
  ink2: 'var(--ink-2)',
  ink3: 'var(--ink-3)',
  line: 'var(--line)',
  paper: 'var(--paper)',
  paper2: 'var(--paper-2)',
  card: 'var(--card)',
  accent: 'var(--viz-1)',
  sky: 'var(--viz-2)',
  sage: 'var(--viz-3)',
  plum: 'var(--viz-4)',
  mustard: 'var(--viz-5)',
  rose: 'var(--viz-6)',
  accentWash: 'var(--accent-wash)',
  skyWash: 'var(--sky-wash)',
  sageWash: 'var(--sage-wash)',
  mustardWash: 'var(--mustard-wash)',
  plumWash: 'var(--plum-wash)',
  roseWash: 'var(--rose-wash)',
} as const;

export interface FigureProps {
  width: number;
  height: number;
  /** Accessible description of what the picture shows. */
  label: string;
  children: ReactNode;
}

/** Root of every diagram: scales to its column, keeps its aspect ratio. */
export function Figure({ width, height, label, children }: FigureProps): ReactElement {
  return (
    <svg className="ppl-nb-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ aspectRatio: `${width} / ${height}` }}>
      {children}
    </svg>
  );
}

export interface ArrowProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  width?: number;
  head?: number;
  dashed?: boolean;
}

/** Straight arrow with a filled head at (x2, y2). */
export function Arrow({ x1, y1, x2, y2, color = C.ink, width = 2, head = 8, dashed }: ArrowProps): ReactElement {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const hw = head * 0.55;
  return (
    <g>
      <line x1={x1} y1={y1} x2={bx + ux * 1} y2={by + uy * 1} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dashed ? '5 4' : undefined} />
      <path d={`M${x2},${y2} L${bx - uy * hw},${by + ux * hw} L${bx + uy * hw},${by - ux * hw} Z`} fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />
    </g>
  );
}

export interface ArcArrowProps {
  cx: number;
  cy: number;
  r: number;
  /** Degrees, SVG convention (0 = +x, clockwise positive). */
  from: number;
  to: number;
  color?: string;
  width?: number;
}

/** Circular arc with an arrow head at `to`. */
export function ArcArrow({ cx, cy, r, from, to, color = C.ink, width = 2 }: ArcArrowProps): ReactElement {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const p = (d: number): [number, number] => [cx + r * Math.cos(rad(d)), cy + r * Math.sin(rad(d))];
  const [x1, y1] = p(from);
  const sweep = to > from ? 1 : 0;
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const dir = to > from ? 1 : -1;
  const [ex, ey] = p(to - dir * 6);
  const [x2, y2] = p(to);
  return (
    <g>
      <path d={`M${x1},${y1} A${r},${r} 0 ${large} ${sweep} ${ex},${ey}`} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />
      <Arrow x1={ex} y1={ey} x2={x2} y2={y2} color={color} width={width} head={8} />
    </g>
  );
}

type TextProps = Omit<SVGProps<SVGTextElement>, 'children'> & { children: ReactNode; muted?: boolean; bold?: boolean };

/** Diagram label. */
export function T({ muted, bold, className, children, ...rest }: TextProps): ReactElement {
  const cls = ['ppl-nb-svg__t', muted ? 'is-muted' : '', bold ? 'is-bold' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <text className={cls} {...rest}>
      {children}
    </text>
  );
}

/** Centre-of-gravity symbol: a circle with two filled quarters. */
export function CgMark({ x, y, r = 7 }: { x: number; y: number; r?: number }): ReactElement {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={C.card} stroke={C.ink} strokeWidth={1.6} />
      <path d={`M${x},${y} L${x + r},${y} A${r},${r} 0 0 1 ${x},${y + r} Z`} fill={C.ink} />
      <path d={`M${x},${y} L${x - r},${y} A${r},${r} 0 0 1 ${x},${y - r} Z`} fill={C.ink} />
    </g>
  );
}

/** Neutral-point symbol: an open diamond. */
export function NpMark({ x, y, r = 7, color = C.accent }: { x: number; y: number; r?: number; color?: string }): ReactElement {
  return <path d={`M${x},${y - r} L${x + r},${y} L${x},${y + r} L${x - r},${y} Z`} fill={C.card} stroke={color} strokeWidth={2} strokeLinejoin="round" />;
}

/** Polyline path from points. */
export function pathOf(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

/** Rotate a point about a centre by degrees (SVG convention). */
export function rot(x: number, y: number, cx: number, cy: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}
