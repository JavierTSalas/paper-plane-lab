import { useRef, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { windDirectionLabel, wrapDeg } from './flight';

export interface WindDialProps {
  /** Direction the wind blows toward, degrees (0 = with the throw, 180 = headwind). */
  value: number;
  onChange: (deg: number) => void;
  disabled?: boolean;
}

const SIZE = 132;
const C = SIZE / 2;
const R = 50;

/**
 * Top view: the thrower at the centre, the throw going up the dial. The arrow shows where the wind blows.
 * Drag the arrow or use the arrow keys (15 degree steps).
 */
export function WindDial({ value, onChange, disabled }: WindDialProps): ReactElement {
  const ref = useRef<SVGSVGElement>(null);
  const d = wrapDeg(value);
  // Screen: throw (+x) is up, +z (the thrower's right) is to the right.
  const rad = (d * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = -Math.cos(rad);

  const fromPointer = (e: PointerEvent<SVGSVGElement>): void => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const x = e.clientX - box.left - box.width / 2;
    const y = e.clientY - box.top - box.height / 2;
    if (Math.hypot(x, y) < 6) return;
    const deg = (Math.atan2(x, -y) * 180) / Math.PI;
    onChange(Math.round(wrapDeg(deg) / 5) * 5);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>): void => {
    const step = e.shiftKey ? 45 : 15;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(wrapDeg(d + step));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(wrapDeg(d - step));
    else return;
    e.preventDefault();
  };

  const tip = [C + ux * R, C + uy * R];
  const tail = [C - ux * R * 0.75, C - uy * R * 0.75];
  const px = -uy;
  const py = ux;
  return (
    <svg
      ref={ref}
      className="ppl-winddial"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Wind direction"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(d)}
      aria-valuetext={windDirectionLabel(d)}
      aria-disabled={disabled}
      onKeyDown={disabled ? undefined : onKey}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => {
        if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
      }}
    >
      <circle cx={C} cy={C} r={R + 8} className="ppl-winddial__face" />
      <text x={C} y={14} textAnchor="middle" className="ppl-winddial__mark">
        throw
      </text>
      <path d={`M${C} ${C - 18} l-5 8 h10 z`} className="ppl-winddial__throw" />
      <circle cx={C} cy={C} r={4} className="ppl-winddial__you" />
      <line x1={tail[0]} y1={tail[1]} x2={tip[0]} y2={tip[1]} className="ppl-winddial__arrow" />
      <path d={`M${tip[0]} ${tip[1]} L${tip[0] - ux * 12 + px * 7} ${tip[1] - uy * 12 + py * 7} L${tip[0] - ux * 12 - px * 7} ${tip[1] - uy * 12 - py * 7} Z`} className="ppl-winddial__head" />
    </svg>
  );
}
