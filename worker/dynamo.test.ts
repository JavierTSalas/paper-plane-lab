import { describe, expect, it } from 'vitest';
import type { RankEntry } from '../src/core/types';
import { DynamoRepo, scoreSortKey, toItem } from './dynamo';
import type { DynamoCall, DynamoOperation } from './dynamo';

const e = (score: number, createdAt: string, id: string): Pick<RankEntry, 'score' | 'createdAt' | 'id'> => ({ score, createdAt, id });

describe('DynamoDB outline: key encoding', () => {
  it('sorts best first, then earliest, as plain strings', () => {
    const keys = [
      scoreSortKey(e(9.5, '2026-11-10T00:00:02.000Z', 'c')),
      scoreSortKey(e(12.25, '2026-11-10T00:00:05.000Z', 'b')),
      scoreSortKey(e(12.25, '2026-11-10T00:00:01.000Z', 'a')),
      scoreSortKey(e(0, '2026-11-10T00:00:00.000Z', 'd')),
      scoreSortKey(e(100, '2026-11-10T00:00:00.000Z', 'e')),
    ];
    const order = [...keys].sort().map((k) => k.split('#').pop());
    expect(order).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(keys[1]).toMatch(/^S#\d{10}#\d{13}#b$/);
  });

  it('keeps the better of two flights of one plane via a fake transport', async () => {
    const calls: DynamoOperation[] = [];
    let stored: Record<string, unknown>[] = [];
    const call: DynamoCall = async (op, body) => {
      calls.push(op);
      if (op === 'Query') return { Items: stored };
      const items = (body.TransactItems as { Put?: { Item: Record<string, unknown> } }[]).flatMap((t) => (t.Put ? [t.Put.Item] : []));
      stored = items;
      return {};
    };
    const repo = new DynamoRepo(call);
    const base = { category: 'distance', arenaId: 'open', player: 'Ada', planeName: 'P', designHash: 'h', paperSizeId: 'a4', origin: 'global' } as const;
    const first = { ...base, id: '1', score: 5, createdAt: '2026-11-10T00:00:00.000Z', ticket: {} } as unknown as RankEntry;
    expect((await repo.put(first)).stored).toBe(true);
    expect((await repo.put({ ...first, id: '2', score: 4 })).stored).toBe(false);
    expect((await repo.put({ ...first, id: '3', score: 6 })).stored).toBe(true);
    expect(calls).toEqual(['Query', 'TransactWriteItems', 'Query', 'Query', 'TransactWriteItems']);
    expect((await repo.top({ category: 'distance', arenaId: 'open' })).map((x) => x.id)).toEqual(['3']);
    expect(JSON.stringify(toItem(first).GSI1SK)).toMatch(/#D#h"/);
  });
});
