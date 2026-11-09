import { useId, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';
import './Slider.css';

export interface SliderProps {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Formats the readout and aria-valuetext, e.g. `(v) => formatSpeed(v, units)`. */
  format?: (value: number) => string;
  /** Tick marks: explicit values, or a count of evenly spaced ticks including both ends. */
  ticks?: readonly number[] | number;
  /** Print tick values under the marks (uses `tickFormat`, then `format`). */
  tickLabels?: boolean;
  tickFormat?: (value: number) => string;
  /** The fill starts here instead of at `min` (e.g. 0 for a -10..+10 trim). */
  origin?: number;
  /** Fires once when the user lets go (pointer up, key up). */
  onCommit?: (value: number) => void;
  hint?: ReactNode;
  /** Slot after the label, typically an <InfoDot>. */
  info?: ReactNode;
  disabled?: boolean;
  hideLabel?: boolean;
  className?: string;
}

/** Thumb diameter in px; ticks and fill are inset by its radius so they line up with the thumb centre. */
const THUMB = 28;

function tickValues(ticks: SliderProps['ticks'], min: number, max: number): number[] {
  if (ticks === undefined) return [];
  if (typeof ticks !== 'number') return [...ticks];
  if (ticks < 2) return [];
  return Array.from({ length: ticks }, (_, i) => min + ((max - min) * i) / (ticks - 1));
}

const frac = (v: number, min: number, max: number): number => (max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0);
const at = (f: number): string => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${f.toFixed(4)})`;

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = String,
  ticks,
  tickLabels = false,
  tickFormat,
  origin,
  onCommit,
  hint,
  info,
  disabled,
  hideLabel,
  className,
}: SliderProps): ReactElement {
  const id = useId();
  const hintId = useId();
  const f = frac(value, min, max);
  const o = frac(origin ?? min, min, max);
  const style = { '--ppl-fill-from': at(Math.min(o, f)), '--ppl-fill-to': at(Math.max(o, f)) } as CSSProperties;
  const marks = tickValues(ticks, min, max);
  const commit = (e: { currentTarget: HTMLInputElement }): void => onCommit?.(Number(e.currentTarget.value));

  return (
    <div className={cx('ppl-slider', disabled && 'is-disabled', className)}>
      <div className={cx('ppl-slider__head', hideLabel && 'ppl-sr-only')}>
        <label htmlFor={id} className="ppl-slider__label">
          {label}
        </label>
        {info}
        <output htmlFor={id} className="ppl-slider__value ppl-num">
          {format(value)}
        </output>
      </div>
      <div className="ppl-slider__control" style={style}>
        <input
          id={id}
          type="range"
          className="ppl-slider__input"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={format(value)}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          onPointerUp={commit}
          onKeyUp={commit}
        />
        {marks.length > 0 && (
          <div className="ppl-slider__ticks" aria-hidden="true">
            {marks.map((t) => (
              <span key={t} className="ppl-slider__tick" style={{ left: at(frac(t, min, max)) }}>
                {tickLabels && <span className="ppl-slider__ticklabel ppl-num">{(tickFormat ?? format)(t)}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
      {hint && (
        <p id={hintId} className="ppl-slider__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
