import { beforeAll, describe, expect, it } from 'vitest';
import { makeDesign, PRESETS, presetPaper } from '../designs';
import type { FlightTicket, PlaneDesign, RankEntry } from '../types';
import {
  ARENAS, buildTicketResult, clearHouseCache, formatScore, getArena, groupByDesign, HOUSE_PLAYER, houseEntries, LocalLeaderboard,
  parseTicket, scoreOf, verifyTicket,
} from './index';
import type { KeyValueStorage, SubmitEntry } from './index';

const classic = getArena('classic')!;
const open = getArena('open')!;

function presetDesign(): PlaneDesign {
  const p = PRESETS[0]!;
  return makeDesign(p, presetPaper(p));
}

function honestTicket(): FlightTicket {
  return {
    design: presetDesign(),
    launch: { speed: 9, pitchDeg: 5, yawDeg: 0, rollDeg: 0, aoaDeg: 0 },
    conditions: { envId: 'hangar' },
    seed: 7,
  };
}

class MemStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

describe('arenas and scores', () => {
  it('has two hangar arenas with the published speed caps', () => {
    expect(ARENAS.map((a) => [a.id, a.envId, a.maxThrowSpeed])).toEqual([
      ['open', 'hangar', 27],
      ['classic', 'hangar', 10],
    ]);
    for (const a of ARENAS) expect(a.blurb.length).toBeGreaterThan(20);
  });

  it('formats scores', () => {
    expect(formatScore('distance', 12.345)).toBe('12.35 m');
    expect(formatScore('airtime', 3.4)).toBe('3.40 s');
    expect(formatScore('distance', 3.048, 'imperial')).toBe('10.0 ft');
  });
});

describe('verifyTicket', () => {
  let ticket: FlightTicket;
  let distance: number;

  beforeAll(() => {
    ticket = honestTicket();
    const flight = buildTicketResult(ticket);
    distance = scoreOf('distance', flight.result.metrics);
    expect(flight.geometryHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('accepts an honest ticket and returns the server score', () => {
    const v = verifyTicket(ticket, 'distance', classic, distance);
    expect(v.reasons).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.score).toBe(distance);
    expect(distance).toBeGreaterThan(1);
  });

  it('accepts a claim within tolerance and rejects a tampered score', () => {
    expect(verifyTicket(ticket, 'distance', classic, distance + 0.015).ok).toBe(true);
    const v = verifyTicket(ticket, 'distance', classic, distance * 1.1 + 0.1);
    expect(v.ok).toBe(false);
    expect(v.score).toBe(distance);
    expect(v.reasons.join()).toMatch(/does not match/);
  });

  it('rejects an over-speed throw for the arena', () => {
    const fast = { ...ticket, launch: { ...ticket.launch, speed: 12 } };
    const v = verifyTicket(fast, 'distance', classic, 10);
    expect(v.ok).toBe(false);
    expect(v.score).toBeNull();
    expect(v.reasons.join()).toMatch(/throw speed/);
    // The same throw is legal in the open arena.
    expect(verifyTicket(fast, 'distance', open, 0).reasons.join()).not.toMatch(/throw speed/);
  });

  it('rejects the wrong environment and changed conditions', () => {
    expect(verifyTicket({ ...ticket, conditions: { envId: 'meadow' } }, 'distance', classic, distance).reasons.join()).toMatch(/hangar/);
    expect(verifyTicket({ ...ticket, conditions: { envId: 'hangar', windSpeed: 3 } }, 'distance', classic, distance).ok).toBe(false);
  });

  it('rejects an oversized payload and too many steps', () => {
    const steps = Array.from({ length: 70 }, () => ({ kind: 'flip' as const, label: 'x'.repeat(190) }));
    const big = { ...ticket, design: { ...ticket.design, steps } };
    const v = verifyTicket(big, 'distance', classic, distance);
    expect(v.ok).toBe(false);
    expect(v.reasons.join()).toMatch(/too large/);
    expect(v.reasons.join()).toMatch(/too many fold steps/);
  });

  it('rejects a clip, odd paper and bad trim', () => {
    const d = ticket.design;
    const clip = { ...ticket, design: { ...d, trim: { ...d.trim, clip: { mass: 0.0005, x: 0.2 } } } };
    expect(verifyTicket(clip, 'distance', classic, distance).reasons.join()).toMatch(/clip/);
    const paper = { ...ticket, design: { ...d, paper: { ...d.paper, width: d.paper.width * 1.5 } } };
    expect(verifyTicket(paper, 'distance', classic, distance).reasons.join()).toMatch(/sheet/);
    const trim = { ...ticket, design: { ...d, trim: { ...d.trim, elevatorDeg: 80 } } };
    expect(verifyTicket(trim, 'distance', classic, distance).reasons.join()).toMatch(/elevator/);
  });
});

describe('parseTicket', () => {
  it('round-trips an honest ticket and drops unknown fields', () => {
    const t = honestTicket();
    const parsed = parseTicket(JSON.parse(JSON.stringify({ ...t, extra: 1, design: { ...t.design, junk: 'x' } })));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(JSON.parse(JSON.stringify(t)));
  });

  it('rejects malformed tickets with reasons', () => {
    const bad = parseTicket({ design: { v: 2, steps: 'no' }, launch: { speed: 'fast' }, conditions: {}, seed: -1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reasons.length).toBeGreaterThan(3);
    expect(parseTicket(null).ok).toBe(false);
  });
});

function entry(over: Partial<SubmitEntry> & { score: number }): SubmitEntry {
  return {
    category: 'distance',
    arenaId: 'classic',
    player: 'Ada',
    planeName: 'Dart',
    designHash: 'aaaaaaaaaaaaaaaa',
    paperSizeId: 'a4',
    ticket: honestTicket(),
    ...over,
  };
}

describe('LocalLeaderboard', () => {
  it('sorts, keeps the best per player and design, filters and limits', async () => {
    let t = 0;
    const lb = new LocalLeaderboard({ storage: new MemStorage(), now: () => new Date(Date.UTC(2026, 10, 10, 0, 0, t++)) });
    await lb.submit(entry({ score: 5 }));
    await lb.submit(entry({ score: 7 }));
    await lb.submit(entry({ score: 6, player: 'ada ' }));
    await lb.submit(entry({ score: 4, designHash: 'bbbbbbbbbbbbbbbb' }));
    await lb.submit(entry({ score: 9, player: 'Grace' }));
    await lb.submit(entry({ score: 8, player: 'Linus' }));
    await lb.submit(entry({ score: 8, player: 'Ken' }));
    await lb.submit(entry({ score: 99, category: 'airtime' }));

    const top = await lb.top({ category: 'distance', arenaId: 'classic' });
    expect(top.map((e) => [e.player, e.score])).toEqual([
      ['Grace', 9],
      ['Linus', 8], // earlier than Ken at the same score
      ['Ken', 8],
      ['Ada', 7],
      ['Ada', 4],
    ]);
    expect(top.every((e) => e.origin === 'local')).toBe(true);
    expect(await lb.top({ category: 'distance', arenaId: 'classic', limit: 2 })).toHaveLength(2);
    expect((await lb.top({ category: 'distance', arenaId: 'classic', designHash: 'bbbbbbbbbbbbbbbb' })).map((e) => e.score)).toEqual([4]);
    expect(lb.ownEntries()).toHaveLength(6);
  });

  it('survives corrupt storage', async () => {
    const s = new MemStorage();
    s.setItem('ppl-leaderboard', '{not json');
    const lb = new LocalLeaderboard({ storage: s });
    expect(await lb.top({ category: 'distance', arenaId: 'open' })).toEqual([]);
  });

  it('groups entries by design', async () => {
    const lb = new LocalLeaderboard({ storage: new MemStorage() });
    await lb.submit(entry({ score: 3 }));
    await lb.submit(entry({ score: 5, player: 'Grace' }));
    await lb.submit(entry({ score: 4, player: 'Ken', designHash: 'cccccccccccccccc' }));
    const groups = groupByDesign(await lb.top({ category: 'distance', arenaId: 'classic' }));
    expect(groups.map((g) => [g.designHash, g.pilots, g.best.player])).toEqual([
      ['aaaaaaaaaaaaaaaa', 2, 'Grace'],
      ['cccccccccccccccc', 1, 'Ken'],
    ]);
  });
});

describe('house entries', () => {
  it('are deterministic, labelled, verifiable and merged into the local board', async () => {
    const designs = [presetDesign()];
    clearHouseCache();
    const a = houseEntries(designs, [classic]);
    clearHouseCache();
    const b = houseEntries(designs, [classic]);
    expect(b).toEqual(a);
    expect(a.map((e) => e.category).sort()).toEqual(['airtime', 'distance']);
    for (const e of a) {
      expect(e.player).toBe(HOUSE_PLAYER);
      expect(e.origin).toBe('house');
      expect(e.ticket.launch.speed).toBeLessThanOrEqual(classic.maxThrowSpeed);
      const v = verifyTicket(e.ticket, e.category, classic, e.score);
      expect(v.reasons).toEqual([]);
      expect(v.geometryHash).toBe(e.designHash);
    }
    expect(houseEntries(designs, [classic])[0]).toBe(b[0]); // cached

    const lb = new LocalLeaderboard({ storage: new MemStorage(), presets: designs });
    const top = await lb.top({ category: 'distance', arenaId: 'classic' });
    expect(top.some((e) => e.origin === 'house')).toBe(true);
    expect(top.every((e) => e.player === HOUSE_PLAYER)).toBe(true);
  });
});
