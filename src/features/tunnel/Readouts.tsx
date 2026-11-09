import type { ReactElement } from 'react';
import type { TunnelReading } from '../../core/types';
import { fixed, formatCompact, formatMass, formatPercent, signed, type UnitSystem } from '../../ui/format';
import { Icon } from '../../ui/icons';
import { InfoDot } from '../../ui/InfoDot';
import { Stat, StatGrid } from '../../ui/Stat';

/** Lift within this fraction of the weight counts as "level". */
export const LEVEL_TOLERANCE = 0.05;
/** |Cm| below this counts as balanced in pitch. */
const CM_BALANCED = 0.002;

export type LevelState = 'level' | 'climb' | 'sink';

export function levelState(lift: number, weight: number): LevelState {
  const ratio = weight > 0 ? lift / weight : 0;
  if (Math.abs(ratio - 1) <= LEVEL_TOLERANCE) return 'level';
  return ratio > 1 ? 'climb' : 'sink';
}

/** Lift against weight, spelled out. */
export function LevelBanner({ reading, weight }: { reading: TunnelReading; weight: number }): ReactElement {
  const state = levelState(reading.lift, weight);
  const pct = formatPercent(weight > 0 ? reading.lift / weight : 0);
  const text =
    state === 'level'
      ? { title: 'It would fly level at this speed', body: `Lift is ${pct} of the weight.` }
      : state === 'climb'
        ? { title: 'More lift than weight', body: `Lift is ${pct} of the weight: at this speed and angle it would climb (and slow down).` }
        : { title: 'Not enough lift to fly level', body: `Lift carries only ${pct} of the weight: it would sink. Go faster or raise the nose.` };
  return (
    <div className={`ppl-tunnel__banner is-${state}`} role="status">
      <Icon name={state === 'level' ? 'check' : state === 'climb' ? 'height' : 'warning'} size={22} />
      <div>
        <p className="ppl-tunnel__banner-title">{text.title}</p>
        <p className="ppl-small">{text.body}</p>
      </div>
    </div>
  );
}

/** Small curved arrow; nose-left like the tunnel view, so nose-up turns clockwise. */
function PitchArrow({ noseUp }: { noseUp: boolean }): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="ppl-tunnel__pitch-icon" style={noseUp ? undefined : { transform: 'scaleY(-1)' }}>
      <path d="M5 15 A8 8 0 0 1 19 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M19.5 3.5 L19.6 9.6 L13.6 9.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface ReadoutsProps {
  reading: TunnelReading;
  weight: number;
  mass: number;
  units: UnitSystem;
}

export function Readouts({ reading, weight, mass, units }: ReadoutsProps): ReactElement {
  const mN = (n: number): string => fixed(n * 1000, 0);
  const ld = reading.drag > 1e-9 ? reading.lift / reading.drag : null;
  const pitch = reading.moment[2];
  const balanced = Math.abs(reading.cm) < CM_BALANCED;
  return (
    <StatGrid minWidth={150}>
      <Stat
        label="Lift"
        value={mN(reading.lift)}
        unit="mN"
        hint={`${formatPercent(weight > 0 ? reading.lift / weight : 0)} of weight`}
        info={
          <InfoDot label="What is lift?" title="Lift" topic="lift-and-drag">
            The push at right angles to the wind that holds the plane up. One millinewton (mN) is about the weight of a tenth of a gram.
          </InfoDot>
        }
      />
      <Stat
        label="Weight"
        value={mN(weight)}
        unit="mN"
        hint={formatMass(mass, units)}
        info={
          <InfoDot label="Why show the weight?" title="Weight">
            What the lift must match to fly level. It is the mass of the paper (and any clip) times gravity.
          </InfoDot>
        }
      />
      <Stat
        label="Drag"
        value={mN(reading.drag)}
        unit="mN"
        info={
          <InfoDot label="What is drag?" title="Drag" topic="lift-and-drag">
            The push along the wind that slows the plane. A flat paper wing gets most of it from tilting its lift backwards, plus skin friction.
          </InfoDot>
        }
      />
      <Stat
        label="Lift ÷ drag"
        value={ld === null ? '—' : fixed(ld, 1)}
        info={
          <InfoDot label="What does lift to drag mean?" title="Lift-to-drag ratio" topic="lift-and-drag">
            In a steady glide this is how far the plane travels forward for each unit of height it loses. Higher is a flatter glide.
          </InfoDot>
        }
      />
      <Stat
        label="Pitch moment"
        value={signed(pitch * 1000, 2)}
        unit="mN·m"
        hint={
          <span className="ppl-tunnel__pitch">
            {!balanced && <PitchArrow noseUp={pitch > 0} />}
            {balanced ? 'Balanced' : pitch > 0 ? 'Nose up' : 'Nose down'}
          </span>
        }
        info={
          <InfoDot label="What is the pitch moment?" title="Pitching moment" topic="stability-and-trim">
            The twist the air puts on the plane about its balance point. Zero means the plane holds this angle by itself: that angle is its trim.
          </InfoDot>
        }
      />
      <Stat
        label="Reynolds number"
        value={formatCompact(reading.reynolds)}
        info={
          <InfoDot label="What is the Reynolds number?" title="Reynolds number" topic="reynolds">
            Speed times chord, compared with the stickiness of air. Paper planes fly at tens of thousands, where air feels thick and friction matters a lot.
          </InfoDot>
        }
      />
      <Stat
        label="CL"
        value={fixed(reading.cl, 2)}
        info={
          <InfoDot label="What is CL?" title="Lift coefficient" topic="lift-and-drag">
            Lift with the speed and wing area divided out, so it depends only on the shape and the angle. Easy to compare between planes.
          </InfoDot>
        }
      />
      <Stat
        label="CD"
        value={fixed(reading.cd, 3)}
        info={
          <InfoDot label="What is CD?" title="Drag coefficient" topic="lift-and-drag">
            Drag with the speed and wing area divided out. Lift ÷ drag is the same as CL ÷ CD.
          </InfoDot>
        }
      />
    </StatGrid>
  );
}
