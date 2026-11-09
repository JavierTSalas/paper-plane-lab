import { useMemo, useState, type ReactElement } from 'react';
import type { PolarPoint, TrimAnalysis } from '../../core/types';
import { LineChart, valueAt, type ChartMarker, type ChartPoint, type SeriesSlot } from '../../ui/charts';
import { fixed } from '../../ui/format';
import { InfoDot } from '../../ui/InfoDot';
import { Tabs } from '../../ui/Tabs';

type ChartId = 'cl' | 'cd' | 'ld' | 'cm';

interface ChartDef {
  id: ChartId;
  tab: string;
  title: string;
  slot: SeriesSlot;
  pick: (p: PolarPoint) => number;
  digits: number;
  explain: string;
}

const CHARTS: readonly ChartDef[] = [
  {
    id: 'cl',
    tab: 'Lift',
    title: 'Lift coefficient CL',
    slot: 2,
    pick: (p) => p.cl,
    digits: 2,
    explain: 'Lift grows as the nose tips up, until the flow can no longer follow the wing and the curve turns over: the stall.',
  },
  {
    id: 'cd',
    tab: 'Drag',
    title: 'Drag coefficient CD',
    slot: 1,
    pick: (p) => p.cd,
    digits: 2,
    explain: 'A flat paper wing pays for its lift with drag that climbs steeply with angle. At 90° it is a pure air brake.',
  },
  {
    id: 'ld',
    tab: 'L/D',
    title: 'Lift-to-drag ratio',
    slot: 3,
    pick: (p) => p.ld,
    digits: 1,
    explain: 'How many metres the plane glides forward for each metre it sinks, if it flew at this angle. The peak is the best glide.',
  },
  {
    id: 'cm',
    tab: 'Pitch',
    title: 'Pitching moment Cm about the CG',
    slot: 4,
    pick: (p) => p.cm,
    digits: 3,
    explain: 'Above zero the air pushes the nose up, below zero down. The plane trims where the line crosses zero going down; a steeper downward slope means a stiffer, more stable plane.',
  },
];

export interface PolarChartsProps {
  polar: readonly PolarPoint[];
  trim: TrimAnalysis;
  alphaDeg: number;
  /** Formatted airspeed the polar was computed at. */
  speedText: string;
}

/** CL, CD, L/D and Cm against angle of attack, with the current angle, trim, stall and best L/D marked. */
export function PolarCharts({ polar, trim, alphaDeg, speedText }: PolarChartsProps): ReactElement {
  const [chart, setChart] = useState<ChartId>('cl');
  const def = CHARTS.find((c) => c.id === chart) ?? CHARTS[0]!;
  const points: ChartPoint[] = useMemo(() => polar.map((p) => [p.alphaDeg, def.pick(p)] as const), [polar, def]);
  const series = useMemo(() => [{ id: def.id, label: def.title, points, slot: def.slot }], [def, points]);

  const markers: ChartMarker[] = [{ x: trim.stallAlphaDeg, label: 'Stall' }];
  const best = valueAt(points, trim.bestLdAlphaDeg);
  const trimY = trim.alphaDeg === null ? null : valueAt(points, trim.alphaDeg);
  const close = trim.alphaDeg !== null && Math.abs(trim.alphaDeg - trim.bestLdAlphaDeg) < 6;
  if (trim.alphaDeg !== null && trimY !== null) markers.push({ x: trim.alphaDeg, y: trimY, label: close ? 'Trim · best L/D' : 'Trim', seriesId: def.id });
  if (best !== null && !close) markers.push({ x: trim.bestLdAlphaDeg, y: best, label: 'Best L/D', seriesId: def.id });

  const description = `${def.title} against angle of attack from ${polar[0]?.alphaDeg ?? -10} to ${polar[polar.length - 1]?.alphaDeg ?? 60} degrees at ${speedText}. Stall at ${fixed(
    trim.stallAlphaDeg,
    0,
  )} degrees, best lift-to-drag ratio ${fixed(trim.bestLd, 1)} at ${fixed(trim.bestLdAlphaDeg, 0)} degrees${trim.alphaDeg === null ? ', no trim point' : `, trim at ${fixed(trim.alphaDeg, 1)} degrees`}.`;

  const body = (
    <div className="ppl-tunnel__chart">
      <LineChart
        title={def.title}
        description={description}
        series={series}
        xLabel="Angle of attack (°)"
        xDomain={[polar[0]?.alphaDeg ?? -10, polar[polar.length - 1]?.alphaDeg ?? 60]}
        formatY={(v) => fixed(v, def.digits)}
        markers={markers}
        cursorX={alphaDeg}
        height={210}
      />
      <p className="ppl-small ppl-muted ppl-tunnel__chart-note">
        {def.explain}{' '}
        <InfoDot label="How are these curves made?" title="A sweep in the virtual tunnel" topic="lift-and-drag">
          The same element model that flies the plane, swept from −10° to 60° at the glide speed ({speedText}). The vertical line follows your angle slider.
        </InfoDot>
      </p>
    </div>
  );

  return (
    <Tabs
      label="Polar charts"
      variant="pill"
      value={chart}
      onChange={setChart}
      items={CHARTS.map((c) => ({ id: c.id, label: c.tab, content: body }))}
    />
  );
}
