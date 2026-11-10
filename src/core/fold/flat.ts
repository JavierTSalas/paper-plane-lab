import { addCrease } from './creases';
import { selectFlap } from './flap';
import {
  applyIso, boundsOf, boxesMeet, COLLINEAR_TOL, collinearOverlap, composeIso, EPS, ISO_IDENTITY, isPoint, lineDistance,
  MIN_FEATURE, mirrorIso, reflectionIso, splitByLine, toLine,
} from './geom';
import type { Bounds, Line, Segment, Split } from './geom';
import type {
  Crease, FlatPiece, FlatState, FoldIssue, FoldLine, FoldResult, FoldStep, FoldStepCrease, FoldStepFold,
  PaperSpec, StepFrame, Vec2,
} from '../types';

/** How far the default flap pick sits from the fold line, on the moving side, metres. */
const PICK_NUDGE = 1e-4;
/**
 * A fold that would leave more pieces than this is refused (research doc 07, section 9.5: all-layers
 * folds double the count). Nine halvings of a sheet reach it; no real sheet folds further.
 */
export const MAX_PIECES = 512;

export interface StepOutcome {
  state: FlatState;
  frame: StepFrame;
  issues: FoldIssue[];
}

/** The unfolded sheet, front face up. */
export function createSheet(paper: PaperSpec): FlatState {
  const { width, height } = paper;
  const sheet: Vec2[] = [[0, 0], [width, 0], [width, height], [0, height]];
  return { paper, pieces: [{ id: 0, sheet, iso: ISO_IDENTITY, flipped: false, layer: 0 }], creases: [] };
}

/** Table-frame polygon of a piece. Vertex i belongs to sheet vertex i, so flipped pieces run clockwise. */
export const piecePolygon = (piece: FlatPiece): Vec2[] => piece.sheet.map((v) => applyIso(piece.iso, v));

export const tableBounds = (state: FlatState): Bounds => boundsOf(state.pieces.map(piecePolygon));

/**
 * Stacking order after a fold, bottom to top: the pieces that stay keep their order, the moving ones
 * are reversed and go on top (sense +1, valley) or underneath (sense -1, mountain).
 */
export function stackAfterFold(pieces: readonly FlatPiece[], moving: ReadonlySet<number>, sense: 1 | -1): FlatPiece[] {
  const byLayer = [...pieces].sort((p, q) => p.layer - q.layer);
  const staying = byLayer.filter((p) => !moving.has(p.id));
  const moved = byLayer.filter((p) => moving.has(p.id)).reverse();
  return sense > 0 ? [...staying, ...moved] : [...moved, ...staying];
}

const nextPieceId = (pieces: readonly FlatPiece[]): number => pieces.reduce((max, p) => Math.max(max, p.id), -1) + 1;

/** Assignment seen from the front of the sheet for a fold made on a piece with the given facing. */
const assignmentFor = (valley: boolean, flipped: boolean): Crease['assignment'] =>
  valley !== flipped ? 'valley' : 'mountain';

function skipped(state: FlatState, step: FoldStep, index: number, code: FoldIssue['code'], message: string): StepOutcome {
  return {
    state,
    frame: { index, step, before: state, after: state, split: state.pieces, movingIds: [], axis: null, sense: 1 },
    issues: [{ step: index, severity: 'error', code, message }],
  };
}

const sliverWarning = (index: number): FoldIssue => ({
  step: index,
  severity: 'warning',
  code: 'sliver',
  message: 'The line clips a corner by less than a hair. That corner was left uncut.',
});

/** The edge of a piece that lies on the line, in sheet coordinates. */
function edgeOnLine(piece: FlatPiece, line: Line): Segment | null {
  const on = piece.sheet.map((v) => Math.abs(lineDistance(line, applyIso(piece.iso, v))) <= EPS);
  for (let i = 0, j = on.length - 1; i < on.length; j = i++) {
    if (!on[i] || !on[j]) continue;
    const a = piece.sheet[j];
    const b = piece.sheet[i];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > MIN_FEATURE) return [a, b];
  }
  return null;
}

/**
 * Creases where a piece that moved whole hinges on a piece that stayed, along an edge both already had.
 * A flat join becomes a fold. A fold swung back open becomes a flat reference crease.
 */
function hingeCreases(
  creases: Crease[],
  movers: readonly FlatPiece[],
  stayers: readonly FlatPiece[],
  line: Line,
  valley: boolean,
  step: number,
): Crease[] {
  let out = creases;
  let boxes: Bounds[] | null = null;
  for (const mover of movers) {
    const edge = edgeOnLine(mover, line);
    if (!edge) continue;
    boxes ??= stayers.map((p) => boundsOf([p.sheet]));
    const reach = boundsOf([edge]);
    stayers.forEach((stayer, k) => {
      if (!boxesMeet(boxes![k], reach, COLLINEAR_TOL)) return;
      for (let i = 0, j = stayer.sheet.length - 1; i < stayer.sheet.length; j = i++) {
        const shared = collinearOverlap(edge[0], edge[1], stayer.sheet[j], stayer.sheet[i]);
        if (!shared) continue;
        const wasFlat = mover.flipped === stayer.flipped;
        const assignment = wasFlat ? assignmentFor(valley, stayer.flipped) : 'aux';
        out = addCrease(out, { a: shared[0], b: shared[1], assignment, step }, 'override');
      }
    });
  }
  return out;
}

function defaultPick(line: FoldLine, unit: Line, movingLeft: boolean): Vec2 {
  const nudge = movingLeft ? PICK_NUDGE : -PICK_NUDGE;
  return [(line.a[0] + line.b[0]) / 2 - unit.u[1] * nudge, (line.a[1] + line.b[1]) / 2 + unit.u[0] * nudge];
}

function applyFold(state: FlatState, step: FoldStepFold, index: number): StepOutcome {
  const line = toLine(step.line);
  if (!line) return skipped(state, step, index, 'degenerate-line', 'A fold line needs two different points.');
  const movingLeft = step.moving !== 'right';
  const valley = step.dir !== 'mountain';
  const sense = valley ? 1 : -1;
  const cuts = state.pieces.map((p) => splitByLine(p.sheet, p.iso, line));
  if (!cuts.some((c) => c.touches)) {
    return skipped(state, step, index, 'line-misses-paper', 'The fold line does not touch the paper.');
  }
  const movingPart = (c: Split): Vec2[] | null => (movingLeft ? c.pos : c.neg);
  const stayingPart = (c: Split): Vec2[] | null => (movingLeft ? c.neg : c.pos);

  const folds = cuts.map((c) => movingPart(c) !== null);
  let blocked = false;
  if (step.layers === 'flap') {
    const candidates = folds.flatMap((yes, i) => (yes ? [i] : []));
    const choice = selectFlap(
      candidates.map((i) => ({ sheet: movingPart(cuts[i])!, iso: state.pieces[i].iso, layer: state.pieces[i].layer })),
      line,
      movingLeft ? 1 : -1,
      valley,
      isPoint(step.pick) ? step.pick : defaultPick(step.line, line, movingLeft),
    );
    folds.fill(false);
    for (const member of choice?.members ?? []) folds[candidates[member]] = true;
    blocked = choice?.blocked ?? false;
  }
  if (!folds.includes(true)) {
    return skipped(state, step, index, 'nothing-moves', 'There is no paper to fold on the moving side of the line.');
  }
  if (cuts.every((c, i) => folds[i] && stayingPart(c) === null)) {
    return skipped(state, step, index, 'nothing-moves', 'The whole model lies on the moving side, so nothing would stay put.');
  }

  const newPieces = cuts.filter((c, i) => folds[i] && c.cut !== null).length;
  if (state.pieces.length + newPieces > MAX_PIECES) {
    // The contract has no code of its own for this; nothing can move because the stack is too thick.
    return skipped(state, step, index, 'too-many-layers', 'That would make more layers than paper can be folded into. Unfold something first.');
  }

  let nextId = nextPieceId(state.pieces);
  let creases = state.creases;
  const split: FlatPiece[] = [];
  const moving = new Set<number>();
  const wholeMovers: FlatPiece[] = [];
  state.pieces.forEach((piece, i) => {
    if (!folds[i]) {
      split.push(piece);
      return;
    }
    const stay = stayingPart(cuts[i]);
    const cut = cuts[i].cut;
    if (!stay || !cut) {
      split.push(piece);
      moving.add(piece.id);
      wholeMovers.push(piece);
      return;
    }
    const moved: FlatPiece = { ...piece, id: nextId++, sheet: movingPart(cuts[i])! };
    split.push({ ...piece, sheet: stay }, moved);
    moving.add(moved.id);
    const assignment = assignmentFor(valley, piece.flipped);
    creases = addCrease(creases, { a: cut[0], b: cut[1], assignment, step: index }, 'override');
  });
  creases = hingeCreases(creases, wholeMovers, split.filter((p) => !moving.has(p.id)), line, valley, index);

  const reflect = reflectionIso(line);
  const pieces = stackAfterFold(split, moving, sense).map((p, layer) =>
    moving.has(p.id) ? { ...p, iso: composeIso(reflect, p.iso), flipped: !p.flipped, layer } : { ...p, layer },
  );
  const after: FlatState = { paper: state.paper, pieces, creases };

  const issues: FoldIssue[] = [];
  if (blocked) {
    issues.push({
      step: index,
      severity: 'warning',
      code: 'flap-blocked',
      message: 'Other layers lie in the way of that flap, so they fold along with it.',
    });
  }
  if (cuts.some((c) => c.sliver)) issues.push(sliverWarning(index));
  const axis: FoldLine = movingLeft ? { a: step.line.a, b: step.line.b } : { a: step.line.b, b: step.line.a };
  return {
    state: after,
    frame: { index, step, before: state, after, split, movingIds: [...moving], axis, sense },
    issues,
  };
}

function applyCrease(state: FlatState, step: FoldStepCrease, index: number): StepOutcome {
  const line = toLine(step.line);
  if (!line) return skipped(state, step, index, 'degenerate-line', 'A crease line needs two different points.');
  const cuts = state.pieces.map((p) => splitByLine(p.sheet, p.iso, line));
  if (!cuts.some((c) => c.cut)) {
    return skipped(state, step, index, 'line-misses-paper', 'The crease line does not cross the paper.');
  }
  let nextId = nextPieceId(state.pieces);
  let creases = state.creases;
  const split: FlatPiece[] = [];
  const movingIds: number[] = [];
  state.pieces.forEach((piece, i) => {
    const { pos, neg, cut } = cuts[i];
    if (pos && neg && cut) {
      const left: FlatPiece = { ...piece, id: nextId++, sheet: pos };
      split.push({ ...piece, sheet: neg }, left);
      movingIds.push(left.id);
      creases = addCrease(creases, { a: cut[0], b: cut[1], assignment: 'aux', step: index }, 'yield');
    } else {
      split.push(piece);
      if (pos) movingIds.push(piece.id);
    }
  });
  const after: FlatState = { ...state, creases };
  return {
    state: after,
    frame: { index, step, before: state, after, split, movingIds, axis: { a: step.line.a, b: step.line.b }, sense: 1 },
    issues: cuts.some((c) => c.sliver) ? [sliverWarning(index)] : [],
  };
}

function applyFlip(state: FlatState, step: FoldStep, index: number): StepOutcome {
  const mirror = mirrorIso(state.paper.width / 2);
  const top = state.pieces.length - 1;
  const pieces = state.pieces
    .map((p) => ({ ...p, iso: composeIso(mirror, p.iso), flipped: !p.flipped, layer: top - p.layer }))
    .sort((p, q) => p.layer - q.layer);
  const after: FlatState = { ...state, pieces };
  return {
    state: after,
    frame: { index, step, before: state, after, split: [], movingIds: [], axis: null, sense: 1 },
    issues: [],
  };
}

/**
 * Apply one step. Never throws on bad input: a step that cannot be done is skipped and reported.
 *
 * Returned states list their pieces bottom layer first.
 * Frame conventions beyond the StepFrame contract:
 *  - `axis` is directed so that the moving pieces lie on its LEFT. Rotating them about it by
 *    `sense * pi` (right-hand rule, viewer at +z) lands them in their `after` position.
 *  - Both halves of a cut piece carry the layer of the piece they came from. The half that stays keeps
 *    the id, the half that moves gets a new one.
 *  - A crease step describes the valley fold of every layer left of its line. Its `after` state is the
 *    uncut `before` state plus the new reference creases, so the ids of the cut-off halves in `split`
 *    exist only inside that frame.
 *  - A skipped step has `after === before`, `split === before.pieces`, no moving pieces and no axis.
 *  - A fold that would leave more than MAX_PIECES pieces is skipped and reported as `too-many-layers`.
 *  - A `sliver` warning means a corner the line clips by less than 1e-12 m² was left on its piece, uncut.
 *    That speck then lies on the wrong side of the fold, out of line with its neighbours.
 */
export function applyStep(state: FlatState, step: FoldStep, index: number): StepOutcome {
  switch (step?.kind) {
    case 'fold':
      return applyFold(state, step, index);
    case 'crease':
      return applyCrease(state, step, index);
    case 'flip':
      return applyFlip(state, step, index);
    default:
      return skipped(state, step, index, 'degenerate-line', 'This step is not a fold, a crease or a flip.');
  }
}

/** Fold a fresh sheet through all the steps. `frames[i]` belongs to `steps[i]`, skipped or not. */
export function foldFlat(paper: PaperSpec, steps: readonly FoldStep[]): FoldResult {
  let state = createSheet(paper);
  const frames: StepFrame[] = [];
  const issues: FoldIssue[] = [];
  steps.forEach((step, index) => {
    const outcome = applyStep(state, step, index);
    state = outcome.state;
    frames.push(outcome.frame);
    issues.push(...outcome.issues);
  });
  return { final: state, frames, issues };
}
