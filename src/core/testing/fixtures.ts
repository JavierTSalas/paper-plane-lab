/**
 * Hand-built PosedModel fixtures for the physics tests.
 *
 * They follow the PosedModel contract of src/core/types.ts exactly as the fold engine produces it
 * (ARCHITECTURE.md section 5.2): body frame +x nose, +y up, +z right, tail at x = 0, keel line on
 * y = 0 / z = 0, one planar panel per (role, side), panel normal = image of the flat layout's +y,
 * layers as separate overlapping pieces. They stand in for folded planes so the physics core can be
 * tested without the fold engine.
 */
import { DEG } from '../math';
import type { Air, PanelRole, Panel, PaperSpec, PosedModel, PosedPiece, TrimSpec, Vec2, Vec3 } from '../types';

/** Indoor air at 20 C: docs/research/02-flight-dynamics-validation.md header and section 9. */
export const TEST_AIR: Air = { rho: 1.204, mu: 1.813e-5 };

/** No bends, no ballast. */
export const NEUTRAL_TRIM: TrimSpec = {
  elevatorDeg: 0,
  elevatorChordFrac: 0.2,
  aileronDeg: 0,
  rudderDeg: 0,
  clip: null,
};

export const trimOf = (overrides: Partial<TrimSpec> = {}): TrimSpec => ({ ...NEUTRAL_TRIM, ...overrides });

const paperOf = (width: number, height: number, sizeId = 'fixture'): PaperSpec => ({
  sizeId,
  width,
  height,
  front: '#fdfcf8',
  back: '#8fc1e3',
});

/** A4, 80 g/m²: 4.99 g (docs/research/02 section 1.2). */
export const A4_PORTRAIT = paperOf(0.21, 0.297, 'a4');
export const A4_LANDSCAPE = paperOf(0.297, 0.21, 'a4');

/* ------------------------------------------------------------------ */
/* Flat single-panel plates                                           */
/* ------------------------------------------------------------------ */

function singlePanelModel(paper: PaperSpec, outline: Vec3[], sheet: Vec2[]): PosedModel {
  let length = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const [x, , z] of outline) {
    length = Math.max(length, x);
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }
  const panel: Panel = {
    index: 0,
    role: 'center',
    side: 0,
    origin: [0, 0, 0],
    normal: [0, 1, 0],
    stackDir: [0, 1, 0],
    pieceIds: [0],
  };
  const piece: PosedPiece = { id: 0, panel: 0, verts: outline, sheet, frontNormal: [0, 1, 0], layer: 0 };
  return {
    paper,
    angles: { keel: 0, wing: 0, winglet: 0 },
    pieces: [piece],
    panels: [panel],
    length,
    span: zMax - zMin,
    height: 0,
  };
}

/** A flat rectangular plate: one centre panel, one layer. Aspect ratio = span / chord. */
export function flatPlateModel(span: number, chord: number): PosedModel {
  const h = span / 2;
  return singlePanelModel(
    paperOf(span, chord),
    [[0, 0, -h], [0, 0, h], [chord, 0, h], [chord, 0, -h]],
    [[0, 0], [span, 0], [span, chord], [0, chord]],
  );
}

/** A flat delta, apex forward: one centre panel, one layer. Aspect ratio = 2 span / rootChord. */
export function flatDeltaModel(span: number, rootChord: number): PosedModel {
  const h = span / 2;
  return singlePanelModel(
    paperOf(span, rootChord),
    [[0, 0, -h], [0, 0, h], [rootChord, 0, 0]],
    [[0, 0], [span, 0], [h, rootChord]],
  );
}

/** Rectangular plate of the given aspect ratio with the area of an A4 sheet (0.06237 m²). */
export function a4AreaPlate(aspectRatio: number): PosedModel {
  const area = A4_PORTRAIT.width * A4_PORTRAIT.height;
  const span = Math.sqrt(area * aspectRatio);
  return flatPlateModel(span, area / span);
}

/* ------------------------------------------------------------------ */
/* Folded planes: keel + wings (+ winglets) from a flat half layout   */
/* ------------------------------------------------------------------ */

/** A layer of paper in the flat-folded half layout: convex polygon of (lateral distance from the centreline, x from the tail). */
export interface HalfLayer {
  outline: Vec2[];
  /** True when the back of the sheet faces the viewer (a folded-over flap). */
  flipped?: boolean;
}

export interface FoldedFixtureSpec {
  paper: PaperSpec;
  /** Layers of the RIGHT half; the left half is the mirror image. Lower index = lower in the stack. */
  layers: HalfLayer[];
  /** Lateral distance of the wing line from the centreline = fuselage wall height. 0 = no fuselage. */
  keelDepth: number;
  /** Angle between the two fuselage walls, degrees. 0 = pressed together. */
  keelSpreadDeg?: number;
  /** Wing angle above the horizontal, degrees. */
  dihedralDeg?: number;
  /** Lateral distance of the winglet line from the centreline, or null. */
  wingletAt?: number | null;
  /** Winglet angle from the wing plane, degrees, positive up. */
  wingletDeg?: number;
}

/** Part of a convex polygon with lo <= lateral <= hi (Sutherland-Hodgman against two parallel lines). */
function clipLateral(poly: readonly Vec2[], lo: number, hi: number): Vec2[] {
  const clipHalf = (input: readonly Vec2[], bound: number, keepBelow: boolean): Vec2[] => {
    const out: Vec2[] = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i];
      const b = input[(i + 1) % input.length];
      const da = keepBelow ? bound - a[0] : a[0] - bound;
      const db = keepBelow ? bound - b[0] : b[0] - bound;
      if (da >= 0) out.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const t = da / (da - db);
        out.push([bound, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  return clipHalf(clipHalf(poly, lo, false), hi, true);
}

function polygonArea2(poly: readonly Vec2[]): number {
  let twice = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    twice += a[0] * b[1] - a[1] * b[0];
  }
  return Math.abs(twice) / 2;
}

/**
 * Open a flat half layout into a 3D plane the way `poseModel` does: fuselage wall from the keel line up to
 * the wing line, wing outboard of it, optional winglet beyond the winglet line. Valley keel (stackDir = normal).
 */
export function foldedModel(spec: FoldedFixtureSpec): PosedModel {
  const d = spec.keelDepth;
  const halfSpread = ((spec.keelSpreadDeg ?? 0) / 2) * DEG;
  const dihedral = (spec.dihedralDeg ?? 0) * DEG;
  const wingletAt = spec.wingletAt ?? null;
  const wingletAngle = dihedral + (spec.wingletDeg ?? 0) * DEG;
  let reach = 0;
  for (const layer of spec.layers) for (const p of layer.outline) reach = Math.max(reach, p[0]);
  const wingEnd = wingletAt ?? reach;

  // (y, z) of a point at lateral distance l in each band of the right half, and the band's normal.
  const wallY = Math.cos(halfSpread);
  const wallZ = Math.sin(halfSpread);
  const rootY = d * wallY;
  const rootZ = d * wallZ;
  const tipY = rootY + (wingEnd - d) * Math.sin(dihedral);
  const tipZ = rootZ + (wingEnd - d) * Math.cos(dihedral);
  const bands: { role: PanelRole; lo: number; hi: number; at: (l: number) => [number, number]; normal: [number, number]; hinge: [number, number] }[] = [
    { role: 'fuselage', lo: 0, hi: d, at: (l) => [l * wallY, l * wallZ], normal: [wallZ, -wallY], hinge: [0, 0] },
    {
      role: 'wing',
      lo: d,
      hi: wingEnd,
      at: (l) => [rootY + (l - d) * Math.sin(dihedral), rootZ + (l - d) * Math.cos(dihedral)],
      normal: [Math.cos(dihedral), -Math.sin(dihedral)],
      hinge: [rootY, rootZ],
    },
    {
      role: 'winglet',
      lo: wingEnd,
      hi: Infinity,
      at: (l) => [tipY + (l - wingEnd) * Math.sin(wingletAngle), tipZ + (l - wingEnd) * Math.cos(wingletAngle)],
      normal: [Math.cos(wingletAngle), -Math.sin(wingletAngle)],
      hinge: [tipY, tipZ],
    },
  ];

  const panels: Panel[] = [];
  const pieces: PosedPiece[] = [];
  const cx = spec.paper.width / 2;
  // Fixed panel order of the fold engine: role by role, right before left.
  for (const band of bands) {
    if (band.hi <= band.lo) continue;
    for (const side of [1, -1] as const) {
      const pieceIds: number[] = [];
      const normal: Vec3 = [0, band.normal[0], side * band.normal[1]];
      spec.layers.forEach((layer, layerIndex) => {
        const part = clipLateral(layer.outline, band.lo, band.hi);
        if (part.length < 3 || polygonArea2(part) < 1e-12) return;
        const id = pieces.length;
        pieceIds.push(id);
        pieces.push({
          id,
          panel: panels.length,
          verts: part.map(([l, x]): Vec3 => {
            const [y, z] = band.at(l);
            return [x, y, side * z];
          }),
          sheet: part.map(([l, x]): Vec2 => [cx + side * l, x]),
          frontNormal: layer.flipped ? [-normal[0], -normal[1], -normal[2]] : normal,
          layer: layerIndex,
        });
      });
      if (pieceIds.length === 0) continue;
      panels.push({
        index: panels.length,
        role: band.role,
        side,
        origin: [0, band.hinge[0], side * band.hinge[1]],
        normal,
        stackDir: normal,
        pieceIds,
      });
    }
  }

  let length = 0;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMax = 0;
  for (const piece of pieces) {
    for (const [x, y, z] of piece.verts) {
      length = Math.max(length, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      zMax = Math.max(zMax, Math.abs(z));
    }
  }
  const keel = d > 0 ? Math.PI / 2 - halfSpread : 0;
  return {
    paper: spec.paper,
    angles: { keel, wing: keel - dihedral, winglet: (spec.wingletDeg ?? 0) * DEG },
    pieces,
    panels,
    length,
    span: 2 * zMax,
    height: yMax - yMin,
  };
}

/**
 * A rectangular wing with a short keel fin under part of its chord. `finFrom` / `finTo` are the x range of the
 * fin (from the tail). An aerodynamic test object, not a foldable plane.
 */
export function finnedPlateModel(span: number, chord: number, finDepth: number, finFrom: number, finTo: number): PosedModel {
  const h = span / 2;
  return foldedModel({
    paper: paperOf(span, chord),
    layers: [
      { outline: [[finDepth, 0], [h + finDepth, 0], [h + finDepth, chord], [finDepth, chord]] },
      { outline: [[0, finFrom], [finDepth, finFrom], [finDepth, finTo], [0, finTo]] },
    ],
    keelDepth: finDepth,
  });
}

/** Two rectangular wing halves meeting on the centreline with dihedral, no fuselage. */
export function dihedralPlateModel(span: number, chord: number, dihedralDeg: number): PosedModel {
  const h = span / 2;
  return foldedModel({
    paper: paperOf(span, chord),
    layers: [{ outline: [[0, 0], [h, 0], [h, chord], [0, chord]] }],
    keelDepth: 0,
    dihedralDeg,
  });
}

/* ------------------------------------------------------------------ */
/* Fixture dart                                                       */
/* ------------------------------------------------------------------ */

export interface DartFixtureOptions {
  keelSpreadDeg?: number;
  dihedralDeg?: number;
  /** Fuselage wall height, metres. */
  keelDepth?: number;
  /**
   * Where the folded-over paper sits.
   *  'classic'  the true layer stack of the classic dart (corners to the centre, slanted edges to the centre):
   *             everything piles up toward the nose.
   *  'spread'   the same amount of paper folded in along the whole length of the wing root, which keeps the
   *             centre of gravity only a little ahead of the neutral point.
   */
  layering?: 'classic' | 'spread';
}

/**
 * A4 dart. The outline is the classic dart's: swept leading edges at 22.5 degrees to the centreline from a
 * pointed nose, full sheet width over the last 43.5 mm. All paper of the A4 sheet is accounted for.
 */
export function dartFixture(options: DartFixtureOptions = {}): PosedModel {
  const paper = A4_PORTRAIT;
  const half = paper.width / 2;
  const L = paper.height;
  // The second fold line of the classic dart leaves the side edge here.
  const shoulder = L - half * (1 + Math.SQRT2);
  const outline: Vec2[] = [[0, 0], [half, 0], [half, shoulder], [0, L]];
  const layering = options.layering ?? 'spread';
  let extra: HalfLayer[];
  if (layering === 'classic') {
    // After the corner fold: the corner lies on the triangle under the slanted edge.
    // After the edge fold: the part of it outside the second fold line swings in with the flap.
    const cornerFoot = L - half; // where the slanted edge of the first fold meets the side edge
    const onCrease = L - half * Math.SQRT2; // where that point lands on the centre crease
    const split = half * (Math.SQRT2 - 1); // lateral distance of the second fold line at x = cornerFoot
    extra = [
      { outline: [[0, L], [0, cornerFoot], [split, cornerFoot]], flipped: true },
      { outline: [[0, L], [half, shoulder], [0, onCrease]], flipped: true },
      { outline: [[0, L], [split, cornerFoot], [0, onCrease]] },
    ];
  } else {
    // Same paper area as the classic flaps, folded in as a band along the root over the whole length.
    const extraArea = (paper.width * L) / 2 - polygonArea2(outline);
    const bandLength = L * 0.86;
    const bandWidth = extraArea / (2 * bandLength);
    const band: Vec2[] = [[0, 0], [bandWidth, 0], [bandWidth, bandLength], [0, bandLength]];
    extra = [{ outline: band, flipped: true }, { outline: band }];
  }
  return foldedModel({
    paper,
    layers: [{ outline }, ...extra],
    keelDepth: options.keelDepth ?? 0.025,
    keelSpreadDeg: options.keelSpreadDeg ?? 0,
    dihedralDeg: options.dihedralDeg ?? 0,
  });
}

/**
 * Trim the fixture dart glides with: a slight up-bend of the last tenth of the chord. A flat plate needs
 * reflex as soon as its centre of gravity is ahead of the neutral point (here by about 5 % of the MAC).
 */
export const DART_TRIM: TrimSpec = { ...NEUTRAL_TRIM, elevatorDeg: 1, elevatorChordFrac: 0.1 };

/* ------------------------------------------------------------------ */
/* Fixture glider                                                     */
/* ------------------------------------------------------------------ */

export interface GliderFixtureOptions {
  keelSpreadDeg?: number;
  dihedralDeg?: number;
  keelDepth?: number;
  /** Chord of the finished wing, metres. The rest of the sheet is folded into the leading-edge band. */
  chord?: number;
  /** Number of extra layers in the leading-edge ballast band. */
  bandLayers?: number;
  wingletAt?: number | null;
  wingletDeg?: number;
}

/**
 * A4 landscape glider: rectangular wing of aspect ratio about 3 with a short keel; the front of the sheet is
 * folded over on itself several times into a leading-edge ballast band. All paper is accounted for.
 */
export function gliderFixture(options: GliderFixtureOptions = {}): PosedModel {
  const paper = A4_LANDSCAPE;
  const half = paper.width / 2;
  const chord = options.chord ?? 0.09;
  const bandLayers = options.bandLayers ?? 6;
  const bandDepth = (paper.height - chord) / bandLayers;
  const base: Vec2[] = [[0, 0], [half, 0], [half, chord], [0, chord]];
  const band: Vec2[] = [[0, chord - bandDepth], [half, chord - bandDepth], [half, chord], [0, chord]];
  const layers: HalfLayer[] = [{ outline: base }];
  for (let i = 0; i < bandLayers; i++) layers.push({ outline: band, flipped: i % 2 === 0 });
  return foldedModel({
    paper,
    layers,
    keelDepth: options.keelDepth ?? 0.015,
    keelSpreadDeg: options.keelSpreadDeg ?? 0,
    dihedralDeg: options.dihedralDeg ?? 0,
    wingletAt: options.wingletAt ?? null,
    wingletDeg: options.wingletDeg ?? 0,
  });
}

/** The fixture glider needs no bend: its centre of pressure travels aft with incidence and meets the centre of gravity. */
export const GLIDER_TRIM: TrimSpec = NEUTRAL_TRIM;
