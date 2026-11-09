import { describe, expect, it } from 'vitest';
import { defaultDesign } from '../core/designs';
import { flightKey, geometryKey, getPlaneBuild, getTrimAnalysis } from './hooks';

describe('plane build cache', () => {
  it('builds the default dart and reuses the result', () => {
    const design = defaultDesign();
    const a = getPlaneBuild(design);
    const b = getPlaneBuild({ ...design, name: 'Renamed', paper: { ...design.paper, front: '#123456' } });
    expect(a.airframe.mass).toBeGreaterThan(0.004);
    expect(a.airframe.mass).toBeLessThan(0.006);
    expect(b.airframe).toBe(a.airframe);
    expect(b.model).toBe(a.model);
    expect(getTrimAnalysis(a.airframe)).toBe(getTrimAnalysis(a.airframe));
  });

  it('trim changes the flight key but not the geometry key', () => {
    const design = defaultDesign();
    const bent = { ...design, trim: { ...design.trim, elevatorDeg: design.trim.elevatorDeg + 2 } };
    expect(geometryKey(bent)).toBe(geometryKey(design));
    expect(flightKey(bent)).not.toBe(flightKey(design));
    const a = getPlaneBuild(design);
    const b = getPlaneBuild(bent);
    expect(b.model).toBe(a.model);
    expect(b.airframe).not.toBe(a.airframe);
  });
});
