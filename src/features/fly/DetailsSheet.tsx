import { useMemo, type ReactElement } from 'react';
import type { FlightResult } from '../../core/types';
import { LineChart, type ChartMarker, type ChartPoint } from '../../ui/charts';
import { convertLength, convertSpeed, defaultSpeedUnit, fixed, formatCompact, formatRatio, formatTime, lengthParts, speedParts, type UnitSystem } from '../../ui/format';
import { InfoDot } from '../../ui/InfoDot';
import { Professor } from '../../ui/Professor';
import { SectionHeader } from '../../ui/SectionHeader';
import { Sheet } from '../../ui/Sheet';
import { Slider } from '../../ui/Slider';
import { Stat, StatGrid } from '../../ui/Stat';
import { professorPose } from './ResultCard';
import type { ThrowRecord } from './types';

export interface DetailsSheetProps {
  open: boolean;
  onClose: () => void;
  record: ThrowRecord;
  units: UnitSystem;
  /** Play-head time, seconds (drives the chart cursors and the scrubber). */
  time: number;
  onSeek: (t: number) => void;
}

const MAX_POINTS = 240;

function series(result: FlightResult, pick: (i: number) => ChartPoint): ChartPoint[] {
  const n = result.samples.length;
  const stride = Math.max(1, Math.ceil(n / MAX_POINTS));
  const out: ChartPoint[] = [];
  for (let i = 0; i < n; i += stride) out.push(pick(i));
  if ((n - 1) % stride !== 0) out.push(pick(n - 1));
  return out;
}

export function DetailsSheet({ open, onClose, record, units, time, onSeek }: DetailsSheetProps): ReactElement {
  const r = record.result;
  const m = r.metrics;
  const lu = units === 'imperial' ? 'ft' : 'm';
  const su = defaultSpeedUnit(units);
  const l0 = record.env.launch;

  const charts = useMemo(() => {
    const s = r.samples;
    const down = (i: number): number => convertLength(Math.hypot(s[i].pos[0] - l0[0], s[i].pos[2] - l0[2]), lu);
    return {
      height: series(r, (i) => [down(i), convertLength(s[i].pos[1], lu)]),
      speed: series(r, (i) => [s[i].t, convertSpeed(s[i].airspeed, su)]),
      alpha: series(r, (i) => [s[i].t, (s[i].alpha * 180) / Math.PI]),
      stalls: r.events.filter((e) => e.kind === 'stall').map((e): ChartMarker => ({ x: e.t, label: 'Stall' })),
      downAt: (t: number): number => {
        const i = Math.min(s.length - 1, Math.max(0, Math.round(t * r.sampleHz)));
        return down(i);
      },
    };
  }, [r, lu, su, l0]);

  const len = (v: number) => lengthParts(v, units, { digits: 1 });
  const maxH = len(m.maxHeight);
  const path = len(m.pathLength);
  const lateral = len(Math.abs(m.lateral));
  const sink = m.sinkRate !== null ? speedParts(m.sinkRate, units, { digits: 2 }) : null;
  const vmax = speedParts(m.maxSpeed, units);
  const vland = speedParts(m.landingSpeed, units);
  const duration = r.samples.length ? r.samples[r.samples.length - 1].t : 0;

  return (
    <Sheet open={open} onClose={onClose} title="Flight details" description={`${record.build.design.name} in the ${record.env.name}, seed ${record.seed}.`} size="lg">
      <div className="ppl-fly-details">
        <Slider
          label="Replay"
          min={0}
          max={Math.max(0.01, duration)}
          step={0.01}
          value={Math.min(time, duration)}
          onChange={onSeek}
          format={(v) => formatTime(v, 2)}
          hint="Drag to move the plane along its flight."
        />

        <LineChart
          title={`Height over distance (${lu})`}
          description="The flight path seen from the side."
          series={[{ id: 'h', label: 'Height', points: charts.height }]}
          xLabel={`Distance (${lu})`}
          formatX={(v) => fixed(v, 1)}
          formatY={(v) => fixed(v, 1)}
          cursorX={charts.downAt(time)}
          height={180}
        />
        <LineChart
          title={`Airspeed (${su})`}
          series={[{ id: 'v', label: 'Airspeed', points: charts.speed, slot: 2 }]}
          xLabel="Time (s)"
          formatX={(v) => fixed(v, 1)}
          formatY={(v) => fixed(v, 1)}
          cursorX={time}
          onCursorChange={(x) => x !== null && onSeek(x)}
          markers={charts.stalls}
          height={160}
        />
        <LineChart
          title="Angle of attack (°)"
          series={[{ id: 'a', label: 'Angle of attack', points: charts.alpha, slot: 3 }]}
          xLabel="Time (s)"
          formatX={(v) => fixed(v, 1)}
          formatY={(v) => fixed(v, 0)}
          cursorX={time}
          onCursorChange={(x) => x !== null && onSeek(x)}
          markers={charts.stalls}
          height={160}
        />

        <SectionHeader title="Numbers" as="h3" />
        <StatGrid minWidth={150}>
          <Stat
            label="Glide ratio"
            value={formatRatio(m.glideRatio)}
            info={
              <InfoDot label="What is the glide ratio?" title="Glide ratio" topic="lift-and-drag">
                How far the plane travels forward for every metre it sinks, measured over its steadiest stretch. A good paper glider manages 5 to 8.
              </InfoDot>
            }
          />
          <Stat
            label="Sink rate"
            value={sink ? sink.value : '—'}
            unit={sink?.unit}
            info={
              <InfoDot label="What is the sink rate?" title="Sink rate">
                How fast the plane comes down through the air in its steady glide. Lower means longer airtime.
              </InfoDot>
            }
          />
          <Stat label="Max height" value={maxH.value} unit={maxH.unit} info={<InfoDot label="About max height" title="Max height">The highest point of the plane's centre of gravity above the ground where you stand.</InfoDot>} />
          <Stat label="Path length" value={path.value} unit={path.unit} info={<InfoDot label="About path length" title="Path length">The length of the curve the plane actually flew, climbs and loops included. Always at least the distance.</InfoDot>} />
          <Stat
            label="Stalls"
            value={String(m.stallCount)}
            info={
              <InfoDot label="What is a stall?" title="Stall" topic="stability-and-trim">
                The wing met the air at too steep an angle and the smooth flow over it broke away, so lift dropped suddenly.
              </InfoDot>
            }
          />
          <Stat
            label="Reynolds number"
            value={formatCompact(m.reynolds)}
            info={
              <InfoDot label="What is the Reynolds number?" title="Reynolds number" topic="reynolds">
                Speed times wing chord divided by the air's viscosity. Paper planes fly around 10 000 to 50 000, where air feels thick and sticky
                compared with a real airliner.
              </InfoDot>
            }
          />
          <Stat label="Top speed" value={vmax.value} unit={vmax.unit} />
          <Stat label="Landing speed" value={vland.value} unit={vland.unit} />
          <Stat label="Drift sideways" value={lateral.value} unit={lateral.unit} info={<InfoDot label="About sideways drift" title="Drift">How far left or right of the throw line the plane came down.</InfoDot>} />
          <Stat label="Mean airspeed" value={speedParts(m.meanAirspeed, units).value} unit={su} />
        </StatGrid>

        <SectionHeader title="The Professor's notes" as="h3" />
        <ul className="ppl-fly-diags" role="list">
          {r.diagnosis.map((d) => (
            <li key={d.code} className="ppl-fly-diag">
              <Professor pose={professorPose(d)} size={56} animate={false} title={null} />
              <div>
                <p className="ppl-fly-diag__what">{d.what}</p>
                <p>{d.why}</p>
                {d.fix && (
                  <p>
                    <strong>Try:</strong> {d.fix}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
