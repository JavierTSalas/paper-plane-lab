import { useMemo, type ReactElement, type Ref } from 'react';
import type { Arena, Diagnosis } from '../../core/types';
import { Button } from '../../ui/Button';
import { Tag } from '../../ui/Chip';
import { cx } from '../../ui/cx';
import { LineChart, type ChartPoint } from '../../ui/charts';
import { convertLength, fixed, formatRatio, lengthParts, speedParts, timeParts, type UnitSystem } from '../../ui/format';
import { ProfessorSays } from '../../ui/Professor';
import { Stat, StatGrid } from '../../ui/Stat';
import type { ThrowRecord } from './types';

export interface ResultCardProps {
  record: ThrowRecord;
  units: UnitSystem;
  personalBest: boolean;
  arenas: readonly Arena[];
  onAgain: () => void;
  onReplay: () => void;
  onTrim: () => void;
  onDetails: () => void;
  onRank: (arena: Arena) => void;
  /** Room to spare (desktop): also show the flight path and a few more numbers. */
  wide?: boolean;
  className?: string;
  ref?: Ref<HTMLElement>;
}

const CHEERFUL = new Set(['clean-glide', 'wind-carried']);

export function professorPose(d: Diagnosis | undefined): 'cheer' | 'think' | 'point' {
  if (!d) return 'think';
  if (CHEERFUL.has(d.code)) return 'cheer';
  return d.fix ? 'point' : 'think';
}

export function ResultCard({ record, units, personalBest, arenas, onAgain, onReplay, onTrim, onDetails, onRank, wide = false, className, ref }: ResultCardProps): ReactElement {
  const m = record.result.metrics;
  const dist = lengthParts(m.distance, units, { digits: 1 });
  const air = timeParts(m.airtime);
  const first = record.result.diagnosis[0];
  const ended = record.result.outcome;
  const lu = units === 'imperial' ? 'ft' : 'm';
  const path = useMemo(() => {
    const l0 = record.env.launch;
    const s = record.result.samples;
    const stride = Math.max(1, Math.ceil(s.length / 160));
    const pts: ChartPoint[] = [];
    for (let i = 0; i < s.length; i += stride) pts.push([convertLength(Math.hypot(s[i].pos[0] - l0[0], s[i].pos[2] - l0[2]), lu), convertLength(s[i].pos[1], lu)]);
    return pts;
  }, [record, lu]);
  const maxH = lengthParts(m.maxHeight, units, { digits: 1 });
  const vmax = speedParts(m.maxSpeed, units);
  return (
    <section ref={ref} className={cx('ppl-fly-result', className)} aria-label="Flight result">
      <div className="ppl-fly-result__stats">
        <Stat label="Distance" icon="distance" size="lg" value={dist.value} unit={dist.unit} />
        <Stat label="Airtime" icon="timer" size="lg" value={air.value} unit={air.unit} />
      </div>
      <div className="ppl-fly-result__tags">
        {personalBest && (
          <Tag tone="good" icon="star">
            Best yet in the {record.env.name}
          </Tag>
        )}
        {ended !== 'ground' && <Tag tone="warn">{ended === 'timeout' ? 'Still flying after a minute' : `Hit the ${ended}`}</Tag>}
      </div>
      {first && (
        <ProfessorSays pose={professorPose(first)} size={84} title={first.what} live>
          <p>{first.why}</p>
          {first.fix && (
            <p className="ppl-fly-result__fix">
              <strong>Try:</strong> {first.fix}
            </p>
          )}
        </ProfessorSays>
      )}
      <div className="ppl-fly-result__actions">
        <Button variant="primary" icon="fly" onClick={onAgain} className="ppl-fly-result__again">
          Throw again
        </Button>
        <Button variant="secondary" onClick={onReplay}>
          Replay
        </Button>
        <Button variant="secondary" onClick={onTrim}>
          Trim
        </Button>
        <Button variant="secondary" onClick={onDetails}>
          Details
        </Button>
      </div>
      {wide && (
        <>
          <StatGrid minWidth={100} boxed={false}>
            <Stat label="Max height" size="sm" value={maxH.value} unit={maxH.unit} />
            <Stat label="Glide ratio" size="sm" value={formatRatio(m.glideRatio)} />
            <Stat label="Top speed" size="sm" value={vmax.value} unit={vmax.unit} />
          </StatGrid>
          <LineChart
            title={`Flight path (${lu})`}
            description="Height over distance, seen from the side."
            series={[{ id: 'h', label: 'Height', points: path }]}
            xLabel={`Distance (${lu})`}
            formatX={(v) => fixed(v, 0)}
            formatY={(v) => fixed(v, 1)}
            height={150}
          />
        </>
      )}
      {arenas.length > 0 && (
        <div className="ppl-fly-result__rank">
          {arenas.map((a) => (
            <Button key={a.id} variant="ghost" icon="ranks" onClick={() => onRank(a)}>
              Enter ranking: {a.name}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
