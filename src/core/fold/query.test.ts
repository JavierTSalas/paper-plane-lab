import { describe, expect, it } from 'vitest';
import { A4, busySteps, dartSteps, LETTER, lockSteps, valley } from './fixtures';
import {
  applyStep, bisectorOfLines, createSheet, foldFlat, foldPointToPoint, isSymmetric, mirrorLine, mirrorStep, piecePolygon,
  snapPoints, tableBounds,
} from './index';
import type { FlatState, FoldLine, FoldStep, Vec2 } from '../types';

const W = A4.width;
const H = A4.height;
const CENTRE: FoldStep = { kind: 'crease', line: { a: [W / 2, 0], b: [W / 2, H] } };

const fold = (steps: FoldStep[]): FlatState => {
  const { final, issues } = foldFlat(A4, steps);
  expect(issues).toEqual([]);
  return final;
};

const side = (line: FoldLine, p: Vec2): number =>
  (line.b[0] - line.a[0]) * (p[1] - line.a[1]) - (line.b[1] - line.a[1]) * (p[0] - line.a[0]);

const has = (points: readonly Vec2[], p: Vec2): boolean => points.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9);

describe('fold line helpers', () => {
  it('foldPointToPoint is the perpendicular bisector with `from` on the left', () => {
    const cases: Array<[Vec2, Vec2]> = [[[0, H], [W / 2, H - W / 2]], [[0.2, 0.01], [0.03, 0.25]], [[0, 0], [0, 0.1]], [[0.1, 0.1], [0, 0.1]]];
    for (const [from, to] of cases) {
      const line = foldPointToPoint(from, to);
      expect(side(line, from)).toBeGreaterThan(0);
      expect(side(line, to)).toBeLessThan(0);
      for (const p of [line.a, line.b]) {
        expect(Math.hypot(p[0] - from[0], p[1] - from[1])).toBeCloseTo(Math.hypot(p[0] - to[0], p[1] - to[1]), 14);
      }
      // Folding along it puts `from` onto `to`.
      const { state, issues } = applyStep(createSheet({ ...A4, width: 1, height: 1 }), valley(line), 0);
      expect(issues).toEqual([]);
      const moved = state.pieces.find((p) => p.flipped)!;
      const [a, b, c, d, tx, ty] = moved.iso;
      expect(a * from[0] + b * from[1] + tx).toBeCloseTo(to[0], 14);
      expect(c * from[0] + d * from[1] + ty).toBeCloseTo(to[1], 14);
    }
  });

  it('bisectorOfLines gives both angle bisectors through the crossing point', () => {
    const l1: FoldLine = { a: [0, 0], b: [1, 0] };
    const l2: FoldLine = { a: [0.5, -1], b: [0.5, 1] };
    const [first, second] = bisectorOfLines(l1, l2);
    expect(bisectorOfLines(l1, l2)).toHaveLength(2);
    for (const line of [first, second]) {
      expect(line.a[0]).toBeCloseTo(0.5, 14);
      expect(line.a[1]).toBeCloseTo(0, 14);
    }
    const dir = (l: FoldLine): Vec2 => {
      const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
      return [(l.b[0] - l.a[0]) / len, (l.b[1] - l.a[1]) / len];
    };
    expect(dir(first)[0]).toBeCloseTo(Math.SQRT1_2, 14);
    expect(dir(first)[1]).toBeCloseTo(Math.SQRT1_2, 14);
    expect(dir(second)[0]).toBeCloseTo(Math.SQRT1_2, 14);
    expect(dir(second)[1]).toBeCloseTo(-Math.SQRT1_2, 14);
  });

  it('the dart edge fold is the bisector of the slanted edge and the centre crease', () => {
    const slanted: FoldLine = { a: [W / 2, H], b: [0, H - W / 2] };
    const centre: FoldLine = { a: [W / 2, H], b: [W / 2, 0] };
    const [bisector] = bisectorOfLines(slanted, centre);
    const exit: Vec2 = [0, H - (W / 2) * (1 + Math.SQRT2)];
    expect(Math.abs(side(bisector, exit))).toBeLessThan(1e-15);
    expect(bisector.a[0]).toBeCloseTo(W / 2, 14);
    expect(bisector.a[1]).toBeCloseTo(H, 14);
  });

  it('bisectorOfLines gives the midline of parallel lines and nothing for degenerate input', () => {
    const l1: FoldLine = { a: [0, 0], b: [0, 1] };
    const mid = bisectorOfLines(l1, { a: [0.2, 1], b: [0.2, 0] });
    expect(mid).toHaveLength(1);
    expect(mid[0].a[0]).toBeCloseTo(0.1, 14);
    expect(mid[0].b[0]).toBeCloseTo(0.1, 14);
    expect(mid[0].b[1] - mid[0].a[1]).toBeCloseTo(1, 14);
    expect(bisectorOfLines(l1, { a: [0.3, 0.3], b: [0.3, 0.3] })).toEqual([]);
  });

  it('mirrorLine mirrors both points about the centreline', () => {
    expect(mirrorLine({ a: [0.01, 0.02], b: [0.2, 0.25] }, W / 2)).toEqual({ a: [W - 0.01, 0.02], b: [W - 0.2, 0.25] });
  });

  it('mirrorStep moves the mirror image of the same paper', () => {
    const step: FoldStep = { kind: 'fold', line: { a: [0, 0.1], b: [0.08, H] }, moving: 'left', dir: 'mountain', layers: 'flap', pick: [0.01, 0.2], label: 'x' };
    const mirrored = mirrorStep(step, W / 2);
    expect(mirrored).toEqual({ ...step, line: { a: [W, 0.1], b: [W - 0.08, H] }, moving: 'right', pick: [W - 0.01, 0.2] });
    const back = mirrorStep(mirrored, W / 2);
    if (back.kind !== 'fold') throw new Error('a mirrored fold is a fold');
    expect(back).toMatchObject({ moving: 'left', dir: 'mountain', layers: 'flap', label: 'x' });
    expect(back.line.b[0]).toBeCloseTo(0.08, 14);
    expect(back.pick?.[0]).toBeCloseTo(0.01, 14);
    expect(mirrorStep({ kind: 'flip' }, W / 2)).toEqual({ kind: 'flip' });
    expect(mirrorStep(CENTRE, W / 2)).toEqual({ kind: 'crease', line: { a: [W / 2, 0], b: [W / 2, H] } });

    // Folding a step and its mirror image, in either order, gives mirror-image halves.
    const once = fold([valley({ a: [0, 0.1], b: [0.08, H] })]);
    const other = fold([mirrorStep(valley({ a: [0, 0.1], b: [0.08, H] }), W / 2)]);
    const mirrorOutline = (state: FlatState): string[] =>
      state.pieces.flatMap((p) => piecePolygon(p).map((v) => `${(W - v[0]).toFixed(12)},${v[1].toFixed(12)}`)).sort();
    const outline = (state: FlatState): string[] =>
      state.pieces.flatMap((p) => piecePolygon(p).map((v) => `${v[0].toFixed(12)},${v[1].toFixed(12)}`)).sort();
    expect(outline(other)).toEqual(mirrorOutline(once));
  });
});

describe('tableBounds', () => {
  it('is the bounding box of the folded model', () => {
    expect(tableBounds(createSheet(A4))).toEqual({ min: [0, 0], max: [W, H] });
    const half = fold([valley({ a: [0, H / 2], b: [W, H / 2] })]);
    const { min, max } = tableBounds(half);
    expect(min).toEqual([0, 0]);
    expect(max[0]).toBeCloseTo(W, 14);
    expect(max[1]).toBeCloseTo(H / 2, 14);
    // Paper can leave the original rectangle.
    const out = tableBounds(fold([valley({ a: [0.05, 0], b: [0.05, H] })]));
    expect(out.min[0]).toBeCloseTo(0.05, 14);
    expect(out.max[0]).toBeCloseTo(W, 14);
    const hang = tableBounds(fold([valley({ a: [0.15, 0], b: [0.15, H] })]));
    expect(hang.min[0]).toBeCloseTo(0.15, 14);
    expect(hang.max[0]).toBeCloseTo(0.3, 14);
  });
});

describe('isSymmetric', () => {
  it('is true for a fresh sheet and for mirrored folds, on any paper', () => {
    expect(isSymmetric(createSheet(A4))).toBe(true);
    expect(isSymmetric(fold(dartSteps(A4)))).toBe(true);
    expect(isSymmetric(fold(lockSteps(A4)))).toBe(true);
    expect(isSymmetric(foldFlat(LETTER, lockSteps(LETTER)).final)).toBe(true);
    expect(isSymmetric(fold([valley({ a: [0, 0.2], b: [W, 0.2] })]))).toBe(true);
  });

  it('is false while one half is ahead of the other', () => {
    const steps = lockSteps(A4);
    expect(steps.map((_, i) => isSymmetric(fold(steps.slice(0, i + 1))))).toEqual([true, false, true, true, false, true, true]);
  });

  it('looks at the outline only, not at which layer lies on top', () => {
    // Left third over, then right third over it: lopsided stacking, symmetric outline.
    const thirds = fold([valley({ a: [W / 3, 0], b: [W / 3, H] }), valley({ a: [(2 * W) / 3, H], b: [(2 * W) / 3, 0] })]);
    expect(isSymmetric(thirds)).toBe(true);
  });

  it('notices a small lopsided flap and a shifted model', () => {
    const dart = dartSteps(A4);
    const nick = valley(foldPointToPoint([0, 0], [0.004, 0.004]));
    expect(isSymmetric(fold([...dart, nick]))).toBe(false);
    expect(isSymmetric(fold([...dart, nick, mirrorStep(nick, W / 2)]))).toBe(true);
    // A slightly slanted cross fold.
    expect(isSymmetric(fold([valley({ a: [0, 0.2], b: [W, 0.2002] })]))).toBe(false);
    expect(isSymmetric(fold([valley({ a: [0.05, 0], b: [0.05, H] })]))).toBe(false);
  });

  it('honours the tolerance', () => {
    const off = fold([valley({ a: [0, 0.2], b: [W, 0.2 + 2e-5] })]);
    expect(isSymmetric(off)).toBe(false);
    expect(isSymmetric(off, 1e-4)).toBe(true);
    expect(isSymmetric(fold(busySteps(A4)))).toBe(false);
  });
});

describe('snapPoints', () => {
  it('a fresh sheet has its corners and edge midpoints', () => {
    const points = snapPoints(createSheet(A4));
    expect(points).toHaveLength(8);
    for (const p of [[0, 0], [W, 0], [W, H], [0, H], [W / 2, 0], [W, H / 2], [W / 2, H], [0, H / 2]] as Vec2[]) {
      expect(has(points, p)).toBe(true);
    }
  });

  it('reference creases add their ends and crossings', () => {
    const creased = fold([CENTRE, { kind: 'crease', line: { a: [0, 0.1], b: [W, 0.1] } }, { kind: 'crease', line: { a: [0, 0], b: [W, 0.2] } }]);
    const points = snapPoints(creased);
    // Ends of the cross crease and of the diagonal, and the point where all three meet.
    for (const p of [[0, 0.1], [W, 0.1], [W, 0.2], [W / 2, 0.1]] as Vec2[]) expect(has(points, p)).toBe(true);
    expect(points).toHaveLength(8 + 4);
  });

  it('follows the folded model: flap corners appear, covered points disappear', () => {
    const corner = fold(dartSteps(A4).slice(0, 2));
    const points = snapPoints(corner);
    expect(has(points, [W / 2, H - W / 2])).toBe(true);
    expect(has(points, [0, H - W / 2])).toBe(true);
    expect(has(points, [W / 2, H])).toBe(true);
    expect(has(points, [0, H])).toBe(false);
    // The centre crease still ends at the bottom edge, and where the flap's edge now crosses it.
    expect(has(points, [W / 2, 0])).toBe(true);
  });

  it('leaves out points covered by a higher layer', () => {
    // A 30 mm strip folded over from the left, then the right 90 mm folded over on top of it.
    const strip = fold([valley({ a: [0.03, 0], b: [0.03, H] })]);
    const stripEdge: Vec2 = [0.06, H / 2];
    expect(has(snapPoints(strip), stripEdge)).toBe(true);
    const covered = applyStep(strip, valley({ a: [0.12, H], b: [0.12, 0] }), 1).state;
    const visible = snapPoints(covered);
    expect(has(visible, stripEdge)).toBe(false);
    // Its corners lie on the outline of the cover, so they can still be seen and snapped to.
    expect(has(visible, [0.06, 0])).toBe(true);
    expect(has(visible, [0.03, H / 2])).toBe(true);
    // A reference crease on the strip is hidden with it; the cover's own stretch of it is not.
    const marked = fold([{ kind: 'crease', line: { a: [0, 0.1], b: [W, 0.1] } }, valley({ a: [0.03, 0], b: [0.03, H] })]);
    expect(has(snapPoints(marked), [0.06, 0.1])).toBe(true);
    const markedCovered = snapPoints(applyStep(marked, valley({ a: [0.12, H], b: [0.12, 0] }), 2).state);
    expect(has(markedCovered, [0.06, 0.1])).toBe(false);
    expect(has(markedCovered, [0.03, 0.1])).toBe(true);
    expect(has(markedCovered, [0.12, 0.1])).toBe(true);
  });

  it('has no duplicates and stays inside the bounds', () => {
    for (const state of [fold(dartSteps(A4)), fold(lockSteps(A4)), foldFlat(A4, busySteps(A4)).final]) {
      const points = snapPoints(state);
      const { min, max } = tableBounds(state);
      expect(points.length).toBeGreaterThan(8);
      points.forEach((p, i) => {
        expect(p[0]).toBeGreaterThanOrEqual(min[0] - 1e-9);
        expect(p[0]).toBeLessThanOrEqual(max[0] + 1e-9);
        expect(p[1]).toBeGreaterThanOrEqual(min[1] - 1e-9);
        expect(p[1]).toBeLessThanOrEqual(max[1] + 1e-9);
        for (let j = 0; j < i; j++) expect(Math.hypot(p[0] - points[j][0], p[1] - points[j][1])).toBeGreaterThan(5e-7);
      });
    }
  });
});
