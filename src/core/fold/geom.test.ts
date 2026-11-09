import { describe, expect, it } from 'vitest';
import { createRng } from '../math';
import { addCrease } from './creases';
import {
  applyIso, centroid, collinearOverlap, composeIso, containsPoint, lineDistance, mirrorIso, overlaps, reflectionIso,
  signedArea, splitConvex, toLine,
} from './geom';
import type { Line } from './geom';
import type { Crease, Vec2 } from '../types';

const SQUARE: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

const lineThrough = (a: Vec2, b: Vec2): Line => {
  const line = toLine({ a, b });
  if (!line) throw new Error('degenerate test line');
  return line;
};

const cut = (poly: Vec2[], a: Vec2, b: Vec2): ReturnType<typeof splitConvex> => {
  const line = lineThrough(a, b);
  return splitConvex(poly, poly.map((v) => lineDistance(line, v)));
};

describe('lines and isometries', () => {
  it('toLine rejects missing, non-finite and coincident points', () => {
    expect(toLine(null)).toBeNull();
    expect(toLine({ a: [0, 0], b: [0, 0] })).toBeNull();
    expect(toLine({ a: [0, 0], b: [Number.NaN, 1] })).toBeNull();
    expect(toLine({ a: [0, 0], b: [0, 5e-10] })).toBeNull();
    expect(toLine({ a: [1, 1], b: [1, 3] })).toEqual({ p: [1, 1], u: [0, 1] });
  });

  it('distance is positive on the left of the direction', () => {
    const line = lineThrough([0, 0], [0, 2]);
    expect(lineDistance(line, [-0.3, 5])).toBeCloseTo(0.3, 15);
    expect(lineDistance(line, [0.4, -1])).toBeCloseTo(-0.4, 15);
  });

  it('a reflection fixes its line, swaps the sides and is its own inverse', () => {
    const line = lineThrough([0.2, 0.1], [0.9, 0.7]);
    const reflect = reflectionIso(line);
    expect(reflect[0] * reflect[3] - reflect[1] * reflect[2]).toBeCloseTo(-1, 14);
    for (const p of [[0.2, 0.1], [0.9, 0.7]] as Vec2[]) {
      const q = applyIso(reflect, p);
      expect(q[0]).toBeCloseTo(p[0], 14);
      expect(q[1]).toBeCloseTo(p[1], 14);
    }
    const p: Vec2 = [0.1, 0.8];
    expect(lineDistance(line, applyIso(reflect, p))).toBeCloseTo(-lineDistance(line, p), 14);
    const twice = composeIso(reflect, reflect);
    [1, 0, 0, 1, 0, 0].forEach((value, i) => expect(twice[i]).toBeCloseTo(value, 14));
    expect(applyIso(mirrorIso(0.5), [0.2, 0.3])).toEqual([0.8, 0.3]);
  });
});

describe('convex polygons', () => {
  it('area, centroid and containment work for either winding', () => {
    const clockwise = [...SQUARE].reverse();
    expect(signedArea(SQUARE)).toBeCloseTo(1, 15);
    expect(signedArea(clockwise)).toBeCloseTo(-1, 15);
    expect(centroid(clockwise)).toEqual([0.5, 0.5]);
    for (const poly of [SQUARE, clockwise]) {
      expect(containsPoint(poly, [0.5, 0.5], 0)).toBe(true);
      expect(containsPoint(poly, [1.001, 0.5], 0)).toBe(false);
      expect(containsPoint(poly, [1.001, 0.5], 0.01)).toBe(true);
      expect(containsPoint(poly, [0.999, 0.5], -0.01)).toBe(false);
    }
  });

  it('overlap needs real penetration: touching edges and corners do not count', () => {
    const shifted = (dx: number, dy: number): Vec2[] => SQUARE.map(([x, y]): Vec2 => [x + dx, y + dy]);
    expect(overlaps(SQUARE, shifted(0.5, 0.5))).toBe(true);
    expect(overlaps(SQUARE, shifted(1, 0))).toBe(false);
    expect(overlaps(SQUARE, shifted(1, 1))).toBe(false);
    expect(overlaps(SQUARE, shifted(1 - 1e-7, 0))).toBe(false);
    expect(overlaps(SQUARE, shifted(1 - 1e-5, 0))).toBe(true);
    expect(overlaps(SQUARE, [...shifted(0.9, 0.9)].reverse())).toBe(true);
  });

  it('collinearOverlap finds the shared stretch of two segments on one line', () => {
    expect(collinearOverlap([0, 0], [1, 0], [0.4, 0], [2, 0])).toEqual([[0.4, 0], [1, 0]]);
    expect(collinearOverlap([0, 0], [1, 0], [2, 0], [0.4, 0])).toEqual([[0.4, 0], [1, 0]]);
    expect(collinearOverlap([0, 0], [1, 0], [1, 0], [2, 0])).toBeNull();
    expect(collinearOverlap([0, 0], [1, 0], [0, 1e-6], [1, 1e-6])).toBeNull();
    expect(collinearOverlap([0, 0], [1, 0], [0.5, 0], [0.5, 1])).toBeNull();
  });
});

describe('splitConvex', () => {
  it('leaves a polygon the line misses whole, by reference', () => {
    const left = cut(SQUARE, [2, 0], [2, 1]);
    expect(left).toMatchObject({ neg: null, cut: null, sliver: false, touches: false });
    expect(left.pos).toBe(SQUARE);
    expect(cut(SQUARE, [2, 1], [2, 0]).neg).toBe(SQUARE);
  });

  it('cuts across two edges: both parts keep the winding and tile the polygon', () => {
    const { pos, neg, cut: ends, sliver, touches } = cut(SQUARE, [0.25, 0], [0.25, 1]);
    expect(sliver).toBe(false);
    expect(touches).toBe(true);
    expect(pos).toEqual([[0, 0], [0.25, 0], [0.25, 1], [0, 1]]);
    expect(neg).toEqual([[0.25, 0], [1, 0], [1, 1], [0.25, 1]]);
    expect(ends).toEqual([[0.25, 0], [0.25, 1]]);
  });

  it('cuts through vertices without adding any', () => {
    const diagonal = cut(SQUARE, [0, 0], [1, 1]);
    expect(diagonal.pos).toEqual([[0, 0], [1, 1], [0, 1]]);
    expect(diagonal.neg).toEqual([[0, 0], [1, 0], [1, 1]]);
    const oneVertex = cut(SQUARE, [0, 0], [1, 0.5]);
    expect(oneVertex.pos).toHaveLength(4);
    expect(oneVertex.neg).toHaveLength(3);
  });

  it('does not cut along an edge or at a corner, but says the line touches', () => {
    const along = cut(SQUARE, [0, 0], [0, 1]);
    expect(along).toMatchObject({ pos: null, cut: null, sliver: false, touches: true });
    expect(along.neg).toBe(SQUARE);
    const corner = cut(SQUARE, [-1, 1], [1, -1]);
    expect(corner).toMatchObject({ neg: null, cut: null, sliver: false, touches: true });
    expect(corner.pos).toBe(SQUARE);
  });

  it('welds a cut that passes a hair from a vertex onto that vertex', () => {
    const { pos, neg, sliver } = cut(SQUARE, [1e-8, 0], [1, 1]);
    expect(sliver).toBe(false);
    expect(pos).toEqual([[0, 0], [1, 1], [0, 1]]);
    expect(neg).toEqual([[0, 0], [1, 0], [1, 1]]);
  });

  it('refuses to cut off a sliver and keeps the polygon on its larger side', () => {
    const shave = cut(SQUARE, [0, 1 - 1e-6], [1e-6, 1]);
    expect(shave).toMatchObject({ pos: null, cut: null, sliver: true, touches: true });
    expect(shave.neg).toBe(SQUARE);
    const strip = cut(SQUARE, [5e-13, 0], [5e-13, 1]);
    expect(strip.sliver).toBe(false);
    expect(strip.neg).toBe(SQUARE);
  });

  it('conserves area for random cuts of random convex polygons', () => {
    const rng = createRng(20240607);
    for (let n = 0; n < 500; n++) {
      // Points on a circle, in order: a convex counter-clockwise polygon.
      const count = 3 + Math.floor(rng.next() * 6);
      const angles = Array.from({ length: count }, () => rng.range(0, 2 * Math.PI)).sort((a, b) => a - b);
      const poly = angles.map((t): Vec2 => [0.1 * Math.cos(t), 0.1 * Math.sin(t)]);
      if (signedArea(poly) < 1e-6) continue;
      const a: Vec2 = [rng.range(-0.1, 0.1), rng.range(-0.1, 0.1)];
      const b: Vec2 = rng.next() < 0.3 ? poly[Math.floor(rng.next() * count)] : [rng.range(-0.1, 0.1), rng.range(-0.1, 0.1)];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) continue;
      const { pos, neg } = cut(poly, a, b);
      const parts = [pos, neg].filter((part): part is Vec2[] => part !== null);
      expect(parts.reduce((sum, part) => sum + signedArea(part), 0)).toBeCloseTo(signedArea(poly), 14);
      for (const part of parts) {
        expect(part.length).toBeGreaterThanOrEqual(3);
        expect(signedArea(part)).toBeGreaterThan(0);
      }
    }
  });
});

describe('addCrease', () => {
  const crease = (x0: number, x1: number, assignment: Crease['assignment'], step: number, y = 0): Crease => ({
    a: [x0, y],
    b: [x1, y],
    assignment,
    step,
  });
  const spans = (list: Crease[]): Array<[number, number, string, number]> =>
    list
      .map((c): [number, number, string, number] => [Math.min(c.a[0], c.b[0]), Math.max(c.a[0], c.b[0]), c.assignment, c.step])
      .sort((p, q) => p[0] - q[0]);

  it('appends a crease that shares its line with no other, and ignores a dot', () => {
    const list = [crease(0, 1, 'valley', 0)];
    expect(addCrease(list, crease(0, 1, 'mountain', 1, 0.5), 'override')).toHaveLength(2);
    expect(addCrease(list, crease(0.2, 0.2 + 1e-9, 'mountain', 1), 'override')).toBe(list);
    expect(list).toHaveLength(1);
  });

  it('merges overlapping and touching creases of one assignment, dated by the earliest', () => {
    const merged = addCrease([crease(0, 0.4, 'valley', 3), crease(0.6, 1, 'valley', 5)], crease(0.4, 0.7, 'valley', 7), 'override');
    expect(spans(merged)).toEqual([[0, 1, 'valley', 3]]);
    const apart = addCrease([crease(0, 0.4, 'valley', 3)], crease(0.5, 0.7, 'valley', 7), 'override');
    expect(spans(apart)).toEqual([[0, 0.4, 'valley', 3], [0.5, 0.7, 'valley', 7]]);
  });

  it('override: a new fold replaces what it overlaps and leaves the rest', () => {
    const list = [crease(0, 1, 'aux', 0)];
    const out = spans(addCrease(list, crease(0.25, 0.5, 'valley', 4), 'override'));
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual([0, 0.25, 'aux', 0]);
    expect(out[1]).toEqual([0.25, 0.5, 'valley', 4]);
    expect(out[2]).toEqual([0.5, 1, 'aux', 0]);
    expect(spans(addCrease(list, crease(-1, 2, 'mountain', 4), 'override'))).toEqual([[-1, 2, 'mountain', 4]]);
  });

  it('yield: a reference crease gives way to folds already there', () => {
    const list = [crease(0.25, 0.5, 'valley', 1)];
    const out = spans(addCrease(list, crease(0, 1, 'aux', 6), 'yield'));
    expect(out).toEqual([[0, 0.25, 'aux', 6], [0.25, 0.5, 'valley', 1], [0.5, 1, 'aux', 6]]);
    expect(spans(addCrease(list, crease(0.3, 0.4, 'aux', 6), 'yield'))).toEqual([[0.25, 0.5, 'valley', 1]]);
  });
});
