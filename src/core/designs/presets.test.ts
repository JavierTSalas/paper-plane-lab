/**
 * Every preset, on A4 and on US Letter: it folds, opens into a sound model, trims in the tunnel and flies its
 * recommended throw. Bands come from docs/research/05 and 06 (Fold'N Fly averages, documented throw and glide
 * speeds); the snapshot table at the end locks the key numbers so that later changes are deliberate.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAirframe } from '../airframe';
import { DEFAULT_ENVIRONMENT_ID, getEnvironment } from '../env';
import { buildPlane, isSymmetric, piecePolygon, SHAPE_STEP, snapPoints } from '../fold';
import { DEG, quatRotate } from '../math';
import { makePaper, PAPER_SIZES, sheetMass } from '../paper';
import { simulateFlight } from '../sim';
import { releasedAt, stillAir } from '../sim/simFixtures';
import { analyzeTrim } from '../tunnel';
import type { DiagnosisCode, FlatState, PlaneCategory, TrimAnalysis, Vec2 } from '../types';
import { airOf, buildPreset, throwAt } from './calibrate';
import type { BuiltPreset } from './calibrate';
import { getPreset, hintLaunch, makeDesign, PRESET_CATEGORIES, PRESETS, presetPaper, presetsIn } from './index';
import type { PlanePreset } from './index';

const gym = getEnvironment('gym');
const air = airOf(gym);
const TUNED_SIZES = ['a4', 'letter'] as const;

/** Built once per preset and sheet; the tests below share them. */
const cache = new Map<string, { built: BuiltPreset; trim: TrimAnalysis }>();
function plane(preset: PlanePreset, sizeId: string): { built: BuiltPreset; trim: TrimAnalysis } {
  const key = `${preset.id}@${sizeId}`;
  let entry = cache.get(key);
  if (!entry) {
    const built = buildPreset(preset, sizeId);
    entry = { built, trim: analyzeTrim(built.airframe, air) };
    cache.set(key, entry);
  }
  return entry;
}

const preset = (id: string): PlanePreset => {
  const p = getPreset(id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

function polygonMoments(poly: readonly Vec2[]): { area: number; cx: number; cy: number } {
  let twice = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const w = p[0] * q[1] - q[0] * p[1];
    twice += w;
    mx += (p[0] + q[0]) * w;
    my += (p[1] + q[1]) * w;
  }
  return { area: Math.abs(twice) / 2, cx: mx / (3 * twice), cy: my / (3 * twice) };
}

/** Centre of gravity of the flat-folded model, table frame (every layer counts). */
function flatCentre(state: FlatState): Vec2 {
  let area = 0;
  let x = 0;
  let y = 0;
  for (const piece of state.pieces) {
    const m = polygonMoments(piecePolygon(piece));
    area += m.area;
    x += m.area * m.cx;
    y += m.area * m.cy;
  }
  return [x / area, y / area];
}

const topOf = (state: FlatState): number => Math.max(...state.pieces.flatMap((p) => piecePolygon(p).map((v) => v[1])));

describe('preset library: metadata', () => {
  it('lists at least nine planes with unique ids, grouped by category', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(9);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(PRESETS.length);
    expect(PRESET_CATEGORIES).toEqual(['dart', 'hybrid', 'glider', 'wing'] satisfies PlaneCategory[]);
    expect(PRESET_CATEGORIES.flatMap((c) => presetsIn(c)).length).toBe(PRESETS.length);
    for (const id of ['classic-dart', 'wide-dart', 'bulldog-dart', 'blackburn-dart', 'harrier', 'stable', 'nakamura-lock', 'basic-glider', 'suzanne', 'sky-king', 'flying-wing']) {
      expect(getPreset(id)?.id).toBe(id);
    }
  });

  const research = readdirSync('docs/research')
    .filter((name) => name.endsWith('.md'))
    .map((name) => readFileSync(`docs/research/${name}`, 'utf8'))
    .join('\n');

  for (const p of PRESETS) {
    it(`${p.id}: honest texts, sources from the research notes, a usable throw hint`, () => {
      expect(p.blurb.length).toBeGreaterThan(20);
      expect(p.blurb.length).toBeLessThan(110);
      expect(p.blurb).not.toMatch(/\n/);
      const sentences = p.story.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
      expect(sentences.length).toBeLessThanOrEqual(4);
      expect([1, 2, 3]).toContain(p.difficulty);
      expect(p.sources.length).toBeGreaterThan(0);
      for (const url of p.sources) {
        expect(url).toMatch(/^https?:\/\//);
        expect(research).toContain(url);
      }
      // An approximation says so, and says what differs; a documented fold needs no note.
      if (p.fidelity === 'approximate') expect(p.fidelityNote?.length ?? 0).toBeGreaterThan(30);
      else expect(p.fidelityNote).toBeUndefined();
      expect(p.throwHint.speed).toBeGreaterThanOrEqual(2);
      expect(p.throwHint.speed).toBeLessThanOrEqual(11);
      expect(Math.abs(p.throwHint.pitchDeg)).toBeLessThanOrEqual(10);
      expect(p.throwHint.note.length).toBeGreaterThan(10);
      expect(['a4', 'letter', 'a5']).toContain(p.recommendedSizeId);
    });
  }

  it('names a designer only where the research notes support one, and never passes a stand-in off as the original', () => {
    expect(preset('blackburn-dart').designer).toBe('Ken Blackburn');
    expect(preset('nakamura-lock').designer).toBe('Eiji Nakamura');
    for (const id of ['classic-dart', 'wide-dart', 'bulldog-dart', 'harrier', 'stable', 'basic-glider', 'flying-wing']) {
      expect(preset(id).designer).toBeUndefined();
    }
    // The record planes' own fold sequences were not available: these two are stand-ins and say so.
    for (const id of ['suzanne', 'sky-king']) {
      const p = preset(id);
      expect(p.designer).toBeUndefined();
      expect(p.fidelity).toBe('approximate');
      expect(p.name).toMatch(/-class/);
      expect(p.fidelityNote).toMatch(/^Not /);
    }
    expect(PRESETS.every((p) => p.year === undefined)).toBe(true);
  });
});

describe('preset library: folding', () => {
  for (const p of PRESETS) {
    for (const sizeId of ['a4', 'letter', 'a5', 'legal', 'a6', 'tabloid', 'sq210']) {
      it(`${p.id} folds without issues on ${sizeId} and stays symmetric`, () => {
        const paper = makePaper({ sizeId, orientation: p.orientation });
        const { fold, model, issues, design } = buildPreset(p, sizeId);
        expect(issues).toEqual([]);
        expect(isSymmetric(fold.final)).toBe(true);
        // Paper is conserved.
        const area = fold.final.pieces.reduce((sum, piece) => sum + polygonMoments(piece.sheet).area, 0);
        expect(area).toBeCloseTo(paper.width * paper.height, 10);
        expect(flatCentre(fold.final)[0]).toBeCloseTo(paper.width / 2, 9);
        // Every step carries an instruction: a full sentence.
        for (const step of design.steps) {
          expect(step.label ?? '').toMatch(/^[A-Z].{15,}\.$/);
        }
        expect(Math.abs(design.trim.elevatorDeg)).toBeLessThanOrEqual(12);
        expect(design.trim.clip).toBeNull();
        expect(model.pieces.every((piece) => piece.verts.every((v) => v.every(Number.isFinite)))).toBe(true);
        expect(model.span).toBeGreaterThan(0.02);
        expect(model.length).toBeGreaterThan(0.04);
      });
    }
  }

  it('is deterministic and independent of colours', () => {
    for (const p of PRESETS) {
      const plain = makeDesign(p, makePaper({ sizeId: 'a4', orientation: p.orientation }));
      const again = makeDesign(p, makePaper({ sizeId: 'a4', orientation: p.orientation, front: 'coral', back: 'navy' }));
      expect(again.steps).toEqual(plain.steps);
      expect(again.shape).toEqual(plain.shape);
      expect(again.trim).toEqual(plain.trim);
      expect(plain.id).toBe(`${p.id}@a4`);
      expect(plain.presetId).toBe(p.id);
    }
  });
});

describe('fold sequences against the research notes (flat model, before shaping)', () => {
  const mm = (metres: number): number => metres * 1000;
  const noseToCentre = (id: string, sizeId: string): number => {
    const { fold } = buildPreset(preset(id), sizeId);
    return mm(topOf(fold.final) - flatCentre(fold.final)[1]);
  };

  it('dart family: centre of gravity behind the nose (doc 05 section 6, test vectors)', () => {
    // Closed form for the dart: H / 2 + 0.0761845 W² / H.
    expect(noseToCentre('classic-dart', 'letter')).toBeCloseTo(152.41, 1);
    expect(noseToCentre('classic-dart', 'a4')).toBeCloseTo(159.81, 1);
    expect(noseToCentre('wide-dart', 'a4')).toBeCloseTo(159.81, 1);
    expect(noseToCentre('blackburn-dart', 'letter')).toBeCloseTo(152.41, 1);
    expect(noseToCentre('bulldog-dart', 'letter')).toBeCloseTo(84.22, 1);
    expect(noseToCentre('bulldog-dart', 'a4')).toBeCloseTo(92.81, 1);
  });

  it('lock family: centre of gravity and the lock apex at y = H - W (doc 05 section 3.4, doc 06 section 7)', () => {
    expect(noseToCentre('harrier', 'letter')).toBeCloseTo(76.58, 1);
    expect(noseToCentre('stable', 'letter')).toBeCloseTo(76.58, 1);
    expect(noseToCentre('nakamura-lock', 'a4')).toBeCloseTo(80.42, 1);
    expect(noseToCentre('nakamura-lock', 'letter')).toBeCloseTo(77.32, 1);
    expect(noseToCentre('suzanne', 'a4')).toBeCloseTo(80.01, 1);
    for (const id of ['harrier', 'stable', 'nakamura-lock', 'sky-king']) {
      for (const sizeId of TUNED_SIZES) {
        const { fold } = buildPreset(preset(id), sizeId);
        const { width: W, height: H } = fold.final.paper;
        const apex = snapPoints(fold.final).some((q) => Math.hypot(q[0] - W / 2, q[1] - (H - W)) < 1e-6);
        expect(apex).toBe(true);
      }
    }
  });

  it('square-nose glider and flying wing (doc 06 section 7)', () => {
    expect(noseToCentre('basic-glider', 'a4')).toBeCloseTo(40.11, 1);
    expect(noseToCentre('flying-wing', 'a4')).toBeCloseTo(32.81, 1);
    const wing = buildPreset(preset('flying-wing'), 'a4');
    expect(wing.design.paper.width).toBeCloseTo(0.297, 9);
    expect(mm(wing.model.length)).toBeCloseTo(105, 1);
  });

  it('finished sizes match the derived tables (A4, wings level, keel closed)', () => {
    const flat = (id: string): BuiltPreset => buildPreset(preset(id), 'a4', { shape: { dihedralDeg: 0, keelSpreadDeg: 0 } });
    expect(mm(flat('classic-dart').model.span)).toBeCloseTo(107.1, 0);
    expect(mm(flat('classic-dart').model.length)).toBeCloseTo(311.8, 0);
    expect(mm(flat('wide-dart').model.span)).toBeCloseTo(160, 0);
    expect(mm(flat('bulldog-dart').model.span)).toBeCloseTo(148.5, 0);
    expect(mm(flat('bulldog-dart').model.length)).toBeCloseTo(222.75, 0);
    expect(mm(flat('harrier').model.span)).toBeCloseTo(113.7, 0);
    expect(mm(flat('basic-glider').model.span)).toBeCloseTo(157.5, 0);
    expect(mm(flat('basic-glider').model.length)).toBeCloseTo(139.5, 0);
  });
});

/** Diagnoses a recommended throw may end with: a clean glide, or at worst a gentle swoop. */
const MILD: DiagnosisCode[] = ['clean-glide', 'porpoise'];

/**
 * What the recommended throw should do in the gymnasium, release height 1.8 m: [min, max] distance in metres
 * and time in seconds. Sources: Fold'N Fly averages for a 10-year-old thrower (Basic Dart 12.5 m / 1.4 s,
 * Hunting Flight 10.2 m, Zip Dart 9.1 m, The Stable 5.5 m / 2.5 s; doc 05 sections 1.1, 3.1 and 4.1) and
 * the glide ratios and speeds of doc 02 section 6.1 applied to the release height. The bands are wide: the
 * averages come from search extracts and a different thrower.
 */
const BANDS: Record<string, { distance: [number, number]; airtime: [number, number] }> = {
  'classic-dart': { distance: [6.5, 14], airtime: [1.2, 2.6] },
  'wide-dart': { distance: [6, 13], airtime: [1.2, 2.6] },
  'bulldog-dart': { distance: [6.5, 13], airtime: [1.2, 2.6] },
  'blackburn-dart': { distance: [5.5, 13], airtime: [1.2, 2.6] },
  harrier: { distance: [5.5, 11], airtime: [1.3, 2.4] },
  'nakamura-lock': { distance: [6, 12], airtime: [1.8, 3.2] },
  stable: { distance: [5, 12], airtime: [2.2, 4] },
  'basic-glider': { distance: [6, 12.5], airtime: [2, 3.6] },
  suzanne: { distance: [7, 14], airtime: [2.3, 4.2] },
  'sky-king': { distance: [6, 12], airtime: [2.2, 3.8] },
  'flying-wing': { distance: [4, 11], airtime: [2.8, 5] },
};

describe('preset library: model, trim and the recommended throw', () => {
  for (const p of PRESETS) {
    for (const sizeId of TUNED_SIZES) {
      it(`${p.id} on ${sizeId}: sound model, mass of the sheet, stable trim`, () => {
        const { built, trim } = plane(p, sizeId);
        const { model, airframe, issues, design } = built;
        expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
        expect(issues.filter((i) => i.step === SHAPE_STEP)).toEqual([]);

        // The posed model: a wing on each side, mirror images of each other, standing on its keel line.
        const wings = model.panels.filter((panel) => panel.role === 'wing');
        expect(wings.map((w) => w.side).sort()).toEqual([-1, 1]);
        for (const w of wings) expect(w.normal[1]).toBeGreaterThan(0.9);
        const zs = model.pieces.flatMap((piece) => piece.verts.map((v) => v[2]));
        expect(Math.max(...zs)).toBeCloseTo(-Math.min(...zs), 9);
        const xs = model.pieces.flatMap((piece) => piece.verts.map((v) => v[0]));
        expect(Math.min(...xs)).toBeCloseTo(0, 9);
        expect(Math.max(...xs)).toBeCloseTo(model.length, 9);
        expect(model.panels.some((panel) => panel.role === 'winglet')).toBe(design.shape.wingletLine !== null);

        // Folding conserves paper.
        expect(airframe.mass).toBeCloseTo(sheetMass(design.paper), 12);
        expect(Math.abs(airframe.cg[2])).toBeLessThan(1e-9);
        expect(airframe.cgFromNose).toBeGreaterThan(0.2);
        expect(airframe.cgFromNose).toBeLessThan(0.6);

        // A stable glide well below the stall.
        expect(trim.trimmable).toBe(true);
        expect(trim.pitchStable).toBe(true);
        expect(trim.staticMarginPct).toBeGreaterThan(2);
        expect(trim.staticMarginPct).toBeLessThan(40);
        expect(trim.alphaDeg ?? 99).toBeGreaterThan(3);
        expect(trim.alphaDeg ?? 99).toBeLessThan(trim.stallAlphaDeg - 4);
        expect(trim.alphaDeg ?? 99).toBeLessThan(14);
        expect(trim.rollStable).toBe(true);
        expect(trim.cnBetaDynamic).toBeGreaterThan(0);
      });

      it(`${p.id} on ${sizeId}: the recommended throw lands cleanly inside its band`, () => {
        const { built } = plane(p, sizeId);
        const band = BANDS[p.id];
        expect(band).toBeDefined();
        if (!band) return;
        const r = simulateFlight(built.airframe, throwAt(p.throwHint.speed, p.throwHint.pitchDeg), gym, { envId: 'gym' }, 1);
        expect(r.outcome).toBe('ground');
        expect(r.diagnosis.length).toBe(1);
        expect(MILD).toContain(r.diagnosis[0]?.code);
        expect(r.metrics.distance).toBeGreaterThanOrEqual(band.distance[0]);
        expect(r.metrics.distance).toBeLessThanOrEqual(band.distance[1]);
        expect(r.metrics.airtime).toBeGreaterThanOrEqual(band.airtime[0]);
        expect(r.metrics.airtime).toBeLessThanOrEqual(band.airtime[1]);
        // It held its line.
        expect(Math.abs(r.metrics.lateral)).toBeLessThan(0.25 * r.metrics.distance);
      });
    }
  }

  // The Fly screen opens in the default place with the preset's hinted throw (still indoor air: seed 1).
  // A new player's first throw must show the plane flying, not a wall or the ceiling.
  const firstPlace = getEnvironment(DEFAULT_ENVIRONMENT_ID);
  for (const p of PRESETS) {
    it(`${p.id}: the first throw of the Fly screen (hinted throw, ${firstPlace.name}) glides to the floor`, () => {
      expect(firstPlace.id).toBe('gym');
      const design = makeDesign(p, presetPaper(p));
      const { model } = buildPlane(design);
      const r = simulateFlight(buildAirframe(model, design.trim), hintLaunch(p), firstPlace, { envId: firstPlace.id }, 1);
      expect(r.outcome).toBe('ground');
      expect(r.diagnosis.map((d) => d.code).filter((c) => !MILD.includes(c))).toEqual([]);
      // Well clear of the ceiling and the far wall.
      const room = firstPlace.bounds;
      expect(room).not.toBeNull();
      if (!room) return;
      expect(r.metrics.maxHeight).toBeLessThan(room.ceiling - 2);
      expect(r.metrics.distance).toBeLessThan(0.5 * (room.xMax - firstPlace.launch[0]));
    });

    it(`${p.id}: the hinted throw never reaches a wall or the ceiling of the ${firstPlace.name} on any sheet size`, () => {
      for (const size of PAPER_SIZES) {
        const design = makeDesign(p, presetPaper(p, { sizeId: size.id }));
        const { model } = buildPlane(design);
        const r = simulateFlight(buildAirframe(model, design.trim), hintLaunch(p), firstPlace, { envId: firstPlace.id }, 1);
        expect(`${size.id}: ${r.outcome}`).toBe(`${size.id}: ground`);
      }
    });
  }

  it('darts are the fast planes, gliders the slow floaters (docs 05 and 06 trim-speed tables)', () => {
    for (const sizeId of TUNED_SIZES) {
      const of = (category: PlaneCategory): TrimAnalysis[] => presetsIn(category).map((p) => plane(p, sizeId).trim);
      const darts = of('dart');
      const gliders = [...of('glider'), ...of('wing')];
      const speeds = (list: TrimAnalysis[]): number[] => list.map((t) => t.speed ?? NaN);
      const sinks = (list: TrimAnalysis[]): number[] => list.map((t) => t.sinkRate ?? NaN);
      // Every dart glides faster and sinks faster than every glider.
      expect(Math.min(...speeds(darts))).toBeGreaterThan(Math.max(...speeds(gliders)));
      expect(Math.min(...sinks(darts))).toBeGreaterThan(Math.max(...sinks(gliders)));
      // Dart glide: measured 4.9 m/s (Ng et al., doc 02 section 6.1); the narrow Classic Dart is a little faster.
      for (const v of speeds(darts)) {
        expect(v).toBeGreaterThan(4.5);
        expect(v).toBeLessThan(6);
      }
      // Gliders: documented trim speeds 2.4 to 4.1 m/s (doc 06 section 6), sink under 1 m/s.
      for (const v of speeds(gliders)) {
        expect(v).toBeGreaterThan(2);
        expect(v).toBeLessThan(4.5);
      }
      for (const w of sinks(gliders)) expect(w).toBeLessThan(1);
      // The hybrid sits with the darts for speed.
      for (const t of of('hybrid')) expect(t.speed ?? 0).toBeGreaterThan(4.5);
    }
  });

  it('from the same release height a glider stays up longer than a dart', () => {
    for (const sizeId of TUNED_SIZES) {
      const airtime = (p: PlanePreset): number =>
        simulateFlight(plane(p, sizeId).built.airframe, throwAt(p.throwHint.speed, p.throwHint.pitchDeg), gym, { envId: 'gym' }, 1).metrics
          .airtime;
      const darts = presetsIn('dart').map(airtime);
      const gliders = [...presetsIn('glider'), ...presetsIn('wing')].map(airtime);
      // Seconds aloft per metre of release height (1.8 m), although the darts are thrown twice as hard.
      expect(Math.min(...gliders)).toBeGreaterThan(Math.max(...darts));
    }
  });

  it('a dart takes a hard throw that makes a floater loop or stall', () => {
    const hard = throwAt(11, 5);
    const flown = (id: string) => simulateFlight(plane(preset(id), 'a4').built.airframe, hard, gym, { envId: 'gym' }, 1);
    const classic = flown('classic-dart');
    expect(classic.diagnosis.map((d) => d.code)).toEqual(['clean-glide']);
    expect(classic.metrics.distance).toBeGreaterThan(7);
    for (const id of ['stable', 'suzanne', 'nakamura-lock']) {
      const codes = flown(id).diagnosis.map((d) => d.code);
      expect(codes.some((c) => c === 'loop' || c === 'tumble' || c === 'stall-mush' || c === 'porpoise')).toBe(true);
    }
  });
});

/**
 * Key numbers of every preset on both tuned sheets:
 * [id, sheet, span mm, length mm, CG % of length from the nose, trim speed m/s, glide ratio].
 * A change here means the fold, the factory trim or the physics changed: check that it was meant.
 */
const SNAPSHOT: [string, string, number, number, number, number, number][] = [
  ['classic-dart', 'a4', 110.6, 311.5, 52.4, 5.41, 2.98],
  ['classic-dart', 'letter', 113.7, 294.7, 52.9, 5.63, 2.8],
  ['wide-dart', 'a4', 161.1, 297.0, 53.8, 4.96, 3.34],
  ['wide-dart', 'letter', 165.7, 279.4, 54.5, 5.07, 3.07],
  ['bulldog-dart', 'a4', 150.1, 222.8, 41.7, 5.13, 3.28],
  ['bulldog-dart', 'letter', 154.3, 203.1, 41.5, 5.33, 3.02],
  ['blackburn-dart', 'a4', 136.0, 297.0, 53.8, 4.79, 3.32],
  ['blackburn-dart', 'letter', 139.9, 279.4, 54.5, 4.98, 3.17],
  ['harrier', 'a4', 116.8, 182.6, 47.3, 5.07, 3.41],
  ['harrier', 'letter', 120.1, 175.6, 47.4, 5.03, 3.21],
  ['nakamura-lock', 'a4', 167.1, 170.0, 48.8, 4.2, 4.3],
  ['nakamura-lock', 'letter', 170.2, 162.6, 49.3, 4.26, 4.26],
  ['stable', 'a4', 184.8, 167.3, 48.6, 3.4, 4.13],
  ['stable', 'letter', 190.0, 146.1, 52.4, 3.31, 4.15],
  ['basic-glider', 'a4', 158.2, 139.5, 28.8, 3.84, 4.2],
  ['basic-glider', 'letter', 162.6, 117.5, 28.0, 3.88, 4.36],
  ['suzanne', 'a4', 188.5, 167.7, 48.9, 3.35, 4.51],
  ['suzanne', 'letter', 192.7, 160.0, 49.4, 3.83, 4.98],
  ['sky-king', 'a4', 161.0, 178.2, 47.1, 3.5, 3.79],
  ['sky-king', 'letter', 164.7, 165.9, 48.2, 3.61, 3.99],
  ['flying-wing', 'a4', 264.7, 105.0, 31.3, 2.32, 4.35],
  ['flying-wing', 'letter', 249.0, 108.0, 31.2, 2.49, 4.58],
];

describe('preset library: snapshot of the key numbers', () => {
  it('covers every preset on both tuned sheets', () => {
    expect(SNAPSHOT.map(([id, sizeId]) => `${id}@${sizeId}`).sort()).toEqual(
      PRESETS.flatMap((p) => TUNED_SIZES.map((sizeId) => `${p.id}@${sizeId}`)).sort(),
    );
  });

  for (const [id, sizeId, span, length, cgPct, speed, glideRatio] of SNAPSHOT) {
    it(`${id} on ${sizeId}: span, length, centre of gravity, glide speed and glide ratio`, () => {
      const { built, trim } = plane(preset(id), sizeId);
      // Geometry to half a millimetre, balance to half a percent of the length, the glide to 3 %.
      expect(Math.abs(built.model.span * 1000 - span)).toBeLessThan(0.5);
      expect(Math.abs(built.model.length * 1000 - length)).toBeLessThan(0.5);
      expect(Math.abs(built.airframe.cgFromNose * 100 - cgPct)).toBeLessThan(0.5);
      expect((trim.speed ?? NaN) / speed).toBeGreaterThan(0.97);
      expect((trim.speed ?? NaN) / speed).toBeLessThan(1.03);
      expect((trim.glideRatio ?? NaN) / glideRatio).toBeGreaterThan(0.97);
      expect((trim.glideRatio ?? NaN) / glideRatio).toBeLessThan(1.03);
    });
  }
});

describe('preset library: holding a heading', () => {
  // Released in still air from 12 m at trim speed, 5 degrees banked: a long glide shows what a 2 s throw hides.
  const tower = releasedAt(stillAir(getEnvironment('hangar')), 12);

  for (const p of PRESETS) {
    for (const sizeId of TUNED_SIZES) {
      it(`${p.id} on ${sizeId}: levels its wings and keeps its line after a banked release`, () => {
        const { built, trim } = plane(p, sizeId);
        const gamma = Math.atan(1 / (trim.glideRatio ?? 1)) / DEG;
        const launch = { speed: trim.speed ?? 4, pitchDeg: -gamma, yawDeg: 0, rollDeg: 5, aoaDeg: trim.alphaDeg ?? 0 };
        const r = simulateFlight(built.airframe, launch, tower, { envId: 'hangar' }, 1, { maxTime: 6 });
        expect(r.diagnosis.map((d) => d.code)).toEqual(['clean-glide']);
        expect(r.metrics.airtime).toBeGreaterThan(5.9);
        // Wing tilt and heading over the last second. The shallow-keeled darts and the Nakamura Lock keep a
        // slow wobble of 10 to 17 degrees on Letter paper (their keels do not weathercock); it must not grow.
        for (const s of r.samples.filter((q) => q.t >= 5)) {
          const bank = Math.asin(Math.max(-1, Math.min(1, -quatRotate(s.quat, [0, 0, 1])[1]))) / DEG;
          const heading = Math.atan2(s.vel[2], s.vel[0]) / DEG;
          expect(Math.abs(bank)).toBeLessThan(sizeId === 'a4' ? 10 : 20);
          expect(Math.abs(heading)).toBeLessThan(25);
        }
      });
    }
  }
});
