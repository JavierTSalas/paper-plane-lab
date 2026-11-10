import type { ReactElement, ReactNode } from 'react';
import { THROW_LIMITS } from '../../core/sim';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { formatSpeed, signedDeg, type UnitSystem } from '../../ui/format';
import { InfoDot } from '../../ui/InfoDot';
import { Slider } from '../../ui/Slider';
import { ARM_LABEL, armStrength } from './flight';

export interface ThrowPadProps {
  /** Release speed, m/s. */
  speed: number;
  /** Launch angle above the horizon, degrees. */
  pitchDeg: number;
  onChange: (next: { speed: number; pitchDeg: number }) => void;
  onThrow: () => void;
  units: UnitSystem;
  disabled?: boolean;
  /** Button text. Default "Throw". */
  throwLabel?: string;
  /** Highest speed offered (onboarding keeps it gentle). Default THROW_LIMITS.maxSpeed. */
  maxSpeed?: number;
  /** Extra controls under the sliders (the Fly screen puts its advanced settings here). */
  children?: ReactNode;
  className?: string;
}

/** Compact throw controls: release speed with the arm strength, launch angle, and a big Throw button. */
export function ThrowPad({ speed, pitchDeg, onChange, onThrow, units, disabled, throwLabel = 'Throw', maxSpeed = THROW_LIMITS.maxSpeed, children, className }: ThrowPadProps): ReactElement {
  const arm = ARM_LABEL[armStrength(speed)];
  return (
    <div className={cx('ppl-throwpad', className)}>
      <div className="ppl-throwpad__sliders">
        <Slider
          label="Speed"
          min={THROW_LIMITS.minSpeed}
          max={maxSpeed}
          step={0.5}
          value={Math.min(speed, maxSpeed)}
          onChange={(v) => onChange({ speed: v, pitchDeg })}
          format={(v) => `${formatSpeed(v, units)} · ${ARM_LABEL[armStrength(v)]}`}
          disabled={disabled}
          info={
            <InfoDot label="About the throw speed" title="Release speed">
              How fast the plane leaves your hand. Most people throw 5 to 11 m/s; record throwers reach about 27 m/s. Too fast and a light plane
              loops or tears.
            </InfoDot>
          }
        />
        <Slider
          label="Angle"
          min={THROW_LIMITS.minPitchDeg}
          max={60}
          step={1}
          value={Math.min(pitchDeg, 60)}
          origin={0}
          onChange={(v) => onChange({ speed, pitchDeg: v })}
          format={(v) => signedDeg(v)}
          disabled={disabled}
          info={
            <InfoDot label="About the launch angle" title="Launch angle">
              The direction of the throw above the horizon. Gliders like a level push; distance throws go up at 10 to 45 degrees and trade speed for
              height.
            </InfoDot>
          }
        />
      </div>
      {children}
      <Button variant="primary" size="lg" block icon="fly" onClick={onThrow} disabled={disabled} aria-label={`${throwLabel}: ${arm.toLowerCase()} throw`}>
        {throwLabel}
      </Button>
    </div>
  );
}
