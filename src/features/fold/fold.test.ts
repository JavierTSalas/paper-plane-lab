import { describe, expect, it } from 'vitest';
import { createSheet, foldFlat, isSymmetric } from '../../core/fold';
import { getPreset, makeDesign, presetPaper } from '../../core/designs';
import { makePaper } from '../../core/paper';
import type { FoldLine, PlaneDesign } from '../../core/types';
import { nextDesignName, parseDraft, reduceDraft, serializeDraft, type Draft } from './draft';
import {
  maxLayers,
  nearest,
  pointToPointStep,
  progressAlong,
  sameLine,
  snapAngle,
  stepHandle,
  trySteps,
  wingLineFrom,
  wingOffsets,
  withMirrorStep,
} from './geometry';

const dart = getPreset('classic-dart')!;
const design: PlaneDesign = makeDesign(dart, presetPaper(dart));

describe('stepHandle', () => {
  it('drags the top-left corner onto the centre crease for the first corner fold', () => {
    const fold = foldFlat(design.paper, design.steps);
    const h = stepHandle(fold.frames[1]!)!;
    const { width: W, height: H } = design.paper;
    expect(h.from[0]).toBeCloseTo(0, 6);
    expect(h.from[1]).toBeCloseTo(H, 6);
    expect(h.to[0]).toBeCloseTo(W / 2, 6);
  });

  it('gives every fold and crease of the dart a handle that moves', () => {
    const fold = foldFlat(design.paper, design.steps);
    for (const f of fold.frames) {
      const h = stepHandle(f);
      expect(h).not.toBeNull();
      expect(Math.hypot(h!.to[0] - h!.from[0], h!.to[1] - h!.from[1])).toBeGreaterThan(0.01);
    }
  });
});

describe('snapping', () => {
  it('finds the nearest point within the radius', () => {
    expect(nearest([[0, 0], [1, 1]], [0.9, 0.95], 0.2)).toEqual([1, 1]);
    expect(nearest([[0, 0]], [0.5, 0.5], 0.2)).toBeNull();
  });
  it('snaps angles to 15 degree multiples', () => {
    const r = snapAngle([0, 0], [1, 0.03]);
    expect(r.snapped).toBe(true);
    expect(r.p[1]).toBeCloseTo(0, 9);
    expect(snapAngle([0, 0], [1, 0.15]).snapped).toBe(false);
  });
  it('measures drag progress', () => {
    expect(progressAlong([0, 0], [10, 0], [5, 3])).toBeCloseTo(0.5);
  });
});

describe('mirrored folds', () => {
  const paper = makePaper({ sizeId: 'a4' });
  const cx = paper.width / 2;
  const opts = { dir: 'valley' as const, layers: 'all' as const, creaseOnly: false };

  it('adds the mirror image of a corner fold and stays symmetric', () => {
    const step = pointToPointStep([0, paper.height], [cx, paper.height - cx], opts);
    const steps = withMirrorStep(step, true, cx);
    expect(steps).toHaveLength(2);
    const t = trySteps(createSheet(paper), steps, 0);
    expect(t.ok).toBe(true);
    expect(isSymmetric(t.state)).toBe(true);
  });

  it('applies a fold that is its own mirror once', () => {
    const step = pointToPointStep([cx, paper.height], [cx, 0], opts);
    expect(withMirrorStep(step, true, cx)).toHaveLength(1);
    const half = pointToPointStep([0, 0.1], [paper.width, 0.1], opts);
    expect(withMirrorStep(half, true, cx)).toHaveLength(1);
  });

  it('reports a fold that misses the paper', () => {
    const step = pointToPointStep([1, 1], [1.2, 1], opts);
    expect(trySteps(createSheet(paper), [step], 0).ok).toBe(false);
  });

  it('compares infinite lines', () => {
    const l: FoldLine = { a: [0, 0], b: [1, 1] };
    expect(sameLine(l, { a: [2, 2], b: [-1, -1] })).toBe(true);
    expect(sameLine(l, { a: [0, 1], b: [1, 2] })).toBe(false);
  });
});

describe('layers and wing lines', () => {
  it('counts layers', () => {
    const paper = makePaper({ sizeId: 'a4' });
    expect(maxLayers(createSheet(paper))).toBe(1);
    const final = foldFlat(design.paper, design.steps).final;
    expect(maxLayers(final)).toBeGreaterThanOrEqual(3);
  });
  it('round-trips wing line offsets', () => {
    const final = foldFlat(design.paper, design.steps).final;
    const o = wingOffsets(final, design.shape.wingLine!);
    expect(o.nose).toBeCloseTo(0, 6);
    const back = wingOffsets(final, wingLineFrom(final, o));
    expect(back.tail).toBeCloseTo(o.tail, 9);
  });
});

describe('draft reducer', () => {
  const start = reduceDraft(null, { type: 'start', design, mode: 'guided', stage: 'fold' })!;
  const edited = (d: Draft, name: string, key?: string): Draft => reduceDraft(d, { type: 'edit', design: { ...d.design, name }, key })!;

  it('undoes and redoes edits', () => {
    const a = edited(start, 'A');
    const b = edited(a, 'B');
    const u = reduceDraft(b, { type: 'undo' })!;
    expect(u.design.name).toBe('A');
    expect(reduceDraft(u, { type: 'redo' })!.design.name).toBe('B');
    expect(edited(u, 'C').future).toHaveLength(0);
  });

  it('coalesces edits with the same key into one undo step', () => {
    const a = edited(edited(edited(start, 'A', 'k'), 'B', 'k'), 'C', 'k');
    expect(a.past).toHaveLength(1);
    expect(reduceDraft(a, { type: 'undo' })!.design.name).toBe(design.name);
  });

  it('survives a round trip through storage', () => {
    const a = edited(start, 'A');
    const back = parseDraft(serializeDraft(a))!;
    expect(back.design).toEqual(a.design);
    expect(back.past).toHaveLength(1);
    expect(parseDraft('{"nope":1}')).toBeNull();
    expect(parseDraft('not json')).toBeNull();
  });

  it('names designs', () => {
    expect(nextDesignName(['My design 1', 'Dart'])).toBe('My design 2');
  });
});
