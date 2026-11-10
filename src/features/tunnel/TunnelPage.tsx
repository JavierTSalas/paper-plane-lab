import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { STANDARD_GRAVITY } from '../../core/airframe';
import { computePolar, tunnelReading } from '../../core/tunnel';
import { STANDARD_AIR, useCurrentDesign, usePlaneBuild, useTrimAnalysis } from '../../app/hooks';
import { useLab } from '../../app/store';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { fixed, formatSpeed, signedDeg } from '../../ui/format';
import { Icon } from '../../ui/icons';
import { InfoDot } from '../../ui/InfoDot';
import { SectionHeader } from '../../ui/SectionHeader';
import { Slider } from '../../ui/Slider';
import { PolarCharts } from './PolarCharts';
import { LevelBanner, Readouts } from './Readouts';
import { StabilityCard } from './StabilityCard';
import { TunnelView } from './TunnelView';
import './tunnel.css';

const SPEED_MIN = 1;
const SPEED_MAX = 15;
const ALPHA_MIN = -10;
const ALPHA_MAX = 60;
const BETA_MAX = 20;
/** Polar sweep speed when the plane has no trim (doc 01 section 1: typical glide 3-5 m/s). */
const FALLBACK_SPEED = 4;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export default function TunnelPage(): ReactElement {
  const units = useLab((s) => s.settings.units);
  const planeId = useLab((s) => s.currentPlaneId);
  const markAssignment = useLab((s) => s.markAssignment);
  // Opening the tunnel counts for the Professor's "try the wind tunnel" assignment.
  useEffect(() => markAssignment('try-tunnel'), [markAssignment]);
  const updateTrim = useLab((s) => s.updateTrim);
  const stored = useCurrentDesign();

  // Without a saved plane (the fallback Classic Dart) the elevator is tried out locally and not stored.
  const [localElevator, setLocalElevator] = useState<number | null>(null);
  const design = useMemo(
    () => (planeId === null && localElevator !== null ? { ...stored, trim: { ...stored.trim, elevatorDeg: localElevator } } : stored),
    [stored, planeId, localElevator],
  );
  const build = usePlaneBuild(design)!;
  const trim = useTrimAnalysis(build)!;
  const { airframe, model } = build;

  const [speed, setSpeed] = useState(() => clamp(trim.speed ?? 5, SPEED_MIN, SPEED_MAX));
  const [alphaDeg, setAlpha] = useState(() => clamp(trim.alphaDeg ?? 5, ALPHA_MIN, ALPHA_MAX));
  const [betaDeg, setBeta] = useState(0);

  // The polar depends on the airframe only (swept at the glide speed), never on the sliders.
  const polarSpeed = trim.speed ?? FALLBACK_SPEED;
  const polar = useMemo(() => computePolar(airframe, STANDARD_AIR, { speed: polarSpeed, fromDeg: ALPHA_MIN, toDeg: ALPHA_MAX }), [airframe, polarSpeed]);
  const reading = useMemo(() => tunnelReading(airframe, { speed, alphaDeg, betaDeg }, STANDARD_AIR), [airframe, speed, alphaDeg, betaDeg]);

  const weight = airframe.mass * STANDARD_GRAVITY;
  const stalled = alphaDeg > trim.stallAlphaDeg;
  const speedText = formatSpeed(speed, units);
  const mN = (n: number): string => `${fixed(n * 1000, 0)} mN`;

  const goToTrim = (): void => {
    if (trim.alphaDeg === null || trim.speed === null) return;
    setAlpha(clamp(trim.alphaDeg, ALPHA_MIN, ALPHA_MAX));
    setSpeed(clamp(trim.speed, SPEED_MIN, SPEED_MAX));
  };
  const atTrim = trim.alphaDeg !== null && trim.speed !== null && Math.abs(alphaDeg - trim.alphaDeg) < 0.05 && Math.abs(speed - trim.speed) < 0.05;

  const onElevator = (deg: number): void => {
    if (planeId === null) setLocalElevator(deg);
    else updateTrim(planeId, { elevatorDeg: deg });
  };

  return (
    <div className="ppl-page ppl-tunnel">
      <SectionHeader as="h2" eyebrow="In the tunnel" title={design.name} subtitle="Hold the plane still in moving air and read the forces on it." />

      <div className="ppl-tunnel__grid">
        <div className="ppl-tunnel__main">
          <Card padding="none" className="ppl-tunnel__stage">
            <TunnelView model={model} cg={airframe.cg} reading={reading} weight={weight} stalled={stalled} speedText={speedText} />
            <div className="ppl-tunnel__stage-note">
              <ul className="ppl-tunnel__legend" aria-label="Forces">
                <li>
                  <span className="ppl-tunnel__key is-lift" aria-hidden="true" />L Lift {mN(reading.lift)}
                </li>
                <li>
                  <span className="ppl-tunnel__key is-drag" aria-hidden="true" />D Drag {mN(reading.drag)}
                </li>
                <li>
                  <span className="ppl-tunnel__key" aria-hidden="true" />W Weight {mN(weight)}
                </li>
              </ul>
              <div className="ppl-caption ppl-tunnel__stage-caption">
                {stalled ? 'Stalled: the air has torn away from the top of the wing.' : 'Smoke follows the air around the plane.'}
                <InfoDot label="About this picture" title="A picture, and the real numbers" topic="how-it-works">
                  The smoke is a two-dimensional idealisation: ideal flow past a flat plate, with its swirl scaled so it makes the lift computed for your plane. The numbers come
                  from the full 3D element model that also flies the plane. The arrows share one scale and start at the centre of pressure (blue dot; hollow when it lies
                  beyond the plane).
                </InfoDot>
              </div>
            </div>
          </Card>

          <Card className="ppl-stack ppl-tunnel__controls">
            <Slider
              label="Airspeed"
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={0.1}
              value={speed}
              onChange={setSpeed}
              format={(v) => formatSpeed(v, units)}
              ticks={[1, 5, 10, 15]}
              tickLabels
              tickFormat={(v) => formatSpeed(v, units, { digits: 0 })}
            />
            <Slider
              label="Angle of attack"
              info={
                <InfoDot label="What is the angle of attack?" title="Angle of attack" topic="lift-and-drag">
                  The angle between the wing and the oncoming air. More angle, more lift, until the wing stalls.
                </InfoDot>
              }
              min={ALPHA_MIN}
              max={ALPHA_MAX}
              step={0.5}
              value={alphaDeg}
              onChange={setAlpha}
              format={(v) => `${fixed(v, 1)}°`}
              ticks={[-10, 0, 15, 30, 45, 60]}
              tickLabels
              tickFormat={(v) => `${v}°`}
              hint={`Stalls at about ${fixed(trim.stallAlphaDeg, 0)}°`}
            />
            <div className="ppl-tunnel__trimrow">
              <Button variant="primary" icon="target" onClick={goToTrim} disabled={!trim.trimmable || atTrim}>
                {atTrim ? 'At trim' : 'Go to trim'}
              </Button>
              <span className="ppl-small ppl-muted">
                {trim.trimmable && trim.alphaDeg !== null && trim.speed !== null
                  ? `Glides by itself at ${fixed(trim.alphaDeg, 1)}° and ${formatSpeed(trim.speed, units)}.`
                  : 'No steady glide with this trim. See the stability card.'}
              </span>
            </div>
            <details className="ppl-tunnel__more">
              <summary>
                <Icon name="angle" size={18} />
                Sideslip {betaDeg !== 0 && <span className="ppl-num">({signedDeg(betaDeg, 0)})</span>}
              </summary>
              <Slider
                label="Sideslip"
                info={
                  <InfoDot label="What is sideslip?" title="Sideslip" topic="stability-and-trim">
                    Wind arriving from one side, as when the plane skids. The side view stays the same; watch lift and the moments change.
                  </InfoDot>
                }
                min={-BETA_MAX}
                max={BETA_MAX}
                step={1}
                origin={0}
                value={betaDeg}
                onChange={setBeta}
                format={(v) => (v === 0 ? '0°' : `${signedDeg(v, 0)} ${v > 0 ? 'from right' : 'from left'}`)}
                ticks={[-20, -10, 0, 10, 20]}
              />
            </details>
          </Card>
        </div>

        <div className="ppl-tunnel__side">
          <LevelBanner reading={reading} weight={weight} gliding={atTrim && betaDeg === 0} />
          <Readouts reading={reading} weight={weight} mass={airframe.mass} units={units} />
          <Card as="section" className="ppl-stack" aria-labelledby="ppl-tunnel-polars">
            <SectionHeader as="h3" id="ppl-tunnel-polars" title="Polars" subtitle={`Every angle at ${formatSpeed(polarSpeed, units)}, in one sweep.`} />
            <PolarCharts polar={polar} trim={trim} alphaDeg={alphaDeg} speedText={formatSpeed(polarSpeed, units)} />
          </Card>
          <StabilityCard
            model={model}
            airframe={airframe}
            trim={trim}
            polar={polar}
            units={units}
            elevatorDeg={design.trim.elevatorDeg}
            onElevator={onElevator}
            elevatorHint={planeId === null ? 'Try it here; fold your own plane to keep a trim.' : undefined}
          />
        </div>
      </div>
    </div>
  );
}
