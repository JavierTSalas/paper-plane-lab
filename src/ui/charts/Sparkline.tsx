import type { ReactElement } from 'react';
import { cx } from '../cx';
import { linearScale } from './scale';
import type { SeriesSlot } from './LineChart';
import './charts.css';

export interface SparklineProps {
  values: readonly number[];
  /** Accessible summary, e.g. "Distance over the last 8 throws, best 9.2 m". */
  label: string;
  width?: number;
  height?: number;
  /** Colour slot of the trend line. Default: muted ink; the last point uses the accent. */
  slot?: SeriesSlot;
  /** Soft area wash under the line. */
  area?: boolean;
  className?: string;
}

/** Tiny trend line in the de-emphasis colour with the latest value marked. */
export function Sparkline({ values, label, width = 96, height = 28, slot, area = false, className }: SparklineProps): ReactElement {
  const pad = 4;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const sx = linearScale([0, Math.max(1, values.length - 1)], [pad, width - pad]);
  const sy = linearScale(lo === hi ? [lo - 1, hi + 1] : [lo, hi], [height - pad, pad]);
  const pts = values.map((v, i) => `${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`);
  const line = pts.length > 0 ? `M${pts.join('L')}` : '';
  const last = values.length - 1;
  const strokeClass = slot ? `ppl-viz-stroke-${slot}` : 'ppl-spark__muted';
  return (
    <svg className={cx('ppl-spark', className)} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {area && line && <path d={`${line}L${sx(last).toFixed(1)} ${height}L${sx(0).toFixed(1)} ${height}Z`} className={cx('ppl-spark__area', slot ? `ppl-viz-fill-${slot}` : 'ppl-spark__muted-fill')} />}
      <path d={line} className={cx('ppl-spark__line', strokeClass)} />
      {last >= 0 && <circle cx={sx(last)} cy={sy(values[last]!)} r="3.5" className={cx('ppl-chart__dot', slot ? `ppl-viz-fill-${slot}` : 'ppl-viz-fill-1')} />}
    </svg>
  );
}
