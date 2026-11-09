import { COLLINEAR_TOL, MIN_FEATURE } from './geom';
import type { Crease, Vec2 } from '../types';

/** A stretch of the new crease's line, measured from its first point. */
interface Span {
  lo: number;
  hi: number;
  step: number;
  /** The existing crease this span is, while nothing has been merged into it. */
  source: Crease | null;
}

function outside(span: Span, lo: number, hi: number): Span[] {
  const parts: Span[] = [];
  if (Math.min(span.hi, lo) - span.lo > MIN_FEATURE) parts.push({ ...span, hi: Math.min(span.hi, lo), source: null });
  if (span.hi - Math.max(span.lo, hi) > MIN_FEATURE) parts.push({ ...span, lo: Math.max(span.lo, hi), source: null });
  return parts;
}

/**
 * Add a crease to a list while keeping the list free of overlapping segments.
 *  override  the new crease replaces whatever it overlaps (a fold made now).
 *  yield     existing creases of another assignment win where they overlap (a reference crease).
 * Collinear creases of one assignment that touch or overlap become one segment, dated by the earliest step.
 */
export function addCrease(list: Crease[], crease: Crease, mode: 'override' | 'yield'): Crease[] {
  const [ax, ay] = crease.a;
  const len = Math.hypot(crease.b[0] - ax, crease.b[1] - ay);
  if (len < MIN_FEATURE) return list;
  const ux = (crease.b[0] - ax) / len;
  const uy = (crease.b[1] - ay) / len;
  const along = (p: Vec2): number => ux * (p[0] - ax) + uy * (p[1] - ay);
  const off = (p: Vec2): number => ux * (p[1] - ay) - uy * (p[0] - ax);
  const at = (t: number): Vec2 => [ax + ux * t, ay + uy * t];

  const out: Crease[] = [];
  const same: Span[] = [];
  let fresh: Span[] = [{ lo: 0, hi: len, step: crease.step, source: null }];
  for (const old of list) {
    if (Math.abs(off(old.a)) > COLLINEAR_TOL || Math.abs(off(old.b)) > COLLINEAR_TOL) {
      out.push(old);
      continue;
    }
    const span: Span = {
      lo: Math.min(along(old.a), along(old.b)),
      hi: Math.max(along(old.a), along(old.b)),
      step: old.step,
      source: old,
    };
    if (old.assignment === crease.assignment) {
      same.push(span);
    } else if (Math.min(span.hi, len) - Math.max(span.lo, 0) < MIN_FEATURE) {
      out.push(old);
    } else if (mode === 'override') {
      for (const rest of outside(span, 0, len)) out.push({ ...old, a: at(rest.lo), b: at(rest.hi) });
    } else {
      out.push(old);
      fresh = fresh.flatMap((s) => outside(s, span.lo, span.hi));
    }
  }

  const emit = (run: Span): void => {
    out.push(run.source ?? { a: at(run.lo), b: at(run.hi), assignment: crease.assignment, step: run.step });
  };
  let run: Span | null = null;
  for (const span of [...same, ...fresh].sort((p, q) => p.lo - q.lo)) {
    if (run && span.lo <= run.hi + MIN_FEATURE) {
      run = { lo: run.lo, hi: Math.max(run.hi, span.hi), step: Math.min(run.step, span.step), source: null };
    } else {
      if (run) emit(run);
      run = span;
    }
  }
  if (run) emit(run);
  return out;
}
