import type { ReactElement } from 'react';
import type { TrimAnalysis } from '../../core/types';
import { BarMeter } from '../../ui/charts';
import { cx } from '../../ui/cx';
import { fixed, formatRatio, speedParts, type UnitSystem } from '../../ui/format';
import { InfoDot } from '../../ui/InfoDot';
import { Professor } from '../../ui/Professor';
import { Stat } from '../../ui/Stat';

/** Static margin that flies well for paper darts and gliders, percent of the mean chord (doc 02 section 4, doc 05). */
export const GOOD_MARGIN: readonly [number, number] = [5, 25];

/** The Professor's one sentence about the most important problem, or null when the plane should glide. */
export function stabilityAdvice(t: TrimAnalysis): string | null {
  if (t.staticMarginPct < 0 || !t.pitchStable)
    return 'The centre of gravity is behind the neutral point, so it will flip nose-up. Move the wing line outward or add nose folds.';
  if (t.staticMarginPct > GOOD_MARGIN[1])
    return 'The balance point sits far ahead of the neutral point, so it will want to dive. Bend some up-elevator in Trim.';
  if (!t.trimmable) return 'There is no steady glide yet, so it will nose down. Bend the trailing edges up a little in Trim.';
  if (!t.rollStable) return 'The wings droop at the tips, so it will roll off into a spiral. Give the wings more dihedral, tips up.';
  if (t.cnBetaDynamic < 0) return 'It can slip sideways and curl into a spiral. Close the keel a little or turn winglets up.';
  return null;
}

export interface StabilityStripProps {
  analysis: TrimAnalysis | null;
  units: UnitSystem;
  className?: string;
}

/** Live static margin, predicted glide and the Professor's advice. */
export function StabilityStrip({ analysis, units, className }: StabilityStripProps): ReactElement {
  if (!analysis) return <div className={cx('ppl-stab', className)} />;
  const advice = stabilityAdvice(analysis);
  const speed = analysis.speed === null ? null : speedParts(analysis.speed, units);
  return (
    <div className={cx('ppl-stab', className)}>
      <BarMeter
        label={
          <span className="ppl-stab__label">
            Static margin
            <InfoDot label="What is static margin?" title="Static margin" topic="stability-and-trim~cg-np">
              How far the balance point (CG) sits ahead of the neutral point, the point the lift pivots about, as a share of the wing's mean
              chord. Ahead means the plane noses back down by itself after a bump.
            </InfoDot>
          </span>
        }
        value={analysis.staticMarginPct}
        min={-20}
        max={45}
        good={GOOD_MARGIN}
        valueText={`${fixed(analysis.staticMarginPct, 0)} %`}
        words={{ low: 'Tail-heavy', good: 'Steady', high: 'Nose-heavy' }}
        hint={`Good: ${GOOD_MARGIN[0]} to ${GOOD_MARGIN[1]} % of the chord`}
      />
      <div className="ppl-stab__stats">
        <Stat
          size="sm"
          label="Glide ratio"
          value={analysis.glideRatio === null ? '—' : formatRatio(analysis.glideRatio)}
          info={
            <InfoDot label="What is the glide ratio?" title="Glide ratio">
              Metres flown forward for every metre of height lost in a steady glide, from the virtual wind tunnel in still air.
            </InfoDot>
          }
        />
        <Stat
          size="sm"
          label="Glide speed"
          value={speed ? speed.value : '—'}
          unit={speed?.unit}
          info={
            <InfoDot label="What is the glide speed?" title="Glide speed">
              The speed the plane settles at once it glides steadily. Heavier or smaller-winged planes glide faster.
            </InfoDot>
          }
        />
      </div>
      {advice && (
        <div className="ppl-stab__prof" role="status">
          <Professor pose="think" size={52} animate={false} title="Professor Wren" />
          <p>{advice}</p>
        </div>
      )}
    </div>
  );
}
