/// <reference lib="webworker" />
// Lab benchmark flights take a few seconds per arena (about 40 simulations per preset), so they run here,
// off the main thread. Only core imports: no React, no DOM.
import { makeDesign, PRESETS, presetPaper } from '../../core/designs';
import { getArena, houseEntries } from '../../core/leaderboard';
import type { RankEntry } from '../../core/types';

export interface HouseRequest {
  arenaId: string;
}

export interface HouseReply {
  arenaId: string;
  entries: RankEntry[];
}

const designs = PRESETS.map((p) => makeDesign(p, presetPaper(p)));

self.onmessage = (e: MessageEvent<HouseRequest>): void => {
  const arena = getArena(e.data.arenaId);
  const entries = arena ? houseEntries(designs, [arena]) : [];
  const reply: HouseReply = { arenaId: e.data.arenaId, entries };
  self.postMessage(reply);
};
