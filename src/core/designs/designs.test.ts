import { describe, expect, it } from 'vitest';
import { buildPlane, isSymmetric } from '../fold';
import { makePaper, sheetMass } from '../paper';
import { defaultDesign, makeDesign, PRESETS } from './index';

describe('preset library', () => {
  it('has unique ids and a default design', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(defaultDesign().presetId).toBe('classic-dart');
  });

  for (const preset of PRESETS) {
    for (const sizeId of ['a4', 'letter', 'a5', 'legal']) {
      it(`${preset.id} folds cleanly on ${sizeId}`, () => {
        const paper = makePaper({ sizeId, orientation: preset.orientation });
        const design = makeDesign(preset, paper);
        const { fold, model, issues } = buildPlane(design);
        expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
        expect(isSymmetric(fold.final)).toBe(true);
        expect(design.steps.every((s) => typeof s.label === 'string' && s.label.length > 0)).toBe(true);
        const area = fold.final.pieces.reduce((sum, p) => sum + polygonArea(p.sheet), 0);
        expect(area).toBeCloseTo(paper.width * paper.height, 10);
        expect(sheetMass(paper)).toBeGreaterThan(0);
        expect(model.length).toBeGreaterThan(0.25 * paper.height);
        expect(model.span).toBeGreaterThan(0.02);
        expect(model.pieces.every((p) => p.verts.every((v) => v.every(Number.isFinite)))).toBe(true);
      });
    }
  }
});

describe('classic dart geometry (doc 05 section 1.4, A4)', () => {
  it('matches the derived span and root-axis length, and sits level on its wings', () => {
    const base = defaultDesign();
    const { model } = buildPlane({ ...base, shape: { ...base.shape, dihedralDeg: 0, keelSpreadDeg: 0 } });
    expect(model.span * 1000).toBeCloseTo(107.1, 0);
    expect(model.length * 1000).toBeCloseTo(311.8, 0);
    for (const panel of model.panels.filter((p) => p.role === 'wing')) {
      expect(panel.normal[0]).toBeCloseTo(0, 9);
      expect(panel.normal[1]).toBeCloseTo(1, 9);
    }
    const ys = model.pieces.flatMap((p) => p.verts.map((v) => v[1]));
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
  });
});

function polygonArea(poly: ReadonlyArray<readonly [number, number]>): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}
