import type { ReactElement } from 'react';
import type { Airframe, PolarPoint, PosedModel, TrimAnalysis } from '../../core/types';
import { PlaneView } from '../fold/view';
import { BarMeter } from '../../ui/charts';
import { Card } from '../../ui/Card';
import { DASH, fixed, formatLength, formatRatio, signed, speedParts, type UnitSystem } from '../../ui/format';
import { Icon } from '../../ui/icons';
import { InfoDot } from '../../ui/InfoDot';
import { ProfessorSays } from '../../ui/Professor';
import { SectionHeader } from '../../ui/SectionHeader';
import { Slider } from '../../ui/Slider';
import { Stat, StatGrid } from '../../ui/Stat';
import { lateralStatements, MARGIN_GOOD, trimAdvice } from './advice';

export interface StabilityCardProps {
  model: PosedModel;
  airframe: Airframe;
  trim: TrimAnalysis;
  polar: readonly PolarPoint[];
  units: UnitSystem;
  elevatorDeg: number;
  onElevator: (deg: number) => void;
  /** Shown under the elevator slider (e.g. that the change is not saved). */
  elevatorHint?: string;
}

const METER_MIN = -10;
const METER_MAX = 40;

export function StabilityCard({ model, airframe, trim, polar, units, elevatorDeg, onElevator, elevatorHint }: StabilityCardProps): ReactElement {
  const advice = trimAdvice(trim, polar, units);
  const lateral = lateralStatements(trim);
  const npAheadOfCg = trim.neutralPointX > airframe.cg[0];
  const gap = Math.abs(airframe.cg[0] - trim.neutralPointX);
  const speed = trim.speed === null ? null : speedParts(trim.speed, units);
  const sink = trim.sinkRate === null ? null : speedParts(trim.sinkRate, units, { digits: 2 });
  const marginText = `${signed(trim.staticMarginPct, 0)} % MAC`;

  return (
    <Card as="section" className="ppl-stack ppl-tunnel__stability" aria-labelledby="ppl-tunnel-stab">
      <SectionHeader
        as="h3"
        id="ppl-tunnel-stab"
        title="Stability and trim"
        subtitle="Where it balances, and whether it settles into a glide."
      />
      <div className="ppl-tunnel__topview">
        <PlaneView
          model={model}
          yaw={90}
          pitch={90}
          aspect={16 / 10}
          groundShadow={false}
          markers={[
            { x: airframe.cg[0], kind: 'cg' },
            { x: trim.neutralPointX, kind: 'np' },
          ]}
          label="Top view of the plane with the centre of gravity (CG) and the neutral point (NP) marked"
        />
        <div className="ppl-small ppl-muted ppl-tunnel__topnote">
          {npAheadOfCg
            ? `The NP sits ${formatLength(gap, units)} ahead of the CG: unstable.`
            : `The CG sits ${formatLength(gap, units)} ahead of the NP: it weathervanes into the glide.`}{' '}
          <InfoDot label="What are CG and NP?" title="Balance point and neutral point" topic="stability-and-trim">
            CG is where the plane balances on a fingertip. NP is the point the extra lift from a gust acts on; with the CG ahead of it, a gust that lifts the nose pushes it back down.
          </InfoDot>
        </div>
      </div>

      <BarMeter
        label={
          <span className="ppl-tunnel__inline">
            Static margin
            <InfoDot label="What is static margin?" title="Static margin" topic="stability-and-trim">
              The gap from CG to NP as a share of the average wing chord. A few percent to about 25 % is a steady glider; below zero it tumbles.
            </InfoDot>
          </span>
        }
        value={trim.staticMarginPct}
        min={METER_MIN}
        max={METER_MAX}
        good={MARGIN_GOOD}
        valueText={marginText}
        words={{ low: trim.staticMarginPct < 0 ? 'Unstable' : 'Barely stable', good: 'Stable', high: 'Very stiff' }}
        hint={`Good: ${MARGIN_GOOD[0]} – ${MARGIN_GOOD[1]} %`}
      />

      <StatGrid minWidth={130}>
        <Stat
          label="Trim angle"
          value={trim.alphaDeg === null ? DASH : fixed(trim.alphaDeg, 1)}
          unit={trim.alphaDeg === null ? undefined : '°'}
          size="sm"
          info={
            <InfoDot label="What is the trim angle?" title="Trim angle" topic="stability-and-trim">
              The angle of attack the plane settles at by itself, where the pitching moment is zero.
            </InfoDot>
          }
        />
        <Stat
          label="Glide speed"
          value={speed?.value ?? DASH}
          unit={speed?.unit}
          size="sm"
          info={
            <InfoDot label="What is the glide speed?" title="Trim speed" topic="stability-and-trim">
              The speed at which lift and drag together exactly hold up the weight at the trim angle. Throw near this speed for the smoothest glide.
            </InfoDot>
          }
        />
        <Stat
          label="Glide ratio"
          value={formatRatio(trim.glideRatio)}
          size="sm"
          info={
            <InfoDot label="What is the glide ratio?" title="Glide ratio" topic="lift-and-drag">
              Distance forward for each unit of height lost in a steady glide at trim. From a 2 m launch height, multiply by 2 for the distance.
            </InfoDot>
          }
        />
        <Stat
          label="Sink rate"
          value={sink?.value ?? DASH}
          unit={sink?.unit}
          size="sm"
          info={
            <InfoDot label="What is the sink rate?" title="Sink rate" topic="lift-and-drag">
              How fast it comes down in the steady glide. Lower means a longer time in the air.
            </InfoDot>
          }
        />
      </StatGrid>

      <ul className="ppl-tunnel__lateral" role="list">
        <li>
          <Icon name={trim.rollStable ? 'check' : 'warning'} size={18} />
          <span>{lateral.roll}</span>
        </li>
        <li>
          <Icon name={trim.yawStable || trim.cnBetaDynamic > 0 ? 'check' : 'warning'} size={18} />
          <span>{lateral.yaw}</span>
        </li>
      </ul>

      <ProfessorSays pose={advice.pose} title={advice.title} size={84} live>
        {advice.text}
      </ProfessorSays>

      <Slider
        label="Elevator"
        info={
          <InfoDot label="What does the elevator do?" title="Elevator" topic="stability-and-trim">
            Bending both trailing edges up pushes the tail down, so the plane trims at a higher angle and flies slower.
          </InfoDot>
        }
        min={-10}
        max={15}
        step={0.5}
        origin={0}
        value={elevatorDeg}
        onChange={onElevator}
        format={(v) => `${signed(v, 1)}°`}
        ticks={[-10, -5, 0, 5, 10, 15]}
        tickLabels
        hint={elevatorHint}
      />
    </Card>
  );
}
