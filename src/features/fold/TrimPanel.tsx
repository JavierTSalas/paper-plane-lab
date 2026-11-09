import type { ReactElement } from 'react';
import { usePlaneBuild } from '../../app/hooks';
import { useLab } from '../../app/store';
import type { PlaneDesign, TrimSpec } from '../../core/types';
import { cx } from '../../ui/cx';
import { formatLength, formatMass, signedDeg, type UnitSystem } from '../../ui/format';
import { InfoDot } from '../../ui/InfoDot';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Slider } from '../../ui/Slider';
import { Toggle } from '../../ui/Toggle';
import './fold.css';

export interface TrimPanelProps {
  /** The plane being trimmed; its geometry sets the chord (for millimetres of bend) and the clip range. */
  design: PlaneDesign;
  /**
   * New trim. `key` names the control that changed, so a caller with undo history can merge one slider
   * drag into one entry.
   */
  onChange: (trim: TrimSpec, key: string) => void;
  className?: string;
}

/** Paper clip masses: a small No. 1 clip and a jumbo clip, kg. */
export const CLIP_MASSES = { small: 0.0005, large: 0.0015 } as const;
type ClipSize = keyof typeof CLIP_MASSES;

const DEG = Math.PI / 180;

/** How far the trailing edge moves for a bend of `deg` over a flap of `flap` metres. */
const bendLift = (flap: number, deg: number): number => flap * Math.sin(Math.abs(deg) * DEG);

/** The hand adjustments a folder makes after folding: elevator, ailerons, rudder and a paper clip. */
export function TrimPanel({ design, onChange, className }: TrimPanelProps): ReactElement {
  const units: UnitSystem = useLab((s) => s.settings.units);
  const build = usePlaneBuild(design)!;
  const trim = design.trim;
  const mac = build.airframe.ref.mac;
  const length = build.model.length;
  const flap = trim.elevatorChordFrac * mac;
  const set = (patch: Partial<TrimSpec>, key: string): void => onChange({ ...trim, ...patch }, key);

  const mm = (deg: number, dirUp: string, dirDown: string): string => {
    if (Math.abs(deg) < 0.5) return 'flat';
    const d = formatLength(bendLift(flap, deg), units, { unit: units === 'metric' ? 'mm' : 'in', digits: units === 'metric' ? 1 : 2 });
    return `${d} ${deg > 0 ? dirUp : dirDown}`;
  };

  const clipSize: ClipSize = trim.clip && trim.clip.mass > 0.001 ? 'large' : 'small';
  const clipFromNose = trim.clip ? Math.max(0, length - trim.clip.x) : 0;

  return (
    <div className={cx('ppl-trim', className)}>
      <Slider
        label="Elevator"
        info={
          <InfoDot label="What does the elevator do?" title="Elevator: bend the back edges up">
            A folder bends the back edge of both wings up a little. The air then pushes the tail down and the nose up, which turns a dive
            into a glide. Too much and the plane climbs, stalls and swoops.
          </InfoDot>
        }
        min={-10}
        max={20}
        step={1}
        origin={0}
        ticks={[-10, 0, 10, 20]}
        value={trim.elevatorDeg}
        onChange={(v) => set({ elevatorDeg: v }, 'trim.elevator')}
        format={(v) => `${signedDeg(v)} · ${mm(v, 'up', 'down')}`}
      />
      <Slider
        label="Bend depth"
        info={
          <InfoDot label="What is the bend depth?" title="How much of the edge you bend">
            The strip of wing you bend, measured forward from the back edge. A deeper strip acts more strongly for the same angle, like a
            bigger elevator on a real plane.
          </InfoDot>
        }
        min={0.05}
        max={0.35}
        step={0.01}
        value={trim.elevatorChordFrac}
        onChange={(v) => set({ elevatorChordFrac: v }, 'trim.depth')}
        format={(v) => `${formatLength(v * mac, units, { unit: units === 'metric' ? 'mm' : 'in', digits: units === 'metric' ? 0 : 2 })} · ${Math.round(v * 100)} % of the chord`}
      />
      <Slider
        label="Ailerons"
        info={
          <InfoDot label="What do the ailerons do?" title="Ailerons: one up, one down">
            Bend one back edge up and the other down by the same amount. The plane rolls toward the side bent up. Use it to cancel a plane
            that keeps rolling one way.
          </InfoDot>
        }
        min={-10}
        max={10}
        step={1}
        origin={0}
        ticks={[-10, 0, 10]}
        value={trim.aileronDeg}
        onChange={(v) => set({ aileronDeg: v }, 'trim.aileron')}
        format={(v) => (Math.abs(v) < 0.5 ? '0° · level' : `${signedDeg(v)} · rolls ${v > 0 ? 'right' : 'left'} · ${mm(v, 'each', 'each')}`)}
      />
      <Slider
        label="Rudder"
        info={
          <InfoDot label="What does the rudder do?" title="Rudder: bend the back of the keel">
            Bend the rear of the keel a little to one side and the nose turns that way. A small bend straightens a plane that curves.
          </InfoDot>
        }
        min={-15}
        max={15}
        step={1}
        origin={0}
        ticks={[-15, 0, 15]}
        value={trim.rudderDeg}
        onChange={(v) => set({ rudderDeg: v }, 'trim.rudder')}
        format={(v) => (Math.abs(v) < 0.5 ? '0° · straight' : `${signedDeg(v)} · turns ${v > 0 ? 'right' : 'left'}`)}
      />

      <div className="ppl-trim__clip">
        <div className="ppl-trim__cliphead">
          <Toggle
            label="Paper clip"
            description="Weight on the keel moves the balance point."
            checked={trim.clip !== null}
            onChange={(on) => set({ clip: on ? { mass: CLIP_MASSES.small, x: length * 0.85 } : null }, 'trim.clip')}
          />
          <InfoDot label="Why a paper clip?" title="Ballast">
            A clip near the nose moves the centre of gravity forward, which steadies a plane that flips nose-up. Further back, it lets a
            nose-heavy plane glide slower. It also adds weight, so the glide gets faster.
          </InfoDot>
        </div>
        {trim.clip && (
          <>
            <SegmentedControl<ClipSize>
              label="Clip size"
              block
              size="sm"
              value={clipSize}
              onChange={(s) => set({ clip: { mass: CLIP_MASSES[s], x: trim.clip!.x } }, 'trim.clipmass')}
              options={[
                { value: 'small', label: `Small · ${formatMass(CLIP_MASSES.small, units)}` },
                { value: 'large', label: `Large · ${formatMass(CLIP_MASSES.large, units)}` },
              ]}
            />
            <Slider
              label="Clip position"
              min={0}
              max={Math.max(0.01, length)}
              step={0.001}
              value={clipFromNose}
              onChange={(v) => set({ clip: { mass: trim.clip!.mass, x: Math.max(0, length - v) } }, 'trim.clipx')}
              format={(v) => `${formatLength(v, units, { unit: units === 'metric' ? 'mm' : 'in', digits: units === 'metric' ? 0 : 1 })} behind the nose`}
            />
          </>
        )}
      </div>
    </div>
  );
}
