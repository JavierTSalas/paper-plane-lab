import { describe, expect, it } from 'vitest';
import { getPlaneBuild } from '../../app/hooks';
import { PAPER_COLORS } from '../../core/paper';
import { buildTimeline } from '../fold/view';
import { flyIntro, getWrenDesign, makePlayerDesign, PLAYER_START_LAUNCH, WREN_COLOR, WREN_LAUNCH } from './flow';
import { freshProgress, PLAYER_COLORS, sanitizeProgress, STEP_IDS } from './progress';
import * as script from './script';

function allLines(): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object' && v !== null) Object.values(v).forEach(walk);
  };
  walk(Object.values(script).filter((v) => typeof v !== 'function'));
  return out;
}

describe('the Professor’s script', () => {
  it('keeps every line under 140 characters and avoids exclamation marks', () => {
    const lines = allLines();
    expect(lines.length).toBeGreaterThan(30);
    for (const l of lines) {
      expect(l.length, l).toBeLessThan(140);
      expect(l.includes('!'), l).toBe(false);
    }
  });

  it('has one line per segment of the Classic Dart tutorial, ending with why it works', () => {
    const tl = buildTimeline(getWrenDesign());
    expect(script.WATCH_FOLD.steps.length).toBe(tl.segments.length);
    expect(script.WATCH_FOLD.why).toContain('heavy nose');
  });

  it('has an encouraging line for every flat fold of the player’s dart', () => {
    const build = getPlaneBuild(makePlayerDesign('p', 'sky'));
    expect(script.YOUR_FOLD.progress.length).toBe(build.fold.frames.length);
  });

  it('compares throws kindly', () => {
    expect(script.compareLine(9, 7)).toBe(script.YOUR_THROW.beat);
    expect(script.compareLine(7.2, 7)).toBe(script.YOUR_THROW.close);
    expect(script.compareLine(3, 7)).toBe(script.YOUR_THROW.short);
  });
});

describe('the darts and throws', () => {
  it('uses real paper colours', () => {
    const ids = PAPER_COLORS.map((c) => c.id);
    expect(ids).toContain(WREN_COLOR);
    for (const c of PLAYER_COLORS) expect(ids).toContain(c);
  });

  it('folds both darts without errors', () => {
    for (const d of [getWrenDesign(), makePlayerDesign('p', 'coral')]) {
      const errors = getPlaneBuild(d).issues.filter((i) => i.severity === 'error');
      expect(errors).toEqual([]);
    }
  });

  it('gives the Professor a clean, deterministic glide that lands inside the classroom', () => {
    const { airframe } = getPlaneBuild(getWrenDesign());
    const a = flyIntro(airframe, WREN_LAUNCH);
    const b = flyIntro(airframe, WREN_LAUNCH);
    expect(a.outcome).toBe('ground');
    expect(a.diagnosis[0]?.code).toBe('clean-glide');
    expect(a.metrics.distance).toBeGreaterThan(4);
    expect(a.metrics.distance).toBe(b.metrics.distance);
  });

  it('starts the player on a throw that glides cleanly to the classroom floor, not into the far wall', () => {
    const { airframe } = getPlaneBuild(makePlayerDesign('p', 'sky'));
    const r = flyIntro(airframe, PLAYER_START_LAUNCH);
    expect(r.outcome).toBe('ground');
    expect(r.diagnosis[0]?.code).toBe('clean-glide');
    expect(r.metrics.distance).toBeGreaterThan(3);
  });
});

describe('progress', () => {
  it('falls back to a fresh record for junk', () => {
    expect(sanitizeProgress(null, 'id')).toEqual(freshProgress('id'));
    expect(sanitizeProgress({ v: 2, step: 3 }, 'id')).toEqual(freshProgress('id'));
  });

  it('keeps valid fields and clamps the rest', () => {
    const p = sanitizeProgress(
      {
        v: 1,
        step: 4,
        reached: 9,
        color: 'sky',
        foldDone: 3,
        planeId: 'mine',
        throws: [WREN_LAUNCH, { speed: 'x' }, { ...WREN_LAUNCH, speed: 99 }],
        name: 'Ada',
      },
      'id',
    );
    expect(p.step).toBe(4);
    expect(p.reached).toBe(STEP_IDS.length - 1);
    expect(p.planeId).toBe('mine');
    expect(p.throws).toHaveLength(2);
    expect(p.throws[1]!.speed).toBeLessThanOrEqual(12);
    expect(p.name).toBe('Ada');
  });

  it('never resumes a throw or graduation without a chosen paper', () => {
    expect(sanitizeProgress({ v: 1, step: 5, color: null }, 'id').step).toBe(3);
    expect(sanitizeProgress({ v: 1, step: 4, color: 'neon' }, 'id').step).toBe(3);
  });
});
