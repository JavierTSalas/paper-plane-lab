import { describe, expect, it } from 'vitest';
import type { Fingerprint, PosedModel, Vec3 } from '../types';
import {
  FINGERPRINT_GRID,
  describeMatch,
  fingerprint,
  geometryHash,
  quantise,
  rankSimilar,
  similarity,
  topViewGrid,
} from './index';
import {
  A4,
  A5,
  buildFixture,
  dartWithNoseLayerSpec,
  deltaDartSpec,
  gliderSpec,
  mirrorSpec,
  reorderModel,
  rotateVertices,
  stripGliderSpec,
  type FixtureSpec,
} from './fixtures.testutil';

const fp = (spec: FixtureSpec): Fingerprint => {
  const f = buildFixture(spec);
  return fingerprint(f.model, f.airframe);
};

const flatModel = (polys: Vec3[][]): PosedModel => buildFixture({ paper: A4, outline: polys, extra: [] }).model;
const sum = (g: readonly number[]): number => g.reduce((s, x) => s + x, 0);
const N = FINGERPRINT_GRID;

describe('topViewGrid raster', () => {
  it('rectangle covers the analytic number of cells', () => {
    // 0.2 m x 0.1 m: grid extent 0.2 m, cell 0.2/24 m; area / cell area = 288 cells.
    const g = topViewGrid(
      flatModel([
        [
          [0, 0, -0.05],
          [0.2, 0, -0.05],
          [0.2, 0, 0.05],
          [0, 0, 0.05],
        ],
      ]),
    );
    expect(g.length).toBe(N * N);
    expect(Math.abs(sum(g) - 288)).toBeLessThanOrEqual(1);
    expect(Math.max(...g)).toBe(1);
    // Centred across the span: columns 6..17 filled, rows all filled.
    expect(g[0 * N + 5]).toBe(0);
    expect(g[0 * N + 6]).toBe(1);
    expect(g[23 * N + 17]).toBe(1);
    expect(g[23 * N + 18]).toBe(0);
  });

  it('triangle covers the analytic number of cells, nose at the high rows', () => {
    // Base 0.1 m at the tail, apex at the nose: area 0.01 m² = 144 cells.
    const g = topViewGrid(
      flatModel([
        [
          [0, 0, -0.05],
          [0.2, 0, 0],
          [0, 0, 0.05],
        ],
      ]),
    );
    expect(Math.abs(sum(g) - 144)).toBeLessThanOrEqual(1);
    const rowSum = (i: number): number => sum(g.slice(i * N, i * N + N));
    expect(rowSum(0)).toBeGreaterThan(rowSum(23) * 5);
  });

  it('pieces sharing an edge through sample points do not double count (top-left rule)', () => {
    // Scale chosen so sample centres land exactly on the split line (extent 72 -> 1 sample per metre).
    const whole = topViewGrid(
      flatModel([
        [
          [0, 0, 0],
          [72, 0, 0],
          [72, 0, 36],
          [0, 0, 36],
        ],
      ]),
    );
    const split = topViewGrid(
      flatModel([
        [
          [0, 0, 0],
          [36.5, 0, 0],
          [36.5, 0, 36],
          [0, 0, 36],
        ],
        [
          [36.5, 0, 0],
          [72, 0, 0],
          [72, 0, 36],
          [36.5, 0, 36],
        ],
      ]),
    );
    expect(split).toEqual(whole);
  });

  it('weights cells by layer count and skips vertical walls', () => {
    const g = topViewGrid(
      flatModel([
        [
          [0, 0, -0.05],
          [0.2, 0, -0.05],
          [0.2, 0, 0.05],
          [0, 0, 0.05],
        ],
        [
          [0.1, 0, -0.05],
          [0.2, 0, -0.05],
          [0.2, 0, 0.05],
          [0.1, 0, 0.05],
        ],
        // A vertical wall must not add anything.
        [
          [0, 0, 0],
          [0.2, 0, 0],
          [0.2, 0.03, 0],
          [0, 0.03, 0],
        ],
      ]),
    );
    expect(g[2 * N + 10]).toBeCloseTo(0.5, 12);
    expect(g[20 * N + 10]).toBeCloseTo(1, 12);
    expect(Math.abs(sum(g) - 288 * 0.75)).toBeLessThanOrEqual(1);
  });
});

describe('fingerprint features', () => {
  it('follows the Fingerprint contract', () => {
    const f = buildFixture(deltaDartSpec());
    const p = fingerprint(f.model, f.airframe);
    expect(p.aspectRatio).toBeCloseTo(f.airframe.ref.aspectRatio, 12);
    expect(p.cgFromNose).toBeCloseTo(f.airframe.cgFromNose, 12);
    expect(p.areaRatio).toBeCloseTo(f.airframe.ref.area / (A4.width * A4.height), 12);
    expect(p.keelDepthRatio).toBeCloseTo(0.03 / 0.2, 12);
    expect(p.slenderness).toBeCloseTo(0.13 / 0.2, 12);
  });
});

describe('similarity', () => {
  const dart = fp(deltaDartSpec());
  const glider = fp(gliderSpec());
  const noseDart = fp(dartWithNoseLayerSpec());

  it('is 1 for identical fingerprints and symmetric', () => {
    expect(similarity(dart, dart)).toBe(1);
    expect(similarity(glider, glider)).toBe(1);
    expect(similarity(dart, glider)).toBe(similarity(glider, dart));
    expect(similarity(dart, noseDart)).toBe(similarity(noseDart, dart));
  });

  it('scores a uniformly scaled copy (A4 vs A5) above 0.97', () => {
    const k = A5.width / A4.width;
    expect(similarity(dart, fp(deltaDartSpec(A5, k)))).toBeGreaterThan(0.97);
    expect(similarity(glider, fp(gliderSpec(A5, k)))).toBeGreaterThan(0.97);
  });

  it('is unchanged by a left-right mirror of a symmetric plane', () => {
    expect(similarity(dart, fp(mirrorSpec(deltaDartSpec())))).toBeGreaterThan(0.999);
  });

  it('scores a dart against a wide glider below 0.6', () => {
    const s = similarity(dart, glider);
    expect(s).toBeLessThan(0.6);
    expect(describeMatch(s)).toBe('different');
  });

  it('tells the layered-nose variant apart from the plain dart, but keeps it close', () => {
    expect(noseDart.grid).not.toEqual(dart.grid);
    const s = similarity(dart, noseDart);
    expect(s).toBeLessThan(0.99);
    expect(s).toBeGreaterThan(0.9);
    expect(describeMatch(s)).toBe('near-identical');
    expect(s).toBeGreaterThan(similarity(noseDart, glider));
  });

  it('ranks candidates by score, deterministic and limited', () => {
    const candidates = [
      { id: 'glider', name: 'Glider', fingerprint: glider },
      { id: 'nose', name: 'Nose dart', fingerprint: noseDart },
      { id: 'dart', name: 'Dart', fingerprint: dart },
      { id: 'dart2', name: 'Dart copy', fingerprint: dart },
    ];
    const r = rankSimilar(dart, candidates);
    expect(r.map((m) => m.id)).toEqual(['dart', 'dart2', 'nose', 'glider']);
    expect(r[0].score).toBe(1);
    expect(rankSimilar(dart, candidates, 2)).toHaveLength(2);
    expect(rankSimilar(dart, candidates, 0)).toEqual([]);
  });

  it('describes scores with the documented thresholds', () => {
    expect(describeMatch(1)).toBe('identical');
    expect(describeMatch(0.94)).toBe('near-identical');
    expect(describeMatch(0.85)).toBe('similar');
    expect(describeMatch(0.65)).toBe('related');
    expect(describeMatch(0.3)).toBe('different');
  });
});

describe('geometryHash', () => {
  const dart = buildFixture(deltaDartSpec()).model;

  it('is 16 hex characters and deterministic', () => {
    const h = geometryHash(dart);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(geometryHash(buildFixture(deltaDartSpec()).model)).toBe(h);
  });

  it('ignores piece order, ids, layers and colours', () => {
    expect(geometryHash(reorderModel(dart))).toBe(geometryHash(dart));
  });

  it('ignores the start vertex of each polygon', () => {
    expect(geometryHash(rotateVertices(dart, 1))).toBe(geometryHash(dart));
    expect(geometryHash(rotateVertices(dart, 2))).toBe(geometryHash(dart));
  });

  it('ignores float noise far below 0.1 mm', () => {
    const noisy: PosedModel = {
      ...dart,
      pieces: dart.pieces.map((p) => ({
        ...p,
        verts: p.verts.map((v): Vec3 => [v[0] + 3e-12, v[1] - 2e-12, v[2] + 1e-12]),
      })),
    };
    expect(geometryHash(noisy)).toBe(geometryHash(dart));
  });

  it('changes when one vertex moves by 1 mm', () => {
    const moved: PosedModel = {
      ...dart,
      pieces: dart.pieces.map((p, i) =>
        i === 0 ? { ...p, verts: p.verts.map((v, k): Vec3 => (k === 1 ? [v[0], v[1], v[2] + 0.001] : v)) } : p,
      ),
    };
    expect(geometryHash(moved)).not.toBe(geometryHash(dart));
  });

  it('distinguishes different planes and the layered nose', () => {
    expect(geometryHash(buildFixture(gliderSpec()).model)).not.toBe(geometryHash(dart));
    expect(geometryHash(buildFixture(dartWithNoseLayerSpec()).model)).not.toBe(geometryHash(dart));
  });
});

describe('quantise', () => {
  it('rounds to 0.1 mm, half away from zero, stable at exact decimal boundaries', () => {
    expect(quantise(0.02625)).toBe(263); // A4 width / 8 = 26.25 mm, an exact 0.05 mm boundary
    expect(quantise(0.21 / 8)).toBe(263); // the same value computed in floating point
    expect(quantise(-0.21 / 8)).toBe(-263);
    expect(quantise(0.02625 - 1e-15)).toBe(263);
    expect(quantise(0.02625 + 1e-15)).toBe(263);
    expect(quantise(0.0262)).toBe(262);
    expect(quantise(-1e-12)).toBe(0);
    expect(Object.is(quantise(-1e-12), -0)).toBe(false);
  });
});

describe('performance', () => {
  it('fingerprints a 60-piece model in under 5 ms', () => {
    const f = buildFixture(stripGliderSpec(15));
    expect(f.model.pieces.length).toBe(60);
    for (let i = 0; i < 5; i++) fingerprint(f.model, f.airframe); // warm up the JIT
    const runs = 20;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) fingerprint(f.model, f.airframe);
    const perRun = (performance.now() - t0) / runs;
    expect(perRun).toBeLessThan(5);
  });
});
