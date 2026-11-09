/**
 * Display-edge unit conversion and number formatting. Inputs are always SI (metres, kg, m/s, s, N/m²);
 * output follows the user's unit system. Every formatter has a `...Parts` twin returning the number and
 * the unit separately, for layouts that style them differently (Stat, HUD).
 */

export type UnitSystem = 'metric' | 'imperial';

export interface Quantity {
  value: string;
  unit: string;
}

export const NBSP = ' ';
/** U+2212: same advance width as digits in most fonts, unlike the hyphen. */
export const MINUS = '−';
/** U+2007: a space exactly one digit wide, for padding tabular readouts. */
export const FIGURE_SPACE = ' ';
export const DASH = '—';

export const M_PER_FT = 0.3048;
export const M_PER_IN = 0.0254;
export const KG_PER_OZ = 0.028349523125;
export const MPS_PER_MPH = 0.44704;
export const MPS_PER_KMH = 1 / 3.6;
/** Standard gravity, m/s² (only used to express wing loading as a mass per area). */
const G0 = 9.80665;
const M2_PER_FT2 = M_PER_FT * M_PER_FT;

/* ------------------------------------------------------------------ numbers */

const formatters = new Map<number, Intl.NumberFormat>();

function numberFormat(digits: number): Intl.NumberFormat {
  let f = formatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(digits, f);
  }
  return f;
}

/** Fixed decimals with a true minus sign and digit grouping. `-0.0` prints as `0.0`; non-finite as an em dash. */
export function fixed(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return DASH;
  const text = numberFormat(digits).format(v);
  const isZero = Number(text.replace(/[^0-9.]/g, '')) === 0;
  if (isZero) return text.replace('-', '');
  return text.replace('-', MINUS);
}

/** Like `fixed` but always carries a sign: `+1.2`, `−1.2`, `0.0`. */
export function signed(v: number, digits = 1): string {
  const text = fixed(v, digits);
  if (text === DASH || text.startsWith(MINUS)) return text;
  return Number(text.replace(/,/g, '')) === 0 ? text : `+${text}`;
}

/** Fixed decimals left-padded with figure spaces to `width` characters, so readouts never jitter. */
export function padFixed(v: number, digits: number, width: number): string {
  const text = fixed(v, digits);
  return text.length >= width ? text : FIGURE_SPACE.repeat(width - text.length) + text;
}

/** Drop trailing zeros after the decimal point: `8.50` -> `8.5`, `11.00` -> `11`. */
export function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

export function join(q: Quantity): string {
  return q.unit ? `${q.value}${NBSP}${q.unit}` : q.value;
}

/** 1,234 / 12.3k / 4.2M. For counts and Reynolds numbers. */
export function formatCompact(v: number): string {
  if (!Number.isFinite(v)) return DASH;
  const a = Math.abs(v);
  if (a < 10_000) return fixed(v, 0);
  if (a < 1_000_000) return `${trimZeros(fixed(v / 1000, a < 100_000 ? 1 : 0))}k`;
  return `${trimZeros(fixed(v / 1_000_000, 1))}M`;
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${fixed(fraction * 100, digits)}${NBSP}%`;
}

/** Glide ratio and similar: `8.2 : 1`. */
export function formatRatio(r: number | null, digits = 1): string {
  return r === null || !Number.isFinite(r) ? DASH : `${fixed(r, digits)}${NBSP}:${NBSP}1`;
}

/* ------------------------------------------------------------------ length */

export type LengthUnit = 'm' | 'cm' | 'mm' | 'ft' | 'in';

const METRES_PER: Record<LengthUnit, number> = { m: 1, cm: 0.01, mm: 0.001, ft: M_PER_FT, in: M_PER_IN };

export function convertLength(metres: number, unit: LengthUnit): number {
  return metres / METRES_PER[unit];
}

/** The unit `formatLength` picks automatically for a magnitude. */
export function autoLengthUnit(metres: number, units: UnitSystem): LengthUnit {
  const a = Math.abs(metres);
  if (units === 'imperial') return a >= 3 * M_PER_FT ? 'ft' : 'in';
  if (a >= 1) return 'm';
  return a >= 0.01 ? 'cm' : 'mm';
}

function defaultLengthDigits(unit: LengthUnit, value: number): number {
  if (unit === 'mm') return Math.abs(value) < 1 ? 2 : 1;
  if (unit === 'm') return Math.abs(value) < 10 ? 2 : 1;
  return 1;
}

export interface FormatOptions<U extends string> {
  unit?: U;
  digits?: number;
}

export function lengthParts(metres: number, units: UnitSystem, opts: FormatOptions<LengthUnit> = {}): Quantity {
  const unit = opts.unit ?? autoLengthUnit(metres, units);
  const value = convertLength(metres, unit);
  return { value: fixed(value, opts.digits ?? defaultLengthDigits(unit, value)), unit };
}

export function formatLength(metres: number, units: UnitSystem, opts?: FormatOptions<LengthUnit>): string {
  return join(lengthParts(metres, units, opts));
}

/** Paper dimensions: `210 × 297 mm` or `8.5 × 11 in`. */
export function formatPaperDims(width: number, height: number, units: UnitSystem): string {
  const unit: LengthUnit = units === 'imperial' ? 'in' : 'mm';
  const digits = units === 'imperial' ? 2 : 1;
  const w = trimZeros(fixed(convertLength(width, unit), digits));
  const h = trimZeros(fixed(convertLength(height, unit), digits));
  return `${w}${NBSP}×${NBSP}${h}${NBSP}${unit}`;
}

/* ------------------------------------------------------------------ speed */

export type SpeedUnit = 'm/s' | 'km/h' | 'mph' | 'ft/s';

const MPS_PER: Record<SpeedUnit, number> = { 'm/s': 1, 'km/h': MPS_PER_KMH, mph: MPS_PER_MPH, 'ft/s': M_PER_FT };

export function convertSpeed(mps: number, unit: SpeedUnit): number {
  return mps / MPS_PER[unit];
}

export function defaultSpeedUnit(units: UnitSystem): SpeedUnit {
  return units === 'imperial' ? 'mph' : 'm/s';
}

export function speedParts(mps: number, units: UnitSystem, opts: FormatOptions<SpeedUnit> = {}): Quantity {
  const unit = opts.unit ?? defaultSpeedUnit(units);
  return { value: fixed(convertSpeed(mps, unit), opts.digits ?? 1), unit };
}

export function formatSpeed(mps: number, units: UnitSystem, opts?: FormatOptions<SpeedUnit>): string {
  return join(speedParts(mps, units, opts));
}

/* ------------------------------------------------------------------ mass */

export type MassUnit = 'g' | 'kg' | 'oz';

export function convertMass(kg: number, unit: MassUnit): number {
  if (unit === 'g') return kg * 1000;
  return unit === 'oz' ? kg / KG_PER_OZ : kg;
}

export function massParts(kg: number, units: UnitSystem, opts: FormatOptions<MassUnit> = {}): Quantity {
  const unit = opts.unit ?? (units === 'imperial' ? 'oz' : Math.abs(kg) >= 1 ? 'kg' : 'g');
  const value = convertMass(kg, unit);
  const digits = opts.digits ?? (unit === 'oz' ? 2 : Math.abs(value) < 10 ? 2 : 1);
  return { value: fixed(value, digits), unit };
}

export function formatMass(kg: number, units: UnitSystem, opts?: FormatOptions<MassUnit>): string {
  return join(massParts(kg, units, opts));
}

/* ------------------------------------------------------------------ area */

export type AreaUnit = 'm²' | 'cm²' | 'in²' | 'ft²';

const M2_PER: Record<AreaUnit, number> = { 'm²': 1, 'cm²': 1e-4, 'in²': M_PER_IN * M_PER_IN, 'ft²': M2_PER_FT2 };

export function convertArea(m2: number, unit: AreaUnit): number {
  return m2 / M2_PER[unit];
}

export function areaParts(m2: number, units: UnitSystem, opts: FormatOptions<AreaUnit> = {}): Quantity {
  const unit = opts.unit ?? (units === 'imperial' ? (Math.abs(m2) >= M2_PER_FT2 ? 'ft²' : 'in²') : Math.abs(m2) >= 1 ? 'm²' : 'cm²');
  const value = convertArea(m2, unit);
  const digits = opts.digits ?? (Math.abs(value) >= 100 ? 0 : 1);
  return { value: fixed(value, digits), unit };
}

export function formatArea(m2: number, units: UnitSystem, opts?: FormatOptions<AreaUnit>): string {
  return join(areaParts(m2, units, opts));
}

/* ------------------------------------------------------------------ angle and time */

export const RAD_TO_DEG = 180 / Math.PI;

/** Degrees take no space before the sign (SI brochure §5.4.3). */
export function formatDeg(deg: number, digits = 0): string {
  const text = fixed(deg, digits);
  return text === DASH ? text : `${text}°`;
}

export function formatRad(rad: number, digits = 0): string {
  return formatDeg(rad * RAD_TO_DEG, digits);
}

export function signedDeg(deg: number, digits = 0): string {
  const text = signed(deg, digits);
  return text === DASH ? text : `${text}°`;
}

export function timeParts(seconds: number, digits = 1): Quantity {
  if (!Number.isFinite(seconds)) return { value: DASH, unit: '' };
  // Round first so 119.96 s becomes 2:00.0, not 1:60.0.
  const rounded = Number(seconds.toFixed(digits));
  if (Math.abs(rounded) < 60) return { value: fixed(rounded, digits), unit: 's' };
  const whole = Math.floor(rounded / 60);
  const rest = fixed(rounded - whole * 60, digits);
  const padded = Number(rest) < 10 ? `0${rest}` : rest;
  return { value: `${whole}:${padded}`, unit: 'min' };
}

/** `3.4 s`; a minute or more reads `1:02.4 min`. */
export function formatTime(seconds: number, digits = 1): string {
  return join(timeParts(seconds, digits));
}

/* ------------------------------------------------------------------ wing loading */

export type WingLoadingUnit = 'N/m²' | 'g/dm²' | 'oz/ft²';

/** Input is weight per area (N/m²), as in Airframe.ref.wingLoading. */
export function convertWingLoading(nPerM2: number, unit: WingLoadingUnit): number {
  const kgPerM2 = nPerM2 / G0;
  if (unit === 'g/dm²') return kgPerM2 * 10;
  if (unit === 'oz/ft²') return (kgPerM2 / KG_PER_OZ) * M2_PER_FT2;
  return nPerM2;
}

export function wingLoadingParts(nPerM2: number, units: UnitSystem, opts: FormatOptions<WingLoadingUnit> = {}): Quantity {
  const unit = opts.unit ?? (units === 'imperial' ? 'oz/ft²' : 'N/m²');
  return { value: fixed(convertWingLoading(nPerM2, unit), opts.digits ?? (unit === 'oz/ft²' ? 3 : 2)), unit };
}

export function formatWingLoading(nPerM2: number, units: UnitSystem, opts?: FormatOptions<WingLoadingUnit>): string {
  return join(wingLoadingParts(nPerM2, units, opts));
}
