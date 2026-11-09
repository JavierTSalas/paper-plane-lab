import { describe, expect, it } from 'vitest';
import { createRng } from '../math';
import type { Rng } from '../math';
import { A4, LETTER, paperOf } from './fixtures';
import {
  applyStep, createSheet, defaultShape, foldPointToPoint, frameAt, mirrorStep, poseModel, snapPoints, tableBounds,
} from './index';
import { expectValidState, polygonArea } from './invariants';
import type { FlatState, FoldLine, FoldStep, PaperSpec, Vec2, Vec3 } from '../types';

const PAPERS: PaperSpec[] = [A4, LETTER, paperOf(0.15, 0.15, 'square'), paperOf(0.297, 0.21, 'a4-landscape')];
const SEQUENCES = 180;
const MAX_STEPS = 8;

const choose = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng.next() * items.length)];

/** A line through snap points of the model: through two of them, their bisector, or straight across. */
function randomLine(rng: Rng, state: FlatState): FoldLine {
  const points = snapPoints(state);
  const p = choose(rng, points);
  let q = choose(rng, points);
  for (let tries = 0; tries < 8 && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3; tries++) q = choose(rng, points);
  const kind = rng.next();
  if (kind < 0.4) return { a: p, b: q };
  if (kind < 0.8) return foldPointToPoint(p, q);
  const { min, max } = tableBounds(state);
  return rng.next() < 0.5 ? { a: [min[0], p[1]], b: [max[0], p[1]] } : { a: [max[0], p[1]], b: [min[0], p[1]] };
}

const isAcross = (line: FoldLine): boolean => Math.abs(line.a[1] - line.b[1]) < 1e-12;

/** One random step, followed by its mirror image unless it is its own mirror image. */
function randomSteps(rng: Rng, state: FlatState): FoldStep[] {
  const roll = rng.next();
  if (roll < 0.08) return [{ kind: 'flip' }];
  const line = randomLine(rng, state);
  const centreX = state.paper.width / 2;
  if (roll < 0.18) {
    const crease: FoldStep = { kind: 'crease', line };
    return isAcross(line) ? [crease] : [crease, mirrorStep(crease, centreX)];
  }
  const fold: FoldStep = {
    kind: 'fold',
    line,
    moving: rng.next() < 0.5 ? 'left' : 'right',
    dir: rng.next() < 0.7 ? 'valley' : 'mountain',
    layers: rng.next() < 0.6 ? 'all' : 'flap',
  };
  if (fold.layers === 'flap' && rng.next() < 0.3) {
    const { min, max } = tableBounds(state);
    fold.pick = [rng.range(min[0], max[0]), rng.range(min[1], max[1])];
  }
  return isAcross(line) ? [fold] : [fold, mirrorStep(fold, centreX)];
}

const finite = (verts: readonly Vec3[]): boolean => verts.every((v) => v.every(Number.isFinite));

function triangleFanArea(verts: readonly Vec3[]): number {
  let area = 0;
  for (let i = 1; i + 1 < verts.length; i++) {
    const u = [verts[i][0] - verts[0][0], verts[i][1] - verts[0][1], verts[i][2] - verts[0][2]];
    const v = [verts[i + 1][0] - verts[0][0], verts[i + 1][1] - verts[0][1], verts[i + 1][2] - verts[0][2]];
    area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return area;
}

describe('random symmetric fold sequences', () => {
  const tally = { sequences: 0, steps: 0, applied: 0, flapFolds: 0, blocked: 0, maxPieces: 0 };

  it(`${SEQUENCES} sequences of up to ${MAX_STEPS} steps keep every invariant`, () => {
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const rng = createRng(seed * 7919);
      const paper = choose(rng, PAPERS);
      const length = 1 + Math.floor(rng.next() * MAX_STEPS);
      let state = createSheet(paper);
      let index = 0;
      while (index < length) {
        for (const step of randomSteps(rng, state).slice(0, length - index)) {
          const label = `seed ${seed}, step ${index} ${JSON.stringify(step)}`;
          const outcome = applyStep(state, step, index);
          const errors = outcome.issues.filter((issue) => issue.severity === 'error');
          if (errors.length > 0) {
            expect(outcome.state, `${label}: a skipped step changes nothing`).toBe(state);
          } else {
            tally.applied++;
            if (step.kind === 'fold' && step.layers === 'flap') tally.flapFolds++;
            if (outcome.issues.some((issue) => issue.code === 'flap-blocked')) tally.blocked++;
          }
          state = outcome.state;
          expectValidState(state, label, { tiling: state.pieces.length <= 48, continuity: true });
          for (const t of [0, 0.37, 1]) {
            const posed = frameAt(outcome.frame, t, 1e-4);
            expect(posed.every((piece) => finite(piece.verts)), `${label}: animation at ${t}`).toBe(true);
          }
          tally.steps++;
          index++;
        }
      }
      tally.maxPieces = Math.max(tally.maxPieces, state.pieces.length);

      // Whatever came out can be opened into some 3D shape without losing paper.
      const { model } = poseModel(state, defaultShape(state));
      expect(model.pieces.every((piece) => finite(piece.verts)), `seed ${seed}: posed model is finite`).toBe(true);
      const posedArea = model.pieces.reduce((sum, piece) => sum + triangleFanArea(piece.verts), 0);
      expect(posedArea, `seed ${seed}: posed area`).toBeCloseTo(paper.width * paper.height, 10);
      expect(model.pieces.reduce((sum, piece) => sum + polygonArea(piece.sheet), 0)).toBeCloseTo(paper.width * paper.height, 12);
      tally.sequences++;
    }
  });

  it('exercised real folds, not just rejected ones', () => {
    expect(tally.sequences).toBe(SEQUENCES);
    expect(tally.applied).toBeGreaterThan(0.6 * tally.steps);
    expect(tally.flapFolds).toBeGreaterThan(40);
    expect(tally.blocked).toBeGreaterThan(0);
    expect(tally.maxPieces).toBeGreaterThan(20);
  });
});
