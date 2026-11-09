import type { ReactElement } from 'react';
import { Arrow, C, Figure, pathOf, T } from './kit';

/** reynolds: a log scale of Reynolds numbers. */
export function ReynoldsScale(): ReactElement {
  const X0 = 26;
  const X1 = 334;
  const lo = 2;
  const hi = 8;
  const px = (log10: number): number => X0 + ((X1 - X0) * (log10 - lo)) / (hi - lo);
  const bands: { from: number; to: number; row: number; label: string; color: string; wash: string; strong?: boolean }[] = [
    { from: 2, to: 3, row: 0, label: 'fruit fly', color: C.plum, wash: C.plumWash },
    { from: Math.log10(7e3), to: Math.log10(2.5e5), row: 1, label: 'paper plane', color: C.accent, wash: C.accentWash, strong: true },
    { from: 5, to: Math.log10(5e5), row: 2, label: 'model glider', color: C.sage, wash: C.sageWash },
    { from: 7, to: 8, row: 0, label: 'airliner wing', color: C.sky, wash: C.skyWash },
  ];
  const glide = [Math.log10(2e4), Math.log10(6e4)];
  return (
    <Figure width={360} height={170} label="Reynolds number scale from 100 to 100 million. A fruit fly is near a few hundred, a paper plane between about seven thousand and a quarter of a million with its glide near twenty to sixty thousand, a model glider near a hundred thousand and more, an airliner wing in the tens of millions.">
      {bands.map((b) => {
        const y = 22 + b.row * 34;
        return (
          <g key={b.label}>
            <rect x={px(b.from)} y={y} width={px(b.to) - px(b.from)} height={18} rx={9} fill={b.wash} stroke={b.color} strokeWidth={b.strong ? 2 : 1.4} />
            <T x={b.from >= 6.5 ? px(b.to) : px(b.from)} y={y - 5} textAnchor={b.from >= 6.5 ? 'end' : 'start'} bold={b.strong}>
              {b.label}
            </T>
          </g>
        );
      })}
      <rect x={px(glide[0])} y={22 + 34 + 3} width={px(glide[1]) - px(glide[0])} height={12} rx={6} fill={C.accent} />
      <T x={(px(glide[0]) + px(glide[1])) / 2} y={22 + 34 + 31} textAnchor="middle" muted>
        glide
      </T>
      <line x1={X0} x2={X1} y1={132} y2={132} stroke={C.ink} strokeWidth={1.6} />
      {[2, 3, 4, 5, 6, 7, 8].map((e) => (
        <g key={e}>
          <line x1={px(e)} x2={px(e)} y1={127} y2={137} stroke={C.ink} strokeWidth={1.6} />
          <T x={px(e)} y={154} textAnchor="middle" className="ppl-nb-svg__num">
            10{['²', '³', '⁴', '⁵', '⁶', '⁷', '⁸'][e - 2]}
          </T>
        </g>
      ))}
    </Figure>
  );
}

/** wind: the logarithmic wind profile over grass. */
export function WindProfile(): ReactElement {
  const ground = 200;
  const top = 26;
  const pxPerM = (ground - top) / 10;
  const x0 = 52;
  const scale = 250;
  const z0 = 0.03;
  const u = (z: number): number => Math.log(z / z0) / Math.log(10 / z0);
  const curve: [number, number][] = [];
  for (let z = 0.08; z <= 10.001; z *= 1.08) curve.push([x0 + scale * Math.max(0, u(z)), ground - z * pxPerM]);
  curve.push([x0 + scale, top]);
  const arrows = [0.5, 1, 2, 4, 7, 10];
  return (
    <Figure width={360} height={226} label="Wind speed against height over grass. Arrows grow longer with height. At 2 metres the wind is about 0.72 of its 10 metre value.">
      <rect x={0} y={ground} width={360} height={26} fill={C.sageWash} />
      <path d={`M0,${ground} L360,${ground}`} stroke={C.sage} strokeWidth={2} />
      {Array.from({ length: 22 }, (_, i) => (
        <path key={i} d={`M${12 + i * 16},${ground} l-3,-7 M${12 + i * 16},${ground} l3,-8`} stroke={C.sage} strokeWidth={1.4} strokeLinecap="round" />
      ))}
      <line x1={x0} x2={x0} y1={ground} y2={top - 6} stroke={C.ink} strokeWidth={1.6} />
      {[2, 4, 6, 8, 10].map((z) => (
        <T key={z} x={x0 - 8} y={ground - z * pxPerM + 4} textAnchor="end" muted className="ppl-nb-svg__num">
          {z} m
        </T>
      ))}
      <path d={pathOf(curve)} fill="none" stroke={C.ink3} strokeWidth={1.4} strokeDasharray="4 4" />
      {arrows.map((z) => {
        const y = ground - z * pxPerM;
        const len = scale * u(z);
        const hl = z === 2 || z === 10;
        return <Arrow key={z} x1={x0} y1={y} x2={x0 + len} y2={y} color={hl ? C.sky : C.ink2} width={hl ? 2.4 : 1.6} head={hl ? 8 : 6} />;
      })}
      <T x={x0 + scale * u(10) - 4} y={top - 6} textAnchor="end" bold>
        U₁₀
      </T>
      <T x={x0 + scale * u(2) + 8} y={ground - 2 * pxPerM + 4} bold>
        0.72 × U₁₀
      </T>
      <g transform={`translate(${x0 + 200},${ground - 1.5 * pxPerM}) scale(0.5)`}>
        <path d="M30,0 L-30,-6 L-28,2 Z M30,0 L-28,2 L-24,12 Z" fill={C.card} stroke={C.ink} strokeWidth={2.4} strokeLinejoin="round" />
      </g>
    </Figure>
  );
}

/** wind: a thermal and slope lift. */
export function SlopeLift(): ReactElement {
  const ground = 176;
  const hill = `M150,${ground} C200,${ground} 240,92 300,82 L360,80 L360,${ground} Z`;
  const flows = [150, 124, 98];
  return (
    <Figure width={360} height={196} label="Left: a bubble of warm air rising from sunny ground, a thermal. Right: wind blowing toward a slope is pushed upward over it, slope lift.">
      <rect x={0} y={ground} width={360} height={20} fill={C.sageWash} />
      <rect x={24} y={ground - 4} width={110} height={8} rx={4} fill={C.mustardWash} stroke={C.mustard} strokeWidth={1.4} />
      <circle cx={30} cy={30} r={11} fill={C.mustardWash} stroke={C.mustard} strokeWidth={2} />
      {[0, 60, 120, 180, 240, 300].map((a) => {
        const r = (a * Math.PI) / 180;
        return <line key={a} x1={30 + 15 * Math.cos(r)} y1={30 + 15 * Math.sin(r)} x2={30 + 20 * Math.cos(r)} y2={30 + 20 * Math.sin(r)} stroke={C.mustard} strokeWidth={2} strokeLinecap="round" />;
      })}
      <ellipse cx={80} cy={96} rx={40} ry={30} fill={C.roseWash} stroke={C.rose} strokeWidth={1.6} strokeDasharray="5 4" />
      <Arrow x1={64} y1={160} x2={64} y2={118} color={C.rose} width={2} />
      <Arrow x1={80} y1={112} x2={80} y2={70} color={C.rose} width={2.4} />
      <Arrow x1={96} y1={160} x2={96} y2={118} color={C.rose} width={2} />
      <T x={80} y={56} textAnchor="middle" bold>
        thermal
      </T>
      <path d={hill} fill={C.sageWash} stroke={C.sage} strokeWidth={2} strokeLinejoin="round" />
      {flows.map((y, i) => {
        const rise = (ground - 82) * (1 - i * 0.28);
        const endY = y - rise * 0.74;
        return (
          <g key={y}>
            <path d={`M150,${y} C200,${y} 228,${y - rise * 0.55} 300,${y - rise * 0.72} L340,${endY}`} fill="none" stroke={C.sky} strokeWidth={1.8} strokeLinecap="round" />
            <Arrow x1={336} y1={endY} x2={352} y2={endY} color={C.sky} width={1.8} head={6} />
          </g>
        );
      })}
      <T x={152} y={flows[0] - 8} muted>
        wind
      </T>
      <T x={300} y={40} textAnchor="middle" bold>
        slope lift
      </T>
    </Figure>
  );
}
