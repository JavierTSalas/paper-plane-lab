import type { ReactElement } from 'react';
import { ENVIRONMENTS } from '../../core/env';
import type { Environment } from '../../core/types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Tag } from '../../ui/Chip';
import { cx } from '../../ui/cx';
import { formatLength, formatSpeed, type UnitSystem } from '../../ui/format';
import { Icon } from '../../ui/icons';
import { InfoDot } from '../../ui/InfoDot';
import { Sheet } from '../../ui/Sheet';
import { Slider } from '../../ui/Slider';
import { beaufort, windDirectionLabel } from './flight';
import { WindDial } from './WindDial';

export interface WindSetting {
  speed: number;
  towardDeg: number;
  gustiness: number;
}

export function defaultWind(env: Environment): WindSetting {
  return { speed: env.wind.speed, towardDeg: env.wind.towardDeg ?? 0, gustiness: env.wind.gustiness };
}

/** One line about a place: room size indoors, wind outdoors. */
export function placeSummary(env: Environment, wind: WindSetting, units: UnitSystem): string {
  if (env.bounds) {
    const b = env.bounds;
    return `${formatLength(b.xMax - b.xMin, units, { digits: 0 })} × ${formatLength(b.zMax - b.zMin, units, { digits: 0 })}, still air`;
  }
  return `${formatSpeed(wind.speed, units)} ${windDirectionLabel(wind.towardDeg).toLowerCase()}`;
}

export interface EnvironmentSheetProps {
  open: boolean;
  onClose: () => void;
  envId: string;
  onSelect: (id: string) => void;
  wind: WindSetting;
  onWind: (w: WindSetting) => void;
  units: UnitSystem;
}

const GLYPH: Record<string, 'hangar' | 'sun' | 'wind' | 'cloud' | 'ruler'> = {
  classroom: 'ruler',
  gym: 'hangar',
  hangar: 'hangar',
  meadow: 'sun',
  hill: 'wind',
  cliff: 'cloud',
};

export function EnvironmentSheet({ open, onClose, envId, onSelect, wind, onWind, units }: EnvironmentSheetProps): ReactElement {
  const env = ENVIRONMENTS.find((e) => e.id === envId) ?? ENVIRONMENTS[0];
  const bf = beaufort(wind.speed);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Where to fly"
      description="Indoors the air is still and every throw repeats. Outdoors the wind is real: it gusts, and no two flights are the same."
      size="md"
      footer={
        <Button variant="primary" block onClick={onClose}>
          Done
        </Button>
      }
    >
      <ul className="ppl-fly-places" role="list">
        {ENVIRONMENTS.map((e) => {
          const selected = e.id === envId;
          return (
            <li key={e.id}>
              <button type="button" className={cx('ppl-fly-place', selected && 'is-selected')} aria-pressed={selected} onClick={() => onSelect(e.id)}>
                <span className="ppl-fly-place__icon" aria-hidden="true">
                  <Icon name={GLYPH[e.id] ?? 'sun'} size={22} />
                </span>
                <span className="ppl-fly-place__text">
                  <span className="ppl-fly-place__name">
                    {e.name}
                    <Tag tone={e.indoor ? 'neutral' : 'sky'}>{e.indoor ? 'Indoors' : 'Outdoors'}</Tag>
                  </span>
                  <span className="ppl-fly-place__blurb">{e.blurb}</span>
                  <span className="ppl-fly-place__meta">{placeSummary(e, e.id === envId ? wind : defaultWind(e), units)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {env.adjustableWind && (
        <Card tone="sunken" padding="md" className="ppl-fly-wind">
          <h3 className="ppl-fly-wind__title">
            Wind <span className="ppl-fly-wind__bf">Beaufort {bf.force} · {bf.name}</span>
            <InfoDot label="About the wind settings" title="Wind" topic="wind">
              Speed is measured 10 m above the ground, as weather stations do; over grass at head height it is about 30 % weaker. The Beaufort number is the
              sailors' scale for the same speed.
            </InfoDot>
          </h3>
          <Slider label="Speed" min={0} max={env.maxWind} step={0.1} value={wind.speed} onChange={(v) => onWind({ ...wind, speed: v })} format={(v) => formatSpeed(v, units)} />
          <div className="ppl-fly-wind__dir">
            <WindDial value={wind.towardDeg} onChange={(v) => onWind({ ...wind, towardDeg: v })} />
            <div>
              <p className="ppl-fly-wind__dirlabel">{windDirectionLabel(wind.towardDeg)}</p>
              <p className="ppl-fly-wind__hint">Drag the arrow. A headwind slows the plane over the ground but helps it climb; a tailwind carries it further.</p>
              <div className="ppl-fly-wind__quick">
                {(
                  [
                    ['Head', 180],
                    ['Tail', 0],
                    ['Cross', 90],
                  ] as const
                ).map(([l, d]) => (
                  <Button key={l} size="sm" variant={Math.round(wind.towardDeg) === d ? 'primary' : 'secondary'} onClick={() => onWind({ ...wind, towardDeg: d })}>
                    {l}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <Slider
            label="Gustiness"
            min={0}
            max={1}
            step={0.05}
            value={wind.gustiness}
            onChange={(v) => onWind({ ...wind, gustiness: v })}
            format={(v) => (v < 0.05 ? 'Steady' : v < 0.4 ? 'A few gusts' : v < 0.75 ? 'Gusty' : 'Very gusty')}
            info={
              <InfoDot label="About gustiness" title="Gusts">
                How often and how hard sudden gusts come on top of the normal turbulence. Real wind is never steady.
              </InfoDot>
            }
          />
        </Card>
      )}
    </Sheet>
  );
}
