import { describe, expect, it } from 'vitest';
import { defaultDesign } from '../../core/designs';
import { buildTicketResult, LocalLeaderboard, scoreOf } from '../../core/leaderboard';
import { defaultLaunch } from '../../core/sim';
import type { FlightTicket, RankEntry } from '../../core/types';
import { readReplay, readReplayTicket, REPLAY_STATE_KEY, replayState } from './replay';
import { submitFlight, type SubmitDeps } from './submit';

function memory(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function ticket(): FlightTicket {
  return { design: defaultDesign(), launch: defaultLaunch('dart'), conditions: { envId: 'hangar' }, seed: 7 };
}

function deps(houseScore: number): SubmitDeps & { marked: string[]; store: LocalLeaderboard } {
  const marked: string[] = [];
  const house = { category: 'distance', score: houseScore, planeName: 'Classic Dart' } as RankEntry;
  return { store: new LocalLeaderboard({ storage: memory() }), house: async () => [house], markAssignment: (id) => marked.push(id), marked };
}

describe('submitFlight', () => {
  it('verifies, stores the re-simulated score and marks assignments', async () => {
    const t = ticket();
    const d = deps(0.5);
    const out = await submitFlight(t, 'distance', 'classic', '  Ada  ', undefined, d);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.entry.player).toBe('Ada');
    expect(out.entry.score).toBeCloseTo(scoreOf('distance', buildTicketResult(t).result.metrics), 6);
    expect(out.entry.origin).toBe('local');
    expect(out.beatBenchmarks).toEqual(['Classic Dart']);
    expect(d.marked).toEqual(['enter-ranking', 'beat-benchmark']);
    expect(d.store.ownEntries()).toHaveLength(1);
  });

  it('refuses a flight that breaks the arena rules, with reasons', async () => {
    const t = { ...ticket(), launch: { ...defaultLaunch('dart'), speed: 20 } };
    const d = deps(0);
    const out = await submitFlight(t, 'distance', 'classic', 'Ada', undefined, d);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reasons.join(' ')).toMatch(/speed/);
    expect(d.marked).toEqual([]);
  });

  it('refuses a claimed score that does not match', async () => {
    const out = await submitFlight(ticket(), 'distance', 'classic', 'Ada', 999, deps(0));
    expect(out.ok).toBe(false);
  });

  it('does not mark the benchmark when no benchmark is beaten', async () => {
    const d = deps(1e6);
    const out = await submitFlight(ticket(), 'distance', 'classic', 'Ada', undefined, d);
    expect(out.ok && out.beatBenchmarks.length).toBe(0);
    expect(d.marked).toEqual(['enter-ranking']);
  });

  it('reads a replay ticket from history state', () => {
    const t = ticket();
    expect(readReplayTicket({ [REPLAY_STATE_KEY]: JSON.parse(JSON.stringify(t)) })?.seed).toBe(7);
    expect(readReplayTicket({ other: 1 })).toBeNull();
    expect(readReplayTicket(null)).toBeNull();
  });

  it('hands a board entry to the Fly screen with the name to show', () => {
    const t = ticket();
    const entry = { origin: 'local', player: 'Ada', ticket: t } as RankEntry;
    const viaHistory: unknown = JSON.parse(JSON.stringify(replayState(entry)));
    expect(readReplay(viaHistory)).toMatchObject({ player: 'Ada', ticket: { seed: 7 } });
    expect(readReplay(JSON.parse(JSON.stringify(replayState({ ...entry, origin: 'house' }))))?.player).toBe('Lab benchmark');
    expect(readReplay({ [REPLAY_STATE_KEY]: JSON.parse(JSON.stringify(t)) })?.player).toBe('A pilot');
    expect(readReplay({ other: 1 })).toBeNull();
  });
});
