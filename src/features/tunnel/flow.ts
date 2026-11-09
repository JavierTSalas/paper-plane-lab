/**
 * Two-dimensional smoke picture for the tunnel view: classical potential flow past a flat plate at incidence.
 *
 * A circle of radius a in the zeta plane maps to a plate of chord 4a on the real axis of the z plane through the
 * Joukowski transform z = zeta + a^2 / zeta. With the free stream U at incidence alpha,
 *   W(zeta) = U (zeta e^{-i alpha} + a^2 e^{i alpha} / zeta) + i Gamma / (2 pi) ln zeta.
 * The Kutta condition (smooth flow off the trailing edge, zeta = a) gives Gamma = 4 pi U a sin(alpha), i.e.
 * CL = 2 pi sin(alpha). Here Gamma is instead set from the plane's real lift coefficient (Gamma = CL U c / 2), so the
 * picture shows the circulation that the 3D element model actually produces. Streamlines are traced in the zeta
 * plane, where the body is a smooth circle, and mapped to z.
 *
 * Picture frame: plate chord 1, plate centre at the origin, free stream U = 1 along +x, y up. The plate is rotated
 * by -alpha, so its leading edge sits up and to the left for a positive angle of attack.
 */

export type Pt = readonly [number, number];

export interface FlowOptions {
  alphaRad: number;
  /** Lift coefficient the circulation is scaled to. */
  cl: number;
  /** Past the stall: replace the attached picture behind the plate with a separated, wavy wake. */
  stalled: boolean;
  /** Picture x range to trace over. */
  xMin: number;
  xMax: number;
  /** Seed heights at x = xMin. */
  seeds: readonly number[];
}

export interface FlowPicture {
  streamlines: Pt[][];
  /** Rolled-up shear layers behind a stalled plate (empty while the flow is attached). */
  eddies: Pt[][];
  /** Leading and trailing edge, picture frame. */
  le: Pt;
  te: Pt;
}

const A = 0.25; // circle radius for a chord of 1
const CL_LIMIT = 2.5;

type C = [number, number];

const mul = (p: C, q: C): C => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
const div = (p: C, q: C): C => {
  const d = q[0] * q[0] + q[1] * q[1];
  return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d];
};
const csqrt = (p: C): C => {
  const r = Math.hypot(p[0], p[1]);
  const re = Math.sqrt(Math.max(0, (r + p[0]) / 2));
  const im = Math.sqrt(Math.max(0, (r - p[0]) / 2));
  return [re, p[1] < 0 ? -im : im];
};

/** z = zeta + a^2 / zeta. */
export function joukowski(zeta: C): C {
  const inv = div([A * A, 0], zeta);
  return [zeta[0] + inv[0], zeta[1] + inv[1]];
}

/** Inverse Joukowski map onto the exterior of the circle |zeta| >= a. */
export function inverseJoukowski(z: C): C {
  const s = csqrt([z[0] * z[0] - z[1] * z[1] - 4 * A * A, 2 * z[0] * z[1]]);
  const r1: C = [(z[0] + s[0]) / 2, (z[1] + s[1]) / 2];
  const r2: C = [(z[0] - s[0]) / 2, (z[1] - s[1]) / 2];
  return Math.hypot(r1[0], r1[1]) >= Math.hypot(r2[0], r2[1]) ? r1 : r2;
}

/** Circulation (per unit span, U = 1, chord 1) that gives lift coefficient `cl`. */
export const circulationFor = (cl: number): number => Math.max(-CL_LIMIT, Math.min(CL_LIMIT, cl)) / 2;

/** Physical-plane velocity (u, v) in the plate frame z, at a point given in the zeta plane. */
export function velocityAt(zeta: C, alphaRad: number, gamma: number): C {
  const ea: C = [Math.cos(alphaRad), Math.sin(alphaRad)];
  const ema: C = [ea[0], -ea[1]];
  const z2 = mul(zeta, zeta);
  const t = div(mul([A * A, 0], ea), z2);
  const circ = div([0, gamma / (2 * Math.PI)], zeta);
  const dWdZeta: C = [ema[0] - t[0] + circ[0], ema[1] - t[1] + circ[1]];
  const dzdZeta: C = [1 - div([A * A, 0], z2)[0], -div([A * A, 0], z2)[1]];
  const w = div(dWdZeta, dzdZeta);
  return [w[0], -w[1]];
}

/** zeta-plane velocity conj(dW/dzeta): the direction field the streamlines are traced along. */
function zetaVelocity(zeta: C, alphaRad: number, gamma: number): C {
  const ea: C = [Math.cos(alphaRad), Math.sin(alphaRad)];
  const t = div(mul([A * A, 0], ea), mul(zeta, zeta));
  const circ = div([0, gamma / (2 * Math.PI)], zeta);
  const w: C = [ea[0] - t[0] + circ[0], -ea[1] - t[1] + circ[1]];
  return [w[0], -w[1]];
}

const rot = (p: C, ang: number): C => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};

const STEP = 0.02; // picture-plane arc length per step
const MAX_STEPS = 900;

function trace(seedY: number, o: FlowOptions, gamma: number): Pt[] {
  const toZeta = (p: C): C => inverseJoukowski(rot(p, o.alphaRad));
  const toPic = (zeta: C): C => rot(joukowski(zeta), -o.alphaRad);
  let zeta = toZeta([o.xMin, seedY]);
  const out: Pt[] = [toPic(zeta)];
  const dir = (zt: C): C => {
    const v = zetaVelocity(zt, o.alphaRad, gamma);
    const n = Math.hypot(v[0], v[1]) || 1;
    // Scale the zeta step so the picture step stays about STEP; |dz/dzeta| vanishes at the plate edges.
    const q = div([A * A, 0], mul(zt, zt));
    const stretch = Math.max(0.08, Math.hypot(1 - q[0], q[1]));
    return [(v[0] / n) * (STEP / stretch), (v[1] / n) * (STEP / stretch)];
  };
  const keepOut = (zt: C): C => {
    const r = Math.hypot(zt[0], zt[1]);
    const min = A * 1.0005;
    return r < min ? [(zt[0] / r) * min, (zt[1] / r) * min] : zt;
  };
  let stuck = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const k1 = dir(zeta);
    const mid = keepOut([zeta[0] + k1[0] / 2, zeta[1] + k1[1] / 2]);
    const k2 = dir(mid);
    zeta = keepOut([zeta[0] + k2[0], zeta[1] + k2[1]]);
    const p = toPic(zeta);
    const last = out[out.length - 1]!;
    // A line seeded exactly onto the front stagnation point stalls there; slip it round the body.
    stuck = Math.hypot(p[0] - last[0], p[1] - last[1]) < STEP * 0.1 ? stuck + 1 : 0;
    if (stuck > 3) {
      zeta = rot(zeta, 0.02);
      stuck = 0;
    }
    out.push(p);
    if (p[0] > o.xMax) break;
  }
  return out;
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Half-width of the separated wake at picture x. */
function wakeHalfWidth(x: number, te: Pt, alphaRad: number): number {
  return 0.5 * Math.abs(Math.sin(alphaRad)) + 0.04 + 0.16 * Math.max(0, x - te[0]);
}

/** Push a potential-flow streamline out of the dead-air region behind a stalled plate and make it wavy. */
function separate(line: Pt[], o: FlowOptions, le: Pt, te: Pt): Pt[] {
  // Which side of the plate the line passes: its height where it crosses the plate centre.
  let side = 1;
  let best = Infinity;
  for (const p of line) {
    if (Math.abs(p[0]) < best) {
      best = Math.abs(p[0]);
      side = p[1] >= 0 ? 1 : -1;
    }
  }
  // The flow leaves the plate at the upper (leeward) edge on the top side and at the lower edge underneath.
  const upperEdge = le[1] >= te[1] ? le : te;
  const lowerEdge = le[1] >= te[1] ? te : le;
  const edge = side > 0 ? upperEdge : lowerEdge;
  const edgeX = edge[0];
  // Height of the separation edge on this side: the shear layer leaves it and no line dips below it.
  const edgeD = Math.max(0, side * edge[1]);
  let passed = false;
  return line.map(([x, y]) => {
    // Once a line reaches the edge it stays clear of the dead air, even where potential flow would curl back round it.
    passed ||= x >= edgeX - 0.02;
    const d = side > 0 ? Math.max(0, y) : -Math.min(0, y);
    // Lines far from the plate feel the displacement later and more gently.
    const ramp = smoothstep(edgeX - 0.05 - 0.5 * d, edgeX + 0.3 + 0.8 * d, x);
    if (ramp === 0 && !passed) return [x, y];
    const h = Math.min(0.6, wakeHalfWidth(x, te, o.alphaRad)) * ramp;
    // The dead air displaces the outer flow; the push fades with distance and keeps the lines in order (h < 0.65).
    const pushed = d + h * Math.exp(-d / 0.65);
    const out = passed ? Math.max(pushed, edgeD + 0.01) : pushed;
    const behind = Math.max(0, x - te[0]);
    const near = Math.exp(-Math.max(0, out - h) / 0.3);
    const wave = 0.035 * near * Math.min(1, behind * 3) * (1 + behind) * Math.sin(8 * behind - (side > 0 ? 0 : Math.PI / 2));
    return [x, side * out + wave];
  });
}

/** A schematic vortex street behind a stalled plate: alternating spirals, clockwise on top. */
function shedEddies(o: FlowOptions, te: Pt): Pt[][] {
  const spirals: Pt[][] = [];
  const turns = 1.6;
  for (let k = 0; ; k++) {
    const side = k % 2 === 0 ? 1 : -1;
    const cx = te[0] + 0.12 + 0.24 * k;
    if (cx > o.xMax) break;
    const h = Math.min(0.6, wakeHalfWidth(cx, te, o.alphaRad));
    const cy = side * h * 0.5;
    const rMax = Math.min(0.12, 0.05 + 0.25 * h) * (0.8 + 0.1 * Math.min(2, k));
    const pts: Pt[] = [];
    const span = turns * 2 * Math.PI;
    for (let t = 0; t <= span; t += 0.12) {
      const r = rMax * (1 - 0.8 * (t / span));
      const ang = Math.PI / 2 - side * t;
      pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
    }
    spirals.push(pts);
  }
  return spirals;
}

/** Thin a polyline to points at least `min` apart (keeps the ends). */
function thin(line: Pt[], min: number): Pt[] {
  if (line.length < 3) return line;
  const out: Pt[] = [line[0]!];
  for (let i = 1; i < line.length - 1; i++) {
    const p = line[i]!;
    const q = out[out.length - 1]!;
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= min) out.push(p);
  }
  out.push(line[line.length - 1]!);
  return out;
}

export function flowPicture(o: FlowOptions): FlowPicture {
  const gamma = circulationFor(o.cl);
  const le = rot([-2 * A, 0], -o.alphaRad) as Pt;
  const te = rot([2 * A, 0], -o.alphaRad) as Pt;
  let streamlines = o.seeds.map((y) => trace(y, o, gamma));
  if (o.stalled) streamlines = streamlines.map((l) => separate(l, o, le, te));
  return {
    streamlines: streamlines.map((l) => thin(l, 0.022)),
    eddies: o.stalled ? shedEddies(o, te) : [],
    le,
    te,
  };
}

/** SVG path data for a polyline; `map` turns picture points into SVG coordinates. */
export function pathData(line: readonly Pt[], map: (p: Pt) => Pt): string {
  let d = '';
  line.forEach((p, i) => {
    const [x, y] = map(p);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(4)} ${y.toFixed(4)}`;
  });
  return d;
}
