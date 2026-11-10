import type { PaperSpec } from '../../types';
import { lockFolds } from '../families';
import { DEFAULT_TRIM, line } from '../helpers';
import type { PlanePreset, PresetBuild } from '../types';

/** The tip gap may take at most this share of H - W, so that a locking tip of useful size remains (Letter). */
const MAX_GAP_SHARE = 0.7;

/**
 * Sky King-class time-aloft glider: the "SK-proxy" of docs/research/06-designs-gliders-records.md section 4.
 * A Nakamura-family fold with a long wing, a very shallow body, strong dihedral and wingtip fins in place of
 * the fin Takuo Toda forms with reverse folds. It is NOT Toda's fold sequence.
 */
function build(paper: PaperSpec): PresetBuild {
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const { steps, yNose, yLock } = lockFolds(paper, { tipGap: Math.min(W / 4, MAX_GAP_SHARE * Math.max(0, H - W)) });
  const dNose = W / 32;
  const dTail = W / 16;
  const e = W / 16;
  const wingLine = line([cx + dTail, 0], [cx + dNose, yNose - dNose]);
  // The fin line meets the leading edge e above the shoulder.
  const wingletLine = line([W - e, 0], [W - e, yLock + e]);

  return {
    steps,
    shape: {
      keel: 'mountain',
      keelSpreadDeg: 4,
      wingLine,
      dihedralDeg: 12,
      wingletLine,
      wingletDeg: 80,
    },
    trim: { ...DEFAULT_TRIM, elevatorDeg: 5, elevatorChordFrac: 0.1 },
  };
}

export const skyKing: PlanePreset = {
  id: 'sky-king',
  name: 'Sky King-class Glider',
  category: 'glider',
  blurb: 'A small time-aloft glider in the style of Takuo Toda\'s record plane.',
  story:
    'Takuo Toda, chairman of the Japan Origami Airplane Association, kept his "Sky King" in the air for 27.9 seconds in 2009. ' +
    'Planes of this kind are thrown almost straight up as hard as possible, then turn over at the top and circle down slowly on broad wings. ' +
    'Toda shapes his fin with origami folds our workbench does not have, so this stand-in uses upturned wingtips instead.',
  difficulty: 3,
  orientation: 'portrait',
  recommendedSizeId: 'a5',
  fidelity: 'approximate',
  fidelityNote: 'Not Takuo Toda\'s fold: his design needs reverse folds, so this is a simple-fold stand-in with wingtip fins.',
  build,
  throwHint: { speed: 5, pitchDeg: 0, note: 'Indoors, a gentle level push. For time aloft in the hangar, throw it hard and almost straight up.' },
  sources: [
    'https://www.japantimes.co.jp/news/2009/05/17/national/new-flight-record-for-paper-plane-set/',
    'https://content.time.com/time/specials/packages/article/0,28804,1934027_1934003_1933991,00.html',
    'https://www.guinnessworldrecords.jp/world-records/longest-time-flying-a-paper-aircraft',
  ],
};
