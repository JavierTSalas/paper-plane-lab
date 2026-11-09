import { describe, expect, it } from 'vitest';
import { A4, dartSteps, lockSteps, mountain, valley } from './fixtures';
import { applyStep, createSheet, foldFlat, frameAt, piecePolygon } from './index';
import type { AnimPiece } from './index';
import type { FlatPiece, FoldLine, StepFrame, Vec2 } from '../types';

const W = A4.width;
const H = A4.height;
const GAP = 1e-4;

const frameOf = (stepsBefore: number, sequence = dartSteps(A4)): StepFrame => foldFlat(A4, sequence).frames[stepsBefore];

const byId = (pieces: readonly AnimPiece[], id: number): AnimPiece => {
  const found = pieces.find((p) => p.id === id);
  if (!found) throw new Error(`no animated piece ${id}`);
  return found;
};

function expectAt(anim: AnimPiece, piece: FlatPiece, height: number): void {
  const table = piecePolygon(piece);
  expect(anim.verts).toHaveLength(table.length);
  anim.verts.forEach((v, i) => {
    expect(v[0]).toBeCloseTo(table[i][0], 12);
    expect(v[1]).toBeCloseTo(table[i][1], 12);
    expect(v[2]).toBeCloseTo(height, 12);
  });
}

/** Distance of a table point from a line. */
function offLine(p: Vec2, line: FoldLine): number {
  const ux = line.b[0] - line.a[0];
  const uy = line.b[1] - line.a[1];
  return (ux * (p[1] - line.a[1]) - uy * (p[0] - line.a[0])) / Math.hypot(ux, uy);
}

describe('frameAt', () => {
  it('starts at the split pieces, each at the height of its layer', () => {
    for (const frame of foldFlat(A4, lockSteps(A4)).frames) {
      const start = frameAt(frame, 0, GAP);
      expect(start.map((p) => p.id)).toEqual(frame.split.map((p) => p.id));
      for (const piece of frame.split) {
        const anim = byId(start, piece.id);
        expectAt(anim, piece, piece.layer * GAP);
        expect(anim.sheet).toBe(piece.sheet);
        expect(anim.frontUp).toBe(!piece.flipped);
        expect(anim.moving).toBe(frame.movingIds.includes(piece.id));
      }
    }
  });

  it('ends at the after state: places, heights and faces', () => {
    for (const frame of foldFlat(A4, lockSteps(A4)).frames) {
      if (frame.step.kind !== 'fold') continue;
      const end = frameAt(frame, 1, GAP);
      expect(end).toHaveLength(frame.after.pieces.length);
      for (const piece of frame.after.pieces) {
        const anim = byId(end, piece.id);
        expectAt(anim, piece, piece.layer * GAP);
        expect(anim.frontUp).toBe(!piece.flipped);
        expect(anim.sheet).toEqual(piece.sheet);
      }
      expect(end.filter((p) => p.moving).map((p) => p.id).sort()).toEqual([...frame.movingIds].sort());
    }
  });

  it('swings a valley flap through +z and a mountain flap through -z, rigidly about the axis', () => {
    const line: FoldLine = { a: [0, 0.1], b: [W, 0.2] };
    for (const [step, sign] of [[valley(line), 1], [mountain(line), -1], [valley(line, 'right'), 1], [mountain(line, 'right'), -1]] as const) {
      const { frame, issues } = applyStep(createSheet(A4), step, 0);
      expect(issues).toEqual([]);
      expect(frame.sense).toBe(sign);
      for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const pieces = frameAt(frame, t, 0);
        for (const anim of pieces.filter((p) => p.moving)) {
          const flat = piecePolygon(frame.split.find((p) => p.id === anim.id)!);
          anim.verts.forEach((v, i) => {
            const reach = Math.abs(offLine(flat[i], line));
            // Height and distance from the axis follow the swing angle pi * t.
            expect(v[2] * sign).toBeCloseTo(reach * Math.sin(Math.PI * t), 12);
            expect(Math.abs(offLine([v[0], v[1]], line))).toBeCloseTo(reach * Math.abs(Math.cos(Math.PI * t)), 12);
          });
          expect(anim.frontUp).toBe(t <= 0.5);
        }
        for (const anim of pieces.filter((p) => !p.moving)) {
          expect(anim.verts.every((v) => v[2] === 0)).toBe(true);
          expect(anim.frontUp).toBe(true);
        }
      }
    }
  });

  it('blends every layer height from before to after', () => {
    // Second fold of two: the staying pieces keep their layers, the moving ones cross over.
    const frame = frameOf(1, [valley({ a: [0, H / 2], b: [W, H / 2] }), valley({ a: [W / 2, 0], b: [W / 2, H] })]);
    const after = new Map(frame.after.pieces.map((p) => [p.id, p.layer]));
    const quarter = frameAt(frame, 0.25, GAP);
    for (const piece of frame.split) {
      const anim = byId(quarter, piece.id);
      const height = (0.75 * piece.layer + 0.25 * after.get(piece.id)!) * GAP;
      // Vertices on the axis do not swing, so they sit exactly at the blended height.
      const onAxis = anim.verts.filter((v) => Math.abs(v[0] - W / 2) < 1e-12);
      expect(onAxis.length).toBe(2);
      for (const v of onAxis) expect(v[2]).toBeCloseTo(height, 12);
    }
  });

  it('a crease frame plays the fold of the left side and leaves the rest', () => {
    const frame = frameOf(0);
    expect(frame.step.kind).toBe('crease');
    expect(frame.after.pieces).toEqual(frame.before.pieces);
    const end = frameAt(frame, 1, GAP);
    expect(end).toHaveLength(2);
    const moved = end.find((p) => p.moving)!;
    const stayed = end.find((p) => !p.moving)!;
    // The left half lands on the right half, one layer up, back side showing.
    for (const v of moved.verts) {
      expect(v[0]).toBeGreaterThanOrEqual(W / 2 - 1e-12);
      expect(v[2]).toBeCloseTo(GAP, 12);
    }
    expect(moved.frontUp).toBe(false);
    expect(stayed.frontUp).toBe(true);
    for (const v of stayed.verts) expect(v[2]).toBeCloseTo(0, 12);
    const half = frameAt(frame, 0.5, GAP).find((p) => p.moving)!;
    expect(Math.max(...half.verts.map((v) => v[2]))).toBeCloseTo(W / 2 + GAP / 2, 12);
  });

  it('a flip turns the whole model about the centreline', () => {
    const before = foldFlat(A4, dartSteps(A4).slice(0, 2)).final;
    const { frame } = applyStep(before, { kind: 'flip' }, 2);
    const start = frameAt(frame, 0, GAP);
    const end = frameAt(frame, 1, GAP);
    expect(start).toHaveLength(before.pieces.length);
    for (const piece of before.pieces) {
      expectAt(byId(start, piece.id), piece, piece.layer * GAP);
      expect(byId(start, piece.id).frontUp).toBe(!piece.flipped);
    }
    for (const piece of frame.after.pieces) {
      expectAt(byId(end, piece.id), piece, piece.layer * GAP);
      expect(byId(end, piece.id).frontUp).toBe(!piece.flipped);
    }
    // Halfway the sheet stands on edge in the plane x = W/2.
    const mid = frameAt(frame, 0.5, 0);
    for (const anim of mid) {
      for (const v of anim.verts) expect(v[0]).toBeCloseTo(W / 2, 12);
      expect(anim.moving).toBe(true);
    }
    const reach = Math.max(...mid.flatMap((p) => p.verts.map((v) => Math.abs(v[2]))));
    expect(reach).toBeCloseTo(W / 2, 12);
  });

  it('clamps t and stands still for a skipped step', () => {
    const frame = frameOf(1);
    expect(frameAt(frame, -3, GAP)).toEqual(frameAt(frame, 0, GAP));
    expect(frameAt(frame, 7, GAP)).toEqual(frameAt(frame, 1, GAP));
    const skipped = applyStep(createSheet(A4), valley({ a: [1, 0], b: [1, 1] }), 0).frame;
    for (const t of [0, 0.5, 1]) {
      const still = frameAt(skipped, t, GAP);
      expect(still).toHaveLength(1);
      expect(still[0].moving).toBe(false);
      expect(still[0].verts).toEqual([[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]]);
    }
  });
});
