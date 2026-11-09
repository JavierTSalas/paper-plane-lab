import { describe, expect, it } from 'vitest';
import {
  DASH,
  FIGURE_SPACE,
  MINUS,
  NBSP,
  autoLengthUnit,
  convertLength,
  convertSpeed,
  convertWingLoading,
  fixed,
  formatArea,
  formatCompact,
  formatDeg,
  formatLength,
  formatMass,
  formatPaperDims,
  formatPercent,
  formatRad,
  formatRatio,
  formatSpeed,
  formatTime,
  formatWingLoading,
  lengthParts,
  padFixed,
  signed,
  signedDeg,
  speedParts,
  trimZeros,
} from './format';

const s = (text: string): string => text.replaceAll(NBSP, ' ');

describe('number helpers', () => {
  it('fixed uses a true minus, groups thousands and never prints -0', () => {
    expect(fixed(-1.25, 1)).toBe(`${MINUS}1.3`);
    expect(fixed(-0.04, 1)).toBe('0.0');
    expect(fixed(12345.678, 2)).toBe('12,345.68');
    expect(fixed(Number.NaN)).toBe(DASH);
    expect(fixed(Number.POSITIVE_INFINITY)).toBe(DASH);
  });

  it('signed always carries a sign except for zero', () => {
    expect(signed(1.24, 1)).toBe('+1.2');
    expect(signed(-1.24, 1)).toBe(`${MINUS}1.2`);
    expect(signed(0.01, 1)).toBe('0.0');
  });

  it('padFixed pads with figure spaces to a fixed width', () => {
    expect(padFixed(3.14159, 2, 6)).toBe(`${FIGURE_SPACE}${FIGURE_SPACE}3.14`);
    expect(padFixed(123.4, 1, 3)).toBe('123.4');
  });

  it('trimZeros and compact numbers', () => {
    expect(trimZeros('8.50')).toBe('8.5');
    expect(trimZeros('11.00')).toBe('11');
    expect(trimZeros('210')).toBe('210');
    expect(formatCompact(1234)).toBe('1,234');
    expect(formatCompact(21_480)).toBe('21.5k');
    expect(formatCompact(250_000)).toBe('250k');
    expect(formatCompact(4_200_000)).toBe('4.2M');
  });

  it('percent and ratio', () => {
    expect(s(formatPercent(0.936))).toBe('94 %');
    expect(s(formatRatio(8.24))).toBe('8.2 : 1');
    expect(formatRatio(null)).toBe(DASH);
  });
});

describe('length', () => {
  it('picks a readable metric unit by magnitude', () => {
    expect(s(formatLength(12.345, 'metric'))).toBe('12.3 m');
    expect(s(formatLength(3.456, 'metric'))).toBe('3.46 m');
    expect(s(formatLength(0.297, 'metric'))).toBe('29.7 cm');
    expect(s(formatLength(0.004, 'metric'))).toBe('4.0 mm');
    expect(s(formatLength(0.000106, 'metric'))).toBe('0.11 mm');
  });

  it('switches between feet and inches at one yard', () => {
    expect(autoLengthUnit(0.9, 'imperial')).toBe('in');
    expect(autoLengthUnit(1, 'imperial')).toBe('ft');
    expect(s(formatLength(10, 'imperial'))).toBe('32.8 ft');
    expect(s(formatLength(0.2794, 'imperial'))).toBe('11.0 in');
  });

  it('honours an explicit unit and digits', () => {
    expect(lengthParts(0.21, 'metric', { unit: 'mm', digits: 0 })).toEqual({ value: '210', unit: 'mm' });
    expect(convertLength(1, 'ft')).toBeCloseTo(3.28084, 5);
  });

  it('formats paper dimensions', () => {
    expect(s(formatPaperDims(0.21, 0.297, 'metric'))).toBe('210 × 297 mm');
    expect(s(formatPaperDims(0.2159, 0.2794, 'imperial'))).toBe('8.5 × 11 in');
    expect(s(formatPaperDims(0.21, 0.297, 'imperial'))).toBe('8.27 × 11.69 in');
  });
});

describe('speed', () => {
  it('uses m/s or mph by default', () => {
    expect(s(formatSpeed(10, 'metric'))).toBe('10.0 m/s');
    expect(s(formatSpeed(10, 'imperial'))).toBe('22.4 mph');
  });

  it('converts to km/h and ft/s on request', () => {
    expect(speedParts(10, 'metric', { unit: 'km/h', digits: 0 })).toEqual({ value: '36', unit: 'km/h' });
    expect(convertSpeed(1, 'ft/s')).toBeCloseTo(3.28084, 5);
  });
});

describe('mass and area', () => {
  it('formats a sheet of A4 at 80 gsm', () => {
    const kg = 0.08 * 0.21 * 0.297;
    expect(s(formatMass(kg, 'metric'))).toBe('4.99 g');
    expect(s(formatMass(kg, 'imperial'))).toBe('0.18 oz');
    expect(s(formatMass(1.5, 'metric'))).toBe('1.50 kg');
  });

  it('formats wing area', () => {
    expect(s(formatArea(0.0123, 'metric'))).toBe('123 cm²');
    expect(s(formatArea(0.00456, 'metric'))).toBe('45.6 cm²');
    expect(s(formatArea(0.0123, 'imperial'))).toBe('19.1 in²');
    expect(s(formatArea(2, 'metric'))).toBe('2.0 m²');
  });
});

describe('angle and time', () => {
  it('degrees have no space before the sign', () => {
    expect(formatDeg(12.4)).toBe('12°');
    expect(formatRad(Math.PI / 4, 1)).toBe('45.0°');
    expect(signedDeg(-3)).toBe(`${MINUS}3°`);
    expect(signedDeg(2.5, 1)).toBe('+2.5°');
  });

  it('formats seconds and minutes', () => {
    expect(s(formatTime(3.42))).toBe('3.4 s');
    expect(s(formatTime(62.44))).toBe('1:02.4 min');
    expect(s(formatTime(119.96))).toBe('2:00.0 min');
    expect(formatTime(Number.NaN)).toBe(DASH);
  });
});

describe('wing loading', () => {
  it('converts N/m² to g/dm² and oz/ft²', () => {
    // 1 kg/m² = 9.80665 N/m² = 10 g/dm² = (1 / 0.0283495) * 0.092903 = 3.277 oz/ft²
    expect(convertWingLoading(9.80665, 'g/dm²')).toBeCloseTo(10, 9);
    expect(convertWingLoading(9.80665, 'oz/ft²')).toBeCloseTo(3.27706, 4);
    expect(s(formatWingLoading(2.5, 'metric'))).toBe('2.50 N/m²');
    expect(s(formatWingLoading(2.5, 'metric', { unit: 'g/dm²' }))).toBe('2.55 g/dm²');
    expect(s(formatWingLoading(2.5, 'imperial'))).toBe('0.835 oz/ft²');
  });
});
