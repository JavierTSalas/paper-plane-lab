import { describe, expect, it } from 'vitest';
import { A4, both, busySteps, dartSteps, LETTER, lockSteps, mountain, paperOf, valley } from './fixtures';
import { applyStep, createSheet, foldFlat, foldPointToPoint, isSymmetric, MAX_PIECES, piecePolygon, tableBounds } from './index';
import { expectValidState, polygonArea } from './invariants';
import type { FlatPiece, FlatState, FoldStep, PaperSpec, Vec2 } from '../types';

const W = A4.width;
const H = A4.height;
const CENTRE: FoldStep = { kind: 'crease', line: { a: [W / 2, 0], b: [W / 2, H] } };

function insideSheet(piece: FlatPiece, p: Vec2): boolean {
  const { sheet } = piece;
  return sheet.every((a, i) => {
    const b = sheet[(i + 1) % sheet.length];
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9;
  });
}

/** Where a point of the sheet lies on the table. */
function whereIs(state: FlatState, sheetPoint: Vec2): Vec2 {
  const piece = state.pieces.find((p) => insideSheet(p, sheetPoint));
  if (!piece) throw new Error('point is not on the sheet');
  const [a, b, c, d, tx, ty] = piece.iso;
  return [a * sheetPoint[0] + b * sheetPoint[1] + tx, c * sheetPoint[0] + d * sheetPoint[1] + ty];
}

function expectPoint(actual: Vec2, expected: Vec2, digits = 12): void {
  expect(actual[0]).toBeCloseTo(expected[0], digits);
  expect(actual[1]).toBeCloseTo(expected[1], digits);
}

/** Leftmost and rightmost covered x on the horizontal table line at height y. */
function reachAt(state: FlatState, y: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const poly of state.pieces.map(piecePolygon)) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const y0 = poly[j][1] - y;
      const y1 = poly[i][1] - y;
      if (y0 < 0 === y1 < 0) continue;
      const x = poly[j][0] + ((poly[i][0] - poly[j][0]) * y0) / (y0 - y1);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
  }
  return [lo, hi];
}

/** Mirror image of p in the line through a and b. */
function mirrorIn(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const t = ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / (ux * ux + uy * uy);
  return [2 * (a[0] + ux * t) - p[0], 2 * (a[1] + uy * t) - p[1]];
}

const byLayer = (state: FlatState): FlatPiece[] => [...state.pieces].sort((p, q) => p.layer - q.layer);

function foldAll(paper: PaperSpec, steps: FoldStep[]): FlatState {
  const result = foldFlat(paper, steps);
  expect(result.issues).toEqual([]);
  return result.final;
}

describe('invariants after every step', () => {
  const sequences: Array<[string, PaperSpec, FoldStep[]]> = [
    ['classic dart, A4', A4, dartSteps(A4)],
    ['classic dart, Letter', LETTER, dartSteps(LETTER)],
    ['lock opening, A4', A4, lockSteps(A4)],
    ['lock opening, Letter', LETTER, lockSteps(LETTER)],
    ['twelve busy folds, A4', A4, busySteps(A4)],
    ['square sheet', paperOf(0.15, 0.15), busySteps(paperOf(0.15, 0.15))],
    ['landscape sheet', paperOf(0.297, 0.21), dartSteps(paperOf(0.297, 0.21))],
  ];

  it.each(sequences)('%s', (name, paper, steps) => {
    let state = createSheet(paper);
    expectValidState(state, `${name}, fresh sheet`, { tiling: true, continuity: true });
    steps.forEach((step, index) => {
      const outcome = applyStep(state, step, index);
      expect(outcome.issues.filter((issue) => issue.severity === 'error'), `${name}, step ${index}`).toEqual([]);
      state = outcome.state;
      expectValidState(state, `${name}, after step ${index}`, { tiling: true, continuity: true });
      if (step.kind !== 'flip') {
        const split = outcome.frame.split.map((p, layer) => ({ ...p, layer }));
        expectValidState({ ...state, pieces: split }, `${name}, split of step ${index}`, { tiling: true });
      }
    });
  });

  it('starts as one counter-clockwise rectangle, front face up', () => {
    const { pieces, creases } = createSheet(A4);
    expect(creases).toEqual([]);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ id: 0, flipped: false, layer: 0, iso: [1, 0, 0, 1, 0, 0] });
    expect(pieces[0].sheet).toEqual([[0, 0], [W, 0], [W, H], [0, H]]);
  });

  it('does not change the state it was given', () => {
    const before = createSheet(A4);
    const snapshot = JSON.stringify(before);
    foldFlat(A4, busySteps(A4));
    applyStep(before, valley({ a: [0, 0.1], b: [W, 0.2] }), 0);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('classic dart on A4', () => {
  const steps = dartSteps(A4);
  const corner: Vec2 = [0, H];
  const edgeExit = H - (W / 2) * (1 + Math.SQRT2);

  it('puts the corner on the centre crease', () => {
    const afterCorner = foldAll(A4, steps.slice(0, 2));
    expectPoint(whereIs(afterCorner, corner), [W / 2, H - W / 2]);
    expectPoint(whereIs(afterCorner, [0, H - W / 2]), [0, H - W / 2]);
    expectPoint(whereIs(afterCorner, [W / 2, H]), [W / 2, H]);
  });

  it('lays the slanted edge along the centre crease and leaves the corner tucked under it', () => {
    const afterEdge = foldAll(A4, steps.slice(0, 4));
    // The slanted edge ran from the nose to [0, H - W/2], a length of W/sqrt(2). It now runs straight down from the nose.
    expectPoint(whereIs(afterEdge, [0, H - W / 2]), [W / 2, H - W * Math.SQRT1_2]);
    // A point of the flap's lower edge, left of the fold line, swings over with it.
    expectPoint(whereIs(afterEdge, [0, H - W / 4]), mirrorIn([W / 4, H - W / 2], [0, edgeExit], [W / 2, H]));
    // The top edge of the sheet already lay on the centre crease, which is right of the fold line.
    expectPoint(whereIs(afterEdge, [W / 4, H]), [W / 2, H - W / 4]);
    // The corner itself lies on the centre crease, right of the fold line, so it stays put. Its mirror
    // image in the fold line, [W/2 (1 - 1/sqrt 2), H - W/2 / sqrt 2], is on the side the fold emptied.
    expectPoint(whereIs(afterEdge, corner), [W / 2, H - W / 2]);
    const emptied: Vec2 = [(W / 2) * (1 - Math.SQRT1_2), H - (W / 2) * Math.SQRT1_2];
    expect(reachAt(afterEdge, emptied[1])[0]).toBeGreaterThan(emptied[0] + 0.01);
    // The fold line leaves the paper on the left edge.
    expectPoint(whereIs(afterEdge, [0, edgeExit]), [0, edgeExit]);
    expectPoint(whereIs(afterEdge, [0, edgeExit + 0.01]), [0.01 * Math.SQRT1_2, edgeExit + 0.01 * Math.SQRT1_2]);
  });

  it('mirrors the right half the same way', () => {
    const final = foldAll(A4, steps);
    expectPoint(whereIs(final, [W, H]), [W / 2, H - W / 2]);
    expectPoint(whereIs(final, [W, H - W / 2]), [W / 2, H - W * Math.SQRT1_2]);
    expectPoint(whereIs(final, [W, edgeExit + 0.01]), [W - 0.01 * Math.SQRT1_2, edgeExit + 0.01 * Math.SQRT1_2]);
  });

  it('ends symmetric, inside the sheet, with the nose at the top centre', () => {
    const final = foldAll(A4, steps);
    expect(isSymmetric(final)).toBe(true);
    const { min, max } = tableBounds(final);
    expectPoint(min, [0, 0]);
    expectPoint(max, [W, H]);
    const [noseLeft, noseRight] = reachAt(final, H - 1e-6);
    expect(noseLeft).toBeCloseTo(W / 2, 5);
    expect(noseRight).toBeCloseTo(W / 2, 5);
  });

  it('keeps the original left edge below the last fold and leaves it above', () => {
    const final = foldAll(A4, steps);
    for (const y of [0.001, edgeExit / 2, edgeExit - 0.001]) {
      const [lo, hi] = reachAt(final, y);
      expect(lo).toBeCloseTo(0, 12);
      expect(hi).toBeCloseTo(W, 12);
    }
    // Above it the outline follows the fold line, 22.5 degrees from the vertical.
    for (const y of [edgeExit + 0.01, 0.15, 0.25]) {
      const [lo, hi] = reachAt(final, y);
      expect(lo).toBeCloseTo((y - edgeExit) * Math.tan(Math.PI / 8), 12);
      expect(hi).toBeCloseTo(W - lo, 12);
    }
  });

  it('is not symmetric halfway through a mirrored pair', () => {
    expect(isSymmetric(foldAll(A4, steps.slice(0, 2)))).toBe(false);
    expect(isSymmetric(foldAll(A4, steps.slice(0, 3)))).toBe(true);
    expect(isSymmetric(foldAll(A4, steps.slice(0, 4)))).toBe(false);
  });

  it('records the centre crease as a reference line and every fold as a valley on the front', () => {
    const final = foldAll(A4, steps);
    const aux = final.creases.filter((c) => c.assignment === 'aux');
    expect(aux.length).toBeGreaterThan(0);
    for (const c of aux) {
      expect(c.a[0]).toBeCloseTo(W / 2, 12);
      expect(c.b[0]).toBeCloseTo(W / 2, 12);
    }
    // Corner folds are valleys seen from the front. The edge folds also crease the corner flaps,
    // which lie back side up: seen from the front of the sheet those stretches are mountains.
    const count = (assignment: string): number => final.creases.filter((c) => c.assignment === assignment).length;
    expect(count('valley')).toBe(4);
    expect(count('mountain')).toBe(2);
  });

  it('folds the same on Letter paper', () => {
    const final = foldAll(LETTER, dartSteps(LETTER));
    expect(isSymmetric(final)).toBe(true);
    expectPoint(tableBounds(final).max, [LETTER.width, LETTER.height]);
  });
});

describe('flap folds', () => {
  const gap = 0.02;
  const steps = lockSteps(A4, gap);
  const tipFold = H - W / 2 - gap - W / 2;

  it('folds only the exposed nose tip up and leaves the sheet below the line alone', () => {
    const before = foldAll(A4, steps.slice(0, -1));
    const outcome = applyStep(before, steps[steps.length - 1], steps.length - 1);
    expect(outcome.issues).toEqual([]);
    const { frame, state: after } = outcome;

    // The tip is two layers of paper (the nose and the corner flaps folded under it), each of area gap².
    const movers = frame.split.filter((p) => frame.movingIds.includes(p.id));
    expect(movers.reduce((sum, p) => sum + polygonArea(p.sheet), 0)).toBeCloseTo(2 * gap * gap, 12);
    for (const piece of movers) {
      for (const [x, y] of piecePolygon(piece)) {
        expect(y).toBeLessThanOrEqual(tipFold + 1e-9);
        expect(y).toBeGreaterThanOrEqual(tipFold - gap - 1e-9);
        expect(Math.abs(x - W / 2)).toBeLessThanOrEqual(gap + 1e-9);
      }
    }

    // Everything else is where it was: same pieces, same places.
    const stayers = frame.split.filter((p) => !frame.movingIds.includes(p.id));
    for (const piece of stayers) {
      const same = after.pieces.find((p) => p.id === piece.id);
      expect(same?.iso).toEqual(piece.iso);
      expect(same?.flipped).toBe(piece.flipped);
    }
    expectPoint(tableBounds(after).min, [0, 0]);
    expectPoint(whereIs(after, [0, 0]), [0, 0]);
    expectPoint(whereIs(after, [W, 0]), [W, 0]);

    // The tip lands on top of the corner flaps, pointing up.
    const top = byLayer(after).slice(-movers.length);
    expect(top.map((p) => p.id).sort()).toEqual(movers.map((p) => p.id).sort());
    const tipTop = Math.max(...top.flatMap((p) => piecePolygon(p).map((v) => v[1])));
    expect(tipTop).toBeCloseTo(tipFold + gap, 12);
    expect(isSymmetric(after)).toBe(true);
  });

  it('moves the whole sheet below the line when all layers are asked for', () => {
    const before = foldAll(A4, steps.slice(0, -1));
    const tip = steps[steps.length - 1];
    if (tip.kind !== 'fold') throw new Error('fixture changed');
    const { frame, issues } = applyStep(before, { ...tip, layers: 'all' }, 0);
    expect(issues).toEqual([]);
    const moved = frame.split.filter((p) => frame.movingIds.includes(p.id));
    expect(moved.reduce((sum, p) => sum + polygonArea(p.sheet), 0)).toBeCloseTo(W * tipFold + 2 * gap * gap, 12);
  });

  it('takes the top layer under the pick point, and the flap it belongs to', () => {
    // Fold the sheet in half, top edge down. Then lift only the top layer's lower-left corner.
    const half = foldAll(A4, [valley({ a: [0, H / 2], b: [W, H / 2] })]);
    const lift: FoldStep = {
      kind: 'fold',
      line: foldPointToPoint([0, 0], [0.04, 0.04]),
      moving: 'left',
      dir: 'valley',
      layers: 'flap',
    };
    const { state, frame, issues } = applyStep(half, lift, 1);
    expect(issues).toEqual([]);
    expect(frame.movingIds).toHaveLength(1);
    expect(state.pieces).toHaveLength(3);
    // The moved corner is the top-left corner of the sheet, which the first fold brought down.
    expectPoint(whereIs(state, [0, H]), [0.04, 0.04]);
    expectPoint(whereIs(state, [0, 0]), [0, 0]);
    expectValidState(state, 'lifted corner', { tiling: true, continuity: true });
  });

  it('takes the bottom layer for a mountain flap fold', () => {
    const half = foldAll(A4, [valley({ a: [0, H / 2], b: [W, H / 2] })]);
    const tuck: FoldStep = {
      kind: 'fold',
      line: foldPointToPoint([0, 0], [0.04, 0.04]),
      moving: 'left',
      dir: 'mountain',
      layers: 'flap',
    };
    const { state, issues } = applyStep(half, tuck, 1);
    expect(issues).toEqual([]);
    expectPoint(whereIs(state, [0, 0]), [0.04, 0.04]);
    expectPoint(whereIs(state, [0, H]), [0, 0]);
    expect(byLayer(state)[0].sheet).toHaveLength(3);
  });

  describe('two corner flaps and a line across one of them', () => {
    // Both top corners folded to the centre. The line runs parallel to the right flap's hinge and
    // cuts off that flap's tip; its moving side also holds most of the sheet and of the left flap.
    const corners = foldAll(A4, [CENTRE, ...both(valley(foldPointToPoint([0, H], [W / 2, H - W / 2])), A4)]);
    const tipBack: FoldStep = {
      kind: 'fold',
      line: foldPointToPoint([W / 2, H - W / 2], [(3 * W) / 4, H - W / 4]),
      moving: 'left',
      dir: 'valley',
      layers: 'flap',
    };

    it('the default pick sits next to the middle of the line: only the flap tip moves', () => {
      const { state, frame, issues } = applyStep(corners, tipBack, 3);
      expect(issues).toEqual([]);
      expect(frame.movingIds).toHaveLength(1);
      expectPoint(whereIs(state, [W, H]), [(3 * W) / 4, H - W / 4]);
      expectPoint(whereIs(state, [0, H]), [W / 2, H - W / 2]);
      expectPoint(whereIs(state, [0, 0]), [0, 0]);
      expectValidState(state, 'flap tip folded back', { tiling: true, continuity: true });
    });

    it('an explicit pick on the flap tip does the same', () => {
      const picked = applyStep(corners, { ...tipBack, pick: [W / 2 + 0.005, H - W / 2 + 0.01] }, 3);
      expect(picked.state).toEqual(applyStep(corners, tipBack, 3).state);
    });

    it('a pick on the sheet takes the sheet, and the flap tip lying on it comes along with a warning', () => {
      const { state, frame, issues } = applyStep(corners, { ...tipBack, pick: [W / 4, 0.05] }, 3);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ step: 3, severity: 'warning', code: 'flap-blocked' });
      // Sheet, left flap and right flap tip: the same pieces an all-layers fold moves.
      const all = applyStep(corners, { ...tipBack, layers: 'all' }, 3);
      expect(all.issues).toEqual([]);
      expect(frame.movingIds).toHaveLength(3);
      expect(state).toEqual(all.state);
      expectValidState(state, 'blocked flap', { tiling: true, continuity: true });
    });
  });

  it('refuses a flap fold that would have to take the whole model along', () => {
    // Right third folded over, then the left third on top of it. Lifting the left third and the
    // middle about the first crease is blocked by the right third tucked between them.
    const thirds = foldAll(A4, [valley({ a: [(2 * W) / 3, H], b: [(2 * W) / 3, 0] }), valley({ a: [W / 3, 0], b: [W / 3, H] })]);
    expect(thirds.pieces).toHaveLength(3);
    const lift: FoldStep = {
      kind: 'fold',
      line: { a: [(2 * W) / 3, H], b: [(2 * W) / 3, 0] },
      moving: 'right',
      dir: 'valley',
      layers: 'flap',
      pick: [W / 2, H / 2],
    };
    const { state, issues } = applyStep(thirds, lift, 2);
    expect(issues.map((i) => i.code)).toEqual(['nothing-moves']);
    expect(state).toBe(thirds);
  });

  it('opens the top flap again when asked to fold it back', () => {
    const thirds = foldAll(A4, [valley({ a: [(2 * W) / 3, H], b: [(2 * W) / 3, 0] }), valley({ a: [W / 3, 0], b: [W / 3, H] })]);
    // The left third lies on top, between x = W/3 and 2W/3. Fold it back out about its own crease.
    const open: FoldStep = { kind: 'fold', line: { a: [W / 3, H], b: [W / 3, 0] }, moving: 'left', dir: 'valley', layers: 'flap' };
    const { state, frame, issues } = applyStep(thirds, open, 2);
    expect(issues).toEqual([]);
    expect(frame.movingIds).toHaveLength(1);
    expectPoint(whereIs(state, [0, 0]), [0, 0]);
    expectPoint(whereIs(state, [W, 0]), [W / 3, 0]);
    // The reopened fold is flat again: its crease is now a reference line.
    const reopened = state.creases.filter((c) => Math.abs(c.a[0] - W / 3) < 1e-9 && Math.abs(c.b[0] - W / 3) < 1e-9);
    expect(reopened.map((c) => c.assignment)).toEqual(['aux']);
    expectValidState(state, 'reopened third', { tiling: true, continuity: true });
  });
});

describe('stacking order', () => {
  const inHalf = (dir: 'valley' | 'mountain'): FoldStep => ({
    kind: 'fold',
    line: { a: [0, H / 2], b: [W, H / 2] },
    moving: 'left',
    dir,
    layers: 'all',
  });
  const across = (dir: 'valley' | 'mountain'): FoldStep => ({
    kind: 'fold',
    line: { a: [W / 2, 0], b: [W / 2, H] },
    moving: 'left',
    dir,
    layers: 'all',
  });
  /** Which quarter of the sheet a piece is: t/b for top/bottom half, l/r for left/right. */
  const quarter = (piece: FlatPiece): string => {
    const cx = piece.sheet.reduce((sum, v) => sum + v[0], 0) / piece.sheet.length;
    const cy = piece.sheet.reduce((sum, v) => sum + v[1], 0) / piece.sheet.length;
    return (cy > H / 2 ? 't' : 'b') + (cx > W / 2 ? 'r' : 'l');
  };

  it('valley: the moving half lands on top, flipped', () => {
    const state = foldAll(A4, [inHalf('valley')]);
    const [bottom, top] = byLayer(state);
    expect(quarter(bottom)[0]).toBe('b');
    expect(quarter(top)[0]).toBe('t');
    expect(bottom.flipped).toBe(false);
    expect(top.flipped).toBe(true);
    expectPoint(whereIs(state, [0, H]), [0, 0]);
  });

  it('mountain: the moving half lands underneath, flipped', () => {
    const state = foldAll(A4, [inHalf('mountain')]);
    const [bottom, top] = byLayer(state);
    expect(quarter(bottom)[0]).toBe('t');
    expect(quarter(top)[0]).toBe('b');
    expect(bottom.flipped).toBe(true);
    expect(top.flipped).toBe(false);
    expectPoint(whereIs(state, [0, H]), [0, 0]);
  });

  it('valley after valley: the moving stack is reversed on top', () => {
    // After the first fold: bottom half below, top half above. The left halves of both then move.
    const state = foldAll(A4, [inHalf('valley'), across('valley')]);
    expect(byLayer(state).map(quarter)).toEqual(['br', 'tr', 'tl', 'bl']);
    expect(byLayer(state).map((p) => p.flipped)).toEqual([false, true, false, true]);
  });

  it('mountain after valley: the moving stack is reversed underneath', () => {
    const state = foldAll(A4, [inHalf('valley'), across('mountain')]);
    expect(byLayer(state).map(quarter)).toEqual(['tl', 'bl', 'br', 'tr']);
  });

  it('records valley and mountain creases as seen from the front of the sheet', () => {
    const valleys = foldAll(A4, [inHalf('valley'), across('valley')]).creases;
    // The second fold creases the bottom half as a valley and the flipped top half as a mountain.
    const vertical = valleys.filter((c) => Math.abs(c.a[0] - c.b[0]) < 1e-9);
    expect(vertical).toHaveLength(2);
    for (const c of vertical) {
      expect(c.assignment).toBe((c.a[1] + c.b[1]) / 2 < H / 2 ? 'valley' : 'mountain');
    }
    const mountains = foldAll(A4, [inHalf('mountain')]).creases;
    expect(mountains).toHaveLength(1);
    expect(mountains[0].assignment).toBe('mountain');
  });

  it('merges collinear creases of one assignment into one segment', () => {
    // A crease made again along part of itself, after another crease has crossed it, is still one crease.
    const line = { a: [0, H / 2] as Vec2, b: [W, H / 2] as Vec2 };
    const state = foldAll(A4, [{ kind: 'crease', line }, CENTRE, { kind: 'crease', line: { a: [0, H / 2], b: [W / 2, H / 2] } }]);
    const horizontal = state.creases.filter((c) => Math.abs(c.a[1] - c.b[1]) < 1e-9);
    expect(horizontal).toHaveLength(1);
    expect(Math.abs(horizontal[0].a[0] - horizontal[0].b[0])).toBeCloseTo(W, 12);
    expect(horizontal[0].step).toBe(0);
  });
});

describe('flip and crease steps', () => {
  it('flip mirrors about the centreline, turns every piece over and reverses the stack', () => {
    const before = foldAll(A4, dartSteps(A4).slice(0, 2));
    const { state: after, frame, issues } = applyStep(before, { kind: 'flip' }, 2);
    expect(issues).toEqual([]);
    expect(frame.split).toEqual([]);
    expect(frame.axis).toBeNull();
    const n = before.pieces.length;
    for (const piece of before.pieces) {
      const turned = after.pieces.find((p) => p.id === piece.id);
      expect(turned?.flipped).toBe(!piece.flipped);
      expect(turned?.layer).toBe(n - 1 - piece.layer);
      const was = piecePolygon(piece);
      const is = piecePolygon(turned!);
      was.forEach((v, i) => expectPoint(is[i], [W - v[0], v[1]]));
    }
    expectValidState(after, 'flipped', { tiling: true, continuity: true });
    expect(after.creases).toEqual(before.creases);
  });

  it('flipping twice is the identity', () => {
    const before = foldAll(A4, lockSteps(A4));
    const once = applyStep(before, { kind: 'flip' }, 0).state;
    const twice = applyStep(once, { kind: 'flip' }, 1).state;
    expect(twice.pieces).toHaveLength(before.pieces.length);
    for (const piece of before.pieces) {
      const back = twice.pieces.find((p) => p.id === piece.id);
      expect(back?.flipped).toBe(piece.flipped);
      expect(back?.layer).toBe(piece.layer);
      expect(back?.sheet).toEqual(piece.sheet);
      piece.iso.forEach((value, i) => expect(back?.iso[i]).toBeCloseTo(value, 14));
    }
  });

  it('a crease step leaves the geometry alone and adds reference creases', () => {
    const before = foldAll(A4, dartSteps(A4).slice(0, 3));
    const line = { a: [0, 0.1] as Vec2, b: [W, 0.26] as Vec2 };
    const { state: after, frame, issues } = applyStep(before, { kind: 'crease', line }, 3);
    expect(issues).toEqual([]);
    expect(after.pieces).toEqual(before.pieces);
    expect(frame.after).toBe(after);
    expect(frame.before).toBe(before);
    const added = after.creases.filter((c) => c.step === 3);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((c) => c.assignment === 'aux')).toBe(true);
    expect(after.creases.filter((c) => c.step !== 3)).toEqual(before.creases);
  });

  it('a crease frame describes the valley fold of everything left of the line', () => {
    const before = foldAll(A4, dartSteps(A4).slice(0, 3));
    const line = { a: [0, 0.1] as Vec2, b: [W, 0.26] as Vec2 };
    const crease = applyStep(before, { kind: 'crease', line }, 3).frame;
    const fold = applyStep(before, valley(line), 3).frame;
    expect(crease.sense).toBe(1);
    expect(crease.axis).toEqual(fold.axis);
    expect(crease.split).toEqual(fold.split);
    expect([...crease.movingIds].sort()).toEqual([...fold.movingIds].sort());
    expect(crease.movingIds.length).toBeGreaterThan(0);
  });

  it('a reference crease never hides a fold', () => {
    const line = { a: [0, H / 2] as Vec2, b: [W, H / 2] as Vec2 };
    const folded = foldAll(A4, [valley(line)]);
    // Creasing along the folded edge finds nothing to cut.
    const { state, issues } = applyStep(folded, { kind: 'crease', line }, 1);
    expect(issues.map((i) => i.code)).toEqual(['line-misses-paper']);
    expect(state.creases).toEqual(folded.creases);
  });
});

describe('invalid steps', () => {
  const sheet = createSheet(A4);

  const expectSkipped = (step: FoldStep, code: string, state = sheet): void => {
    const outcome = applyStep(state, step, 7);
    expect(outcome.issues).toHaveLength(1);
    expect(outcome.issues[0]).toMatchObject({ step: 7, severity: 'error', code });
    expect(outcome.issues[0].message.length).toBeGreaterThan(10);
    expect(outcome.state).toBe(state);
    expect(outcome.frame.after).toBe(state);
    expect(outcome.frame.movingIds).toEqual([]);
    expect(outcome.frame.axis).toBeNull();
  };

  it('a line that misses the paper', () => {
    expectSkipped(valley({ a: [-0.1, 0], b: [-0.1, 1] }), 'line-misses-paper');
    expectSkipped(mountain({ a: [0, 0.5], b: [1, 0.5] }), 'line-misses-paper');
    expectSkipped({ kind: 'crease', line: { a: [0.3, 0], b: [0.3, 1] } }, 'line-misses-paper');
  });

  it('a zero-length line', () => {
    expectSkipped(valley({ a: [0.1, 0.1], b: [0.1, 0.1] }), 'degenerate-line');
    expectSkipped({ kind: 'crease', line: { a: [0.1, 0.1], b: [0.1, 0.1 + 1e-12] } }, 'degenerate-line');
  });

  it('a fold that moves everything, or nothing', () => {
    // Along the left edge: the whole sheet is on the right.
    expectSkipped(valley({ a: [0, 0], b: [0, H] }, 'right'), 'nothing-moves');
    expectSkipped(valley({ a: [0, 0], b: [0, H] }, 'left'), 'nothing-moves');
    // Through one corner only.
    expectSkipped(valley({ a: [-0.1, 0.1], b: [0.1, -0.1] }, 'left'), 'nothing-moves');
  });

  it('a flap fold with no flap', () => {
    const flap: FoldStep = { kind: 'fold', line: { a: [0, 0], b: [0, H] }, moving: 'left', dir: 'valley', layers: 'flap' };
    expectSkipped(flap, 'nothing-moves');
  });

  it('garbage in, no exception out', () => {
    const nan: FoldStep = valley({ a: [Number.NaN, 0], b: [0.1, 0.1] });
    expectSkipped(nan, 'degenerate-line');
    expectSkipped(valley({ a: [0, 0], b: [Infinity, 1] }), 'degenerate-line');
    const junk = [
      null,
      undefined,
      {},
      { kind: 'fold' },
      { kind: 'fold', line: { a: [0, 0] } },
      { kind: 'crease', line: null },
      { kind: 'unfold' },
      { kind: 'fold', line: { a: 'x', b: [1, 1] }, moving: 'up', dir: 'sideways', layers: 'some' },
    ] as unknown as FoldStep[];
    for (const step of junk) {
      const outcome = applyStep(sheet, step, 0);
      expect(outcome.state).toBe(sheet);
      expect(outcome.issues[0]?.severity).toBe('error');
    }
  });

  it('foldFlat keeps going after a bad step and reports it once', () => {
    const steps = dartSteps(A4);
    const withJunk = [steps[0], valley({ a: [1, 0], b: [1, 1] }), ...steps.slice(1)];
    const result = foldFlat(A4, withJunk);
    expect(result.frames).toHaveLength(withJunk.length);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ step: 1, severity: 'error', code: 'line-misses-paper' });
    const clean = foldFlat(A4, steps).final;
    expect(result.final.pieces.map((p) => p.iso)).toEqual(clean.pieces.map((p) => p.iso));
  });

  it('warns about a sliver and does not cut it', () => {
    // One corner folded in. The line cuts the sheet in two and clips the tip of the flap by 5e-13 m².
    const flapped = foldAll(A4, dartSteps(A4).slice(0, 2));
    const tip: Vec2 = [W / 2, H - W / 2];
    const line = { a: [tip[0] - 1e-6, tip[1]] as Vec2, b: [tip[0], tip[1] + 1e-6] as Vec2 };
    const { state, frame, issues } = applyStep(flapped, valley(line), 2);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ step: 2, severity: 'warning', code: 'sliver' });
    // The flap moved whole, the sheet was cut.
    expect(frame.split).toHaveLength(3);
    expect(frame.movingIds).toHaveLength(2);
    expectValidState(state, 'sliver', { tiling: true, continuity: true });
  });

  it('treats a line that only shaves a sliver off the model as moving nothing', () => {
    const line = { a: [0, H - 1e-6] as Vec2, b: [1e-6, H] as Vec2 };
    expectSkipped(valley(line, 'left'), 'nothing-moves');
    expectSkipped(valley(line, 'right'), 'nothing-moves');
  });
});

describe('layer limit', () => {
  /** Fold the sheet in half `count` times, alternating direction. */
  function halvings(count: number): FoldStep[] {
    const steps: FoldStep[] = [];
    let w = W;
    let h = H;
    for (let i = 0; i < count; i++) {
      if (i % 2 === 0) {
        h /= 2;
        steps.push(valley({ a: [0, h], b: [W, h] }));
      } else {
        w /= 2;
        steps.push(valley({ a: [w, H], b: [w, 0] }));
      }
    }
    return steps;
  }

  it('folds a sheet in half nine times and refuses the tenth', () => {
    const nine = foldFlat(A4, halvings(9));
    expect(nine.issues).toEqual([]);
    expect(nine.final.pieces).toHaveLength(MAX_PIECES);
    expectValidState(nine.final, 'nine halvings');

    const ten = foldFlat(A4, halvings(10));
    expect(ten.issues).toHaveLength(1);
    expect(ten.issues[0]).toMatchObject({ step: 9, severity: 'error', code: 'nothing-moves' });
    expect(ten.issues[0].message).toMatch(/layers/);
    expect(ten.final.pieces).toEqual(nine.final.pieces);
    expect(ten.frames[9].after).toBe(ten.frames[9].before);
  });

  it('still takes folds that add no pieces, and creases', () => {
    const { final } = foldFlat(A4, halvings(9));
    const flip = applyStep(final, { kind: 'flip' }, 9);
    expect(flip.issues).toEqual([]);
    const crease = applyStep(final, { kind: 'crease', line: { a: [0, 0.004], b: [W, 0.005] } }, 9);
    expect(crease.issues).toEqual([]);
    expect(crease.state.pieces).toBe(final.pieces);
  });
});

describe('performance', () => {
  it('folds twelve steps on A4 in well under 5 ms', () => {
    const steps = busySteps(A4);
    expect(steps).toHaveLength(12);
    for (let i = 0; i < 20; i++) foldFlat(A4, steps);
    const runs = 50;
    const start = performance.now();
    for (let i = 0; i < runs; i++) foldFlat(A4, steps);
    const each = (performance.now() - start) / runs;
    expect(foldFlat(A4, steps).issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(each).toBeLessThan(5);
  });

  it('stays interactive at the layer limit', () => {
    // 256 layers cut into 512: about 3 ms. The bound is loose to stay quiet on a busy machine;
    // without the limit the next two halvings take 12 ms and 200 ms.
    const steps: FoldStep[] = [];
    for (let i = 0, w = W, h = H; i < 8; i++) {
      if (i % 2 === 0) steps.push(valley({ a: [0, (h /= 2)], b: [W, h] }));
      else steps.push(valley({ a: [(w /= 2), H], b: [w, 0] }));
    }
    const thick = foldFlat(A4, steps).final;
    expect(thick.pieces).toHaveLength(256);
    for (const layers of ['all', 'flap'] as const) {
      const last: FoldStep = { kind: 'fold', line: { a: [0, H / 32], b: [W, H / 32] }, moving: 'left', dir: 'valley', layers };
      for (let i = 0; i < 5; i++) applyStep(thick, last, 8);
      const runs = 20;
      const start = performance.now();
      for (let i = 0; i < runs; i++) applyStep(thick, last, 8);
      const each = (performance.now() - start) / runs;
      expect(applyStep(thick, last, 8).state.pieces).toHaveLength(MAX_PIECES);
      expect(each).toBeLessThan(20);
    }
  });
});
