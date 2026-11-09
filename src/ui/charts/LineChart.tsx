import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { cx } from '../cx';
import { useElementWidth } from '../hooks';
import { linearScale, nearestIndex, niceAxis, tickLabel, type NiceAxis } from './scale';
import './charts.css';

export type ChartPoint = readonly [x: number, y: number];

/** Categorical slot 1-6 maps to the validated --viz-N tokens. Assign in fixed order per entity. */
export type SeriesSlot = 1 | 2 | 3 | 4 | 5 | 6;

export interface LineSeries {
  id: string;
  label: string;
  /** Sorted by x. */
  points: readonly ChartPoint[];
  /** Colour slot. Default: the series' position in the array + 1. */
  slot?: SeriesSlot;
  /** Dashed stroke as a second, non-colour channel (e.g. "predicted" vs "measured"). */
  dashed?: boolean;
}

export interface ChartMarker {
  x: number;
  /** With y: a dot on the plot. Without: a vertical guide across the plot. */
  y?: number;
  label: string;
  /** Colours the dot like this series. */
  seriesId?: string;
}

export interface LineChartProps {
  /** Accessible name, also shown as the chart heading unless `hideTitle`. */
  title: string;
  /** Longer accessible description (what the chart shows, the takeaway). */
  description?: string;
  hideTitle?: boolean;
  series: readonly LineSeries[];
  xLabel?: string;
  yLabel?: string;
  /** Fixed domains. Default: nice-rounded extent of the data. */
  xDomain?: readonly [number, number];
  yDomain?: readonly [number, number];
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  markers?: readonly ChartMarker[];
  /** Controlled vertical cursor (x value), e.g. a replay scrubber. null hides it. */
  cursorX?: number | null;
  /** Hover / keyboard cursor changes. When given, the chart reports instead of showing its own tooltip only. */
  onCursorChange?: (x: number | null) => void;
  /** Plot height in px. Default 220. */
  height?: number;
  /** Adds a visually hidden data table (for screen readers). Default true. */
  table?: boolean;
  className?: string;
}

const PAD = { top: 12, right: 12, bottom: 34, left: 44 };

interface Extent {
  x: NiceAxis;
  y: NiceAxis;
}

function extent(series: readonly LineSeries[], xDomain?: readonly [number, number], yDomain?: readonly [number, number]): Extent {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const s of series) {
    for (const [x, y] of s.points) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  const x = xDomain ? niceAxis(xDomain[0], xDomain[1]) : niceAxis(x0, x1);
  const y = yDomain ? niceAxis(yDomain[0], yDomain[1]) : niceAxis(Math.min(0, y0), y1);
  // A pinned domain keeps its exact ends; ticks stay inside it.
  if (xDomain) Object.assign(x, { min: xDomain[0], max: xDomain[1], ticks: x.ticks.filter((t) => t >= xDomain[0] && t <= xDomain[1]) });
  if (yDomain) Object.assign(y, { min: yDomain[0], max: yDomain[1], ticks: y.ticks.filter((t) => t >= yDomain[0] && t <= yDomain[1]) });
  return { x, y };
}

function pathFor(points: readonly ChartPoint[], sx: (v: number) => number, sy: (v: number) => number): string {
  let d = '';
  points.forEach(([x, y], i) => {
    d += `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
  });
  return d;
}

/** Linear interpolation of a series at x; null outside its range. */
export function valueAt(points: readonly ChartPoint[], x: number): number | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (x < first[0] || x > last[0]) return null;
  const xs = points.map((p) => p[0]);
  const i = nearestIndex(xs, x);
  const p = points[i]!;
  const q = points[x >= p[0] ? Math.min(i + 1, points.length - 1) : Math.max(i - 1, 0)]!;
  if (q[0] === p[0]) return p[1];
  return p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0]);
}

const slotOf = (s: LineSeries, i: number): SeriesSlot => s.slot ?? (((i % 6) + 1) as SeriesSlot);

/** Multi-series line chart: nice axes, hairline grid, markers, crosshair with tooltip, arrow-key scrubbing. */
export function LineChart({
  title,
  description,
  hideTitle,
  series,
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  formatX,
  formatY,
  markers = [],
  cursorX,
  onCursorChange,
  height = 220,
  table = true,
  className,
}: LineChartProps): ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrapRef, 360);
  const uid = useId();
  const [hoverX, setHoverX] = useState<number | null>(null);

  const ext = useMemo(() => extent(series, xDomain, yDomain), [series, xDomain, yDomain]);
  const fx = formatX ?? ((v: number) => tickLabel(v, ext.x.step));
  const fy = formatY ?? ((v: number) => tickLabel(v, ext.y.step));
  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const plotH = Math.max(40, height - PAD.top - PAD.bottom);
  const sx = linearScale([ext.x.min, ext.x.max], [PAD.left, PAD.left + plotW]);
  const sy = linearScale([ext.y.min, ext.y.max], [PAD.top + plotH, PAD.top]);
  const invX = linearScale([PAD.left, PAD.left + plotW], [ext.x.min, ext.x.max]);

  // Thin x ticks so labels never collide (about 56 px per label).
  const maxXTicks = Math.max(2, Math.floor(plotW / 56));
  const xTicks = ext.x.ticks.filter((_, i, all) => i % Math.ceil(all.length / maxXTicks) === 0);
  const scrubXs = series[0]?.points.map((p) => p[0]) ?? [];

  const activeX = hoverX ?? cursorX ?? null;
  const setCursor = (x: number | null): void => {
    setHoverX(x);
    onCursorChange?.(x);
  };

  const onPointer = (e: PointerEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const x = Math.min(ext.x.max, Math.max(ext.x.min, invX(px)));
    const i = nearestIndex(scrubXs, x);
    setCursor(i >= 0 ? scrubXs[i]! : x);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>): void => {
    if (scrubXs.length === 0) return;
    const current = activeX === null ? -1 : nearestIndex(scrubXs, activeX);
    const jump = Math.max(1, Math.round(scrubXs.length / 20));
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(scrubXs.length - 1, current + jump);
    else if (e.key === 'ArrowLeft') next = Math.max(0, current < 0 ? 0 : current - jump);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = scrubXs.length - 1;
    else if (e.key === 'Escape') {
      setCursor(null);
      return;
    } else return;
    e.preventDefault();
    setCursor(scrubXs[next]!);
  };

  const readout =
    activeX === null
      ? []
      : series.map((s, i) => ({ s, slot: slotOf(s, i), v: valueAt(s.points, activeX) })).filter((r) => r.v !== null);
  const cursorPx = activeX === null ? 0 : sx(activeX);
  const tipLeft = Math.min(Math.max(cursorPx, 70), width - 70);

  const titleId = `${uid}-t`;
  const descId = `${uid}-d`;

  return (
    <figure className={cx('ppl-chart', className)}>
      <figcaption className={cx('ppl-chart__head', hideTitle && 'ppl-sr-only')}>
        <span className="ppl-chart__title">{title}</span>
        {series.length > 1 && (
          <ul className="ppl-chart__legend" aria-label="Legend">
            {series.map((s, i) => (
              <li key={s.id}>
                <svg width="18" height="8" aria-hidden="true">
                  <line x1="1" y1="4" x2="17" y2="4" className={`ppl-viz-stroke-${slotOf(s, i)}`} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={s.dashed ? '4 4' : undefined} />
                </svg>
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
      <div ref={wrapRef} className="ppl-chart__plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={0}
          className="ppl-chart__svg"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={onKey}
          onBlur={() => setCursor(null)}
        >
          <title id={titleId}>{title}</title>
          {description && <desc id={descId}>{description}</desc>}

          <g className="ppl-chart__grid" aria-hidden="true">
            {ext.y.ticks.map((t) => (
              <g key={`y${t}`}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={sy(t)} y2={sy(t)} className={t === 0 ? 'ppl-chart__zero' : undefined} />
                <text x={PAD.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="ppl-chart__tick">
                  {fy(t)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={`x${t}`} x={sx(t)} y={PAD.top + plotH + 18} textAnchor="middle" className="ppl-chart__tick">
                {fx(t)}
              </text>
            ))}
            {xLabel && (
              <text x={PAD.left + plotW} y={height - 2} textAnchor="end" className="ppl-chart__axis-label">
                {xLabel}
              </text>
            )}
            {yLabel && (
              <text x={4} y={PAD.top - 2} className="ppl-chart__axis-label" dy="0.7em">
                {yLabel}
              </text>
            )}
          </g>

          <g aria-hidden="true">
            {series.map((s, i) => (
              <path
                key={s.id}
                d={pathFor(s.points, sx, sy)}
                className={cx('ppl-chart__line', `ppl-viz-stroke-${slotOf(s, i)}`)}
                strokeDasharray={s.dashed ? '6 5' : undefined}
              />
            ))}
          </g>

          <g aria-hidden="true">
            {markers.map((m) => {
              const sIndex = series.findIndex((s) => s.id === m.seriesId);
              const x = sx(m.x);
              if (m.y === undefined) {
                return (
                  <g key={`${m.label}${m.x}`} className="ppl-chart__guide">
                    <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + plotH} />
                    <text x={x + 4} y={PAD.top + 10} className="ppl-chart__marker-label">
                      {m.label}
                    </text>
                  </g>
                );
              }
              const y = sy(m.y);
              const slot = sIndex >= 0 ? slotOf(series[sIndex]!, sIndex) : 1;
              const anchor = x > PAD.left + plotW - 60 ? 'end' : x < PAD.left + 60 ? 'start' : 'middle';
              return (
                <g key={`${m.label}${m.x}`}>
                  <circle cx={x} cy={y} r="5" className={cx('ppl-chart__dot', `ppl-viz-fill-${slot}`)} />
                  <text x={x} y={y - 11} textAnchor={anchor} className="ppl-chart__marker-label">
                    {m.label}
                  </text>
                </g>
              );
            })}
          </g>

          {activeX !== null && (
            <g aria-hidden="true">
              <line x1={cursorPx} x2={cursorPx} y1={PAD.top} y2={PAD.top + plotH} className="ppl-chart__cursor" />
              {readout.map(({ s, slot, v }) => (
                <circle key={s.id} cx={cursorPx} cy={sy(v!)} r="4.5" className={cx('ppl-chart__dot', `ppl-viz-fill-${slot}`)} />
              ))}
            </g>
          )}
        </svg>
        {hoverX !== null && readout.length > 0 && (
          <div className="ppl-chart__tip" style={{ left: tipLeft }} role="status">
            <div className="ppl-chart__tip-x">
              {xLabel ? `${xLabel} ` : ''}
              {fx(hoverX)}
            </div>
            {readout.map(({ s, slot, v }) => (
              <div key={s.id} className="ppl-chart__tip-row">
                <span className={cx('ppl-chart__key', `ppl-viz-bg-${slot}`)} aria-hidden="true" />
                <span className="ppl-chart__tip-label">{s.label}</span>
                <span className="ppl-num">{fy(v!)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {table && <ChartTable series={series} xLabel={xLabel ?? 'x'} fx={fx} fy={fy} />}
    </figure>
  );
}

/** Screen-reader data table, thinned to at most 30 rows per series. */
function ChartTable({ series, xLabel, fx, fy }: { series: readonly LineSeries[]; xLabel: string; fx: (v: number) => string; fy: (v: number) => string }): ReactElement {
  return (
    <div className="ppl-sr-only">
      {series.map((s) => {
        const stride = Math.max(1, Math.ceil(s.points.length / 30));
        const rows = s.points.filter((_, i) => i % stride === 0 || i === s.points.length - 1);
        return (
          <table key={s.id}>
            <caption>{s.label}</caption>
            <thead>
              <tr>
                <th scope="col">{xLabel}</th>
                <th scope="col">{s.label}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([x, y]) => (
                <tr key={x}>
                  <td>{fx(x)}</td>
                  <td>{fy(y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
