/**
 * Calibration table of the preset library. Run it on its own to read the numbers:
 *
 *   npx vitest run src/core/designs/calibration
 *
 * One row per preset on its recommended sheet: geometry, tunnel trim, and the best throws found by a coarse
 * search at 6, 10 and 27 m/s in the Record Hangar. Evidence to compare with (docs/research/02 section 6):
 *  - dart glide (Ng et al.): V 4.9 m/s, L/D about 5, sink about 1.0 m/s;
 *  - Fold'N Fly averages (10-year-old thrower): Basic Dart 12.5 m / 1.4 s, The Stable 5.5 m / 2.5 s;
 *  - records: 60 to 100 m at 25 to 30 m/s for the best darts, 20 to 32 s aloft for the best gliders thrown
 *    near-vertically at about 27 m/s.
 * The assertions are loose sanity bounds; the tight ones live in presets.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { getEnvironment } from '../env';
import { airOf, measurePreset, searchThrow } from './calibrate';
import type { ThrowSearch } from './calibrate';
import { PRESETS } from './index';

const hangar = getEnvironment('hangar');
const air = airOf(hangar);

/** Launch angles of the coarse searches, degrees above the horizon. */
const PITCH_CASUAL = [0, 10, 20];
const PITCH_FIRM = [5, 15, 30];
const PITCH_ELITE = [10, 20, 35, 50, 80];

const f = (x: number | null, digits = 1): string => (x === null ? '-' : x.toFixed(digits));
const pad = (text: string, width: number): string => text.padEnd(width);

const throwCell = (s: ThrowSearch, elevator = false): string => {
  const d = s.bestDistance;
  const a = s.bestAirtime;
  const trim = (o: typeof d): string => (elevator ? `/e${f(o.elevatorDeg, 1)}` : '');
  return `${f(d.distance)}m@${d.pitchDeg}${trim(d)} ${f(a.airtime)}s@${a.pitchDeg}${trim(a)}`;
};

describe('calibration table', () => {
  it('prints geometry, trim and best throws of every preset', () => {
    const lines: string[] = [];
    const checks: (() => void)[] = [];
    const header = [
      pad('preset', 15), pad('sheet', 7), pad('m g', 5), pad('span', 6), pad('len', 6), pad('AR', 5), pad('CG%', 5), pad('SM%', 5),
      pad('alpha', 6), pad('V', 5), pad('L/D', 5), pad('sink', 5), pad('6 m/s: far, long', 21), pad('10 m/s: far, long', 22),
      '27 m/s: far, long (pitch / elevator)',
    ].join(' ');
    lines.push(header);
    for (const preset of PRESETS) {
      const sizeId = preset.recommendedSizeId;
      const n = measurePreset(preset, sizeId, air);
      const t = n.trim;
      const base = searchThrow(preset, sizeId, hangar, 6, PITCH_CASUAL);
      const firm = searchThrow(preset, sizeId, hangar, 10, PITCH_FIRM);
      // A record throw is made with the trailing edge flattened: search from no elevator up to the factory
      // setting, with one extra step close to flat (half a degree is 0.1 to 0.2 mm of bend).
      const factory = base.bestDistance.elevatorDeg;
      const nearFlat = Math.sign(factory) * Math.min(0.5, Math.abs(factory));
      const elevators = [...new Set([0, nearFlat, factory / 2, factory])];
      const elite = searchThrow(preset, sizeId, hangar, 27, PITCH_ELITE, elevators);
      lines.push(
        [
          pad(preset.id, 15), pad(sizeId, 7), pad(f(n.massG, 2), 5), pad(f(n.spanMm, 0), 6), pad(f(n.lengthMm, 0), 6),
          pad(f(n.aspectRatio, 2), 5), pad(f(n.cgPct), 5), pad(f(t.staticMarginPct), 5), pad(f(t.alphaDeg), 6), pad(f(t.speed, 2), 5),
          pad(f(t.glideRatio, 2), 5), pad(f(t.sinkRate, 2), 5), pad(throwCell(base), 21), pad(throwCell(firm), 22), throwCell(elite, true),
        ].join(' '),
      );

      checks.push(() => {
        expect(t.trimmable).toBe(true);
        expect(elite.bestDistance.distance).toBeLessThan(110);
        expect(elite.bestAirtime.airtime).toBeLessThan(40);
      });
    }

    lines.push('');
    lines.push('Tunnel numbers on the other tuned sheet:');
    lines.push([pad('preset', 15), pad('sheet', 7), pad('span', 6), pad('len', 6), pad('AR', 5), pad('CG%', 5), pad('SM%', 5), pad('alpha', 6), pad('V', 5), pad('L/D', 5), 'sink'].join(' '));
    for (const preset of PRESETS) {
      const sizeId = preset.recommendedSizeId === 'letter' ? 'a4' : 'letter';
      const n = measurePreset(preset, sizeId, air);
      const t = n.trim;
      lines.push(
        [
          pad(preset.id, 15), pad(sizeId, 7), pad(f(n.spanMm, 0), 6), pad(f(n.lengthMm, 0), 6), pad(f(n.aspectRatio, 2), 5), pad(f(n.cgPct), 5),
          pad(f(t.staticMarginPct), 5), pad(f(t.alphaDeg), 6), pad(f(t.speed, 2), 5), pad(f(t.glideRatio, 2), 5), f(t.sinkRate, 2),
        ].join(' '),
      );
      checks.push(() => expect(t.trimmable).toBe(true));
    }
    console.log(`\n${lines.join('\n')}\n`);
    for (const check of checks) check();
  });
});
