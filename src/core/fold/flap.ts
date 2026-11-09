import {
  applyIso, boundsOf, boxesMeet, COLLINEAR_TOL, containsPoint, EPS, lineDistance, MIN_FEATURE, overlaps, sharedEdges,
  unionFind,
} from './geom';
import type { Line } from './geom';
import type { Iso2, Vec2 } from '../types';

/** The portion of one piece that lies on the moving side of the fold line. */
export interface FlapPart {
  /** Sheet polygon. */
  sheet: readonly Vec2[];
  iso: Iso2;
  layer: number;
}

export interface FlapChoice {
  /** Indices into the parts that fold. */
  members: number[];
  /** Other layers lay in the way of the picked flap and were taken along. */
  blocked: boolean;
}

function hasEdgeOnLine(table: readonly Vec2[], line: Line): boolean {
  for (let i = 0, j = table.length - 1; i < table.length; j = i++) {
    if (Math.abs(lineDistance(line, table[i])) > EPS || Math.abs(lineDistance(line, table[j])) > EPS) continue;
    if (Math.hypot(table[i][0] - table[j][0], table[i][1] - table[j][1]) > MIN_FEATURE) return true;
  }
  return false;
}

/**
 * Group the parts into connected pieces of paper. Two parts are joined when they share a sheet edge
 * that lies inside the moving half-plane: paper is continuous across it, so they cannot move apart.
 * An edge on the fold line itself is a hinge and joins nothing.
 */
function components(parts: readonly FlapPart[], line: Line, movingSign: 1 | -1): number[] {
  const boxes = parts.map((p) => boundsOf([p.sheet]));
  const sets = unionFind(parts.length);
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (!boxesMeet(boxes[i], boxes[j], COLLINEAR_TOL) || sets.find(i) === sets.find(j)) continue;
      const joined = sharedEdges(parts[i].sheet, parts[j].sheet).some(([a, b]) => {
        const mid = applyIso(parts[i].iso, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        return movingSign * lineDistance(line, mid) > EPS;
      });
      if (joined) sets.union(i, j);
    }
  }
  return parts.map((_, i) => sets.find(i));
}

/**
 * Choose the flap for a `layers: 'flap'` fold.
 * The flap is the connected piece of paper holding the outermost layer under `pick`
 * (top layer for a valley fold, bottom layer for a mountain fold). With nothing under the pick,
 * the outermost layer that has an edge on the fold line is used. Layers that lie in the flap's way
 * (above it for valley, below it for mountain) are taken along with everything connected to them.
 * Returns null when there is no flap to fold.
 */
export function selectFlap(
  parts: readonly FlapPart[],
  line: Line,
  movingSign: 1 | -1,
  outermostIsTop: boolean,
  pick: Vec2,
): FlapChoice | null {
  const tables = parts.map((p) => p.sheet.map((v) => applyIso(p.iso, v)));
  const outer = (i: number, j: number): boolean =>
    j < 0 || (outermostIsTop ? parts[i].layer > parts[j].layer : parts[i].layer < parts[j].layer);

  let seed = -1;
  tables.forEach((table, i) => {
    if (containsPoint(table, pick, EPS) && outer(i, seed)) seed = i;
  });
  if (seed < 0) {
    tables.forEach((table, i) => {
      if (hasEdgeOnLine(table, line) && outer(i, seed)) seed = i;
    });
  }
  if (seed < 0) return null;

  const group = components(parts, line, movingSign);
  const reach = tables.map((table) => boundsOf([table]));
  const inFlap = parts.map(() => false);
  const unchecked: number[] = [];
  let outside = parts.length;
  const take = (wanted: number): void => {
    group.forEach((g, i) => {
      if (g !== wanted || inFlap[i]) return;
      inFlap[i] = true;
      unchecked.push(i);
      outside--;
    });
  };
  take(group[seed]);
  let blocked = false;
  for (let f = unchecked.pop(); f !== undefined && outside > 0; f = unchecked.pop()) {
    for (let q = 0; q < parts.length; q++) {
      if (inFlap[q] || !outer(q, f) || !boxesMeet(reach[q], reach[f], 0) || !overlaps(tables[q], tables[f])) continue;
      take(group[q]);
      blocked = true;
    }
  }
  return { members: inFlap.flatMap((yes, i) => (yes ? [i] : [])), blocked };
}
