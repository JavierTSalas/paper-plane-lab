/**
 * OUTLINE - DynamoDB adapter for LeaderboardRepo. Typed and unit-tested for key encoding and request shapes
 * only; it has NEVER been run against DynamoDB. Finish and test it against a real table before use
 * (docs/DEPLOY.md, docs/research/08-platform-leaderboard.md sections 2.3 and 2.5).
 *
 * Transport: the low-level JSON protocol, a signed `POST https://dynamodb.<region>.amazonaws.com/` with
 * `Content-Type: application/x-amz-json-1.0` and `X-Amz-Target: DynamoDB_20120810.<Operation>`. Signing
 * (SigV4) is NOT here: inject a `DynamoCall`, e.g. built on aws4fetch (`retries: 2`), which needs the lead's
 * approval as a new dependency.
 *
 * SINGLE-TABLE KEY DESIGN (table "PaperPlaneLab", on-demand)
 *   One item per (board, player, design): the player's best flight of that plane on that board.
 *   PK      "B#<engine>#<category>#<arenaId>"                         board partition
 *   SK      "S#<inverted score, 10 digits>#<createdMs, 13 digits>#<id>"  ascending = best first, then earliest
 *           inverted score = 9_999_999_999 - score in mm / ms (doc 08 section 2.5: zero-padded strings sort as
 *           numbers only for non-negative integers, so invert instead of ScanIndexForward=false)
 *   GSI1PK  "P#<lower-case player>"                                    a player's entries
 *   GSI1SK  "<PK>#D#<designHash>"                                      begins_with(<PK>) = one board
 *   doc     the RankEntry as JSON (S)                                  item well below the 400 KB limit
 *   GSI1 projection: KEYS_ONLY plus "doc" (or ALL).
 *
 * Note: the score lives in SK, so an improvement is a Delete of the old item plus a Put of the new one in one
 * TransactWriteItems (two different items, so allowed). GSI reads are eventually consistent: two concurrent
 * improvements by the same player can briefly leave two items; top() de-duplicates on read.
 */
import { dedupeBest, ENGINE_VERSION, scoreToInt, sortEntries, clampLimit } from '../src/core/leaderboard';
import type { RankCategory, RankEntry, RankQuery } from '../src/core/types';
import { playerKey } from './repo';
import type { LeaderboardRepo, PutResult } from './repo';

export type AttributeValue = { S: string } | { N: string };
export type DynamoItem = Record<string, AttributeValue>;
export type DynamoOperation = 'Query' | 'TransactWriteItems' | 'GetItem' | 'PutItem';
/** Sends one signed request and resolves to the parsed JSON reply; throws on a non-2xx status. */
export type DynamoCall = (operation: DynamoOperation, body: Record<string, unknown>) => Promise<unknown>;

export const SCORE_KEY_MAX = 9_999_999_999;
const pad = (n: number, width: number): string => String(Math.max(0, Math.floor(n))).padStart(width, '0');

export function boardPartition(category: RankCategory, arenaId: string, engine: string = ENGINE_VERSION): string {
  return `B#${engine}#${category}#${arenaId}`;
}

export function scoreSortKey(e: Pick<RankEntry, 'score' | 'createdAt' | 'id'>): string {
  const inverted = SCORE_KEY_MAX - Math.min(SCORE_KEY_MAX, scoreToInt(e.score));
  return `S#${pad(inverted, 10)}#${pad(Date.parse(e.createdAt), 13)}#${e.id}`;
}

export function playerPartition(player: string): string {
  return `P#${playerKey(player)}`;
}

export function playerSortKey(e: Pick<RankEntry, 'category' | 'arenaId' | 'designHash'>): string {
  return `${boardPartition(e.category, e.arenaId)}#D#${e.designHash}`;
}

export function toItem(e: RankEntry): DynamoItem {
  return {
    PK: { S: boardPartition(e.category, e.arenaId) },
    SK: { S: scoreSortKey(e) },
    GSI1PK: { S: playerPartition(e.player) },
    GSI1SK: { S: playerSortKey(e) },
    designHash: { S: e.designHash },
    score: { N: String(e.score) },
    doc: { S: JSON.stringify(e) },
  };
}

export function fromItem(item: Record<string, unknown>): RankEntry | null {
  const doc = item.doc as { S?: unknown } | undefined;
  if (!doc || typeof doc.S !== 'string') return null;
  try {
    return JSON.parse(doc.S) as RankEntry;
  } catch {
    return null;
  }
}

/** Top-N of one board. With a designHash the filter runs after Limit, so the request over-fetches. */
export function topRequest(table: string, q: RankQuery): Record<string, unknown> {
  const limit = clampLimit(q.limit);
  const values: Record<string, AttributeValue> = { ':b': { S: boardPartition(q.category, q.arenaId) } };
  const req: Record<string, unknown> = {
    TableName: table,
    KeyConditionExpression: 'PK = :b',
    ScanIndexForward: true,
    Limit: q.designHash ? 1000 : limit * 2,
  };
  if (q.designHash) {
    values[':h'] = { S: q.designHash };
    req.FilterExpression = 'designHash = :h';
  }
  req.ExpressionAttributeValues = values;
  return req;
}

/** The player's items on one board (all designs), or for one design when `designHash` is given. */
export function playerBoardRequest(table: string, category: RankCategory, arenaId: string, player: string, designHash?: string): Record<string, unknown> {
  const prefix = `${boardPartition(category, arenaId)}#D#`;
  return {
    TableName: table,
    IndexName: 'GSI1',
    KeyConditionExpression: designHash ? 'GSI1PK = :p AND GSI1SK = :k' : 'GSI1PK = :p AND begins_with(GSI1SK, :k)',
    ExpressionAttributeValues: { ':p': { S: playerPartition(player) }, ':k': { S: designHash ? prefix + designHash : prefix } },
  };
}

/** Replace the previous best (if any) with `entry` atomically. */
export function improveTransaction(table: string, entry: RankEntry, previous: RankEntry | null): Record<string, unknown> {
  const items: Record<string, unknown>[] = [
    { Put: { TableName: table, Item: toItem(entry), ConditionExpression: 'attribute_not_exists(PK)' } },
  ];
  if (previous) {
    items.unshift({
      Delete: {
        TableName: table,
        Key: { PK: { S: boardPartition(previous.category, previous.arenaId) }, SK: { S: scoreSortKey(previous) } },
        ConditionExpression: 'attribute_exists(PK)',
      },
    });
  }
  return { TransactItems: items };
}

const itemsOf = (reply: unknown): Record<string, unknown>[] => {
  const items = (reply as { Items?: unknown } | null)?.Items;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
};
const entriesOf = (reply: unknown): RankEntry[] => itemsOf(reply).map(fromItem).filter((e): e is RankEntry => e !== null);

/** OUTLINE: untested against DynamoDB; no pagination (LastEvaluatedKey) yet. */
export class DynamoRepo implements LeaderboardRepo {
  constructor(private readonly call: DynamoCall, private readonly table = 'PaperPlaneLab') {}

  async top(q: RankQuery): Promise<RankEntry[]> {
    const entries = entriesOf(await this.call('Query', topRequest(this.table, q)));
    return dedupeBest(entries).slice(0, clampLimit(q.limit));
  }

  async put(entry: RankEntry): Promise<PutResult> {
    const prev = sortEntries(
      entriesOf(await this.call('Query', playerBoardRequest(this.table, entry.category, entry.arenaId, entry.player, entry.designHash))),
    )[0] ?? null;
    if (prev && prev.score >= entry.score) return { stored: false, best: prev };
    // A TransactionCanceledException here means a concurrent write won; the caller may retry once.
    await this.call('TransactWriteItems', improveTransaction(this.table, entry, prev));
    return { stored: true, best: entry };
  }

  async bestForPlayer(category: RankCategory, arenaId: string, player: string): Promise<RankEntry | null> {
    return sortEntries(entriesOf(await this.call('Query', playerBoardRequest(this.table, category, arenaId, player))))[0] ?? null;
  }
}
