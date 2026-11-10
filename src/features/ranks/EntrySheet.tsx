import { useMemo, type ReactElement } from 'react';
import { useLocation } from 'wouter';
import { getArena } from '../../core/leaderboard';
import { getPaperSize } from '../../core/paper';
import { describeMatch, rankSimilar, type SimilarityCandidate } from '../../core/similarity';
import type { PlaneDesign, RankEntry } from '../../core/types';
import { getPlaneBuild } from '../../app/hooks';
import { useLab } from '../../app/store';
import { Button } from '../../ui/Button';
import { Tag } from '../../ui/Chip';
import { formatDeg, formatPercent, formatSpeed } from '../../ui/format';
import { InfoDot } from '../../ui/InfoDot';
import { Sheet } from '../../ui/Sheet';
import { Stat, StatGrid } from '../../ui/Stat';
import { toast } from '../../ui/Toast';
import { PlaneThumb, PlaneView } from '../fold/view';
import { copyName, designFingerprint, getPresetCandidates, MATCH_WORD, newPlaneId, presetDesign } from '../hangar/catalog';
import { replayState } from './replay';

const SHOWN = new Set(['identical', 'near-identical', 'similar']);

interface Similar {
  id: string;
  name: string;
  score: number;
  label: ReturnType<typeof describeMatch>;
  design: PlaneDesign | undefined;
  kind: 'library' | 'board';
}

function similarTo(entry: RankEntry, others: readonly RankEntry[]): Similar[] {
  const byHash = new Map<string, RankEntry>();
  for (const e of others) if (e.designHash !== entry.designHash && !byHash.has(e.designHash)) byHash.set(e.designHash, e);
  const boardCandidates: SimilarityCandidate[] = [...byHash.values()].map((e) => ({ id: `board:${e.designHash}`, name: e.planeName, fingerprint: designFingerprint(e.ticket.design) }));
  const presets = getPresetCandidates().filter((c) => c.id !== entry.presetId || entry.origin !== 'house');
  const ranked = rankSimilar(designFingerprint(entry.ticket.design), [...presets, ...boardCandidates], 6);
  return ranked
    .map((m): Similar => {
      const board = m.id.startsWith('board:') ? byHash.get(m.id.slice(6)) : undefined;
      return {
        id: m.id,
        name: m.name,
        score: m.score,
        label: describeMatch(m.score),
        design: board ? board.ticket.design : presetDesign(m.id),
        kind: board ? 'board' : 'library',
      };
    })
    .filter((m) => SHOWN.has(m.label))
    .slice(0, 4);
}

export interface EntrySheetProps {
  entry: RankEntry | null;
  /** The board it came from, for look-alikes among other entries. */
  board: readonly RankEntry[];
  onClose: () => void;
}

export function EntrySheet({ entry, board, onClose }: EntrySheetProps): ReactElement {
  const units = useLab((s) => s.settings.units);
  const planes = useLab((s) => s.planes);
  const savePlane = useLab((s) => s.savePlane);
  const [, navigate] = useLocation();
  const model = useMemo(() => (entry ? getPlaneBuild(entry.ticket.design).model : null), [entry]);
  const similar = useMemo(() => (entry ? similarTo(entry, board) : []), [entry, board]);
  const arena = entry ? getArena(entry.arenaId) : undefined;

  const foldIt = (): void => {
    if (!entry) return;
    const d = entry.ticket.design;
    const taken = Object.values(planes).map((p) => p.name);
    const copy: PlaneDesign = {
      ...d,
      id: newPlaneId(),
      name: taken.includes(d.name) ? copyName(d.name, taken) : d.name,
      ...(entry.origin !== 'house' ? { author: entry.player } : {}),
    };
    savePlane(copy);
    toast({ title: 'Saved to your hangar', body: `${copy.name} is now your current plane.`, tone: 'success', icon: 'hangar' });
    navigate(`/plane/${encodeURIComponent(copy.id)}`);
  };

  return (
    <Sheet
      open={entry !== null}
      onClose={onClose}
      size="md"
      title={entry?.planeName ?? ''}
      description={entry ? (entry.origin === 'house' ? 'Lab benchmark: the lab’s own reference flight' : `Flown by ${entry.player}`) : undefined}
      footer={
        entry && (
          <div className="ppl-rentry__actions">
            <Button variant="secondary" icon="replay" onClick={() => navigate('/fly', { state: replayState(entry) })}>
              Watch replay
            </Button>
            <Button variant="primary" icon="fold" onClick={foldIt}>
              Fold this plane
            </Button>
          </div>
        )
      }
    >
      {entry && model && (
        <div className="ppl-stack">
          <div className="ppl-rentry__view">
            <PlaneView model={model} paper={entry.ticket.design.paper} interactive aspect={16 / 9} label={`${entry.planeName}, drag to turn it`} />
          </div>
          <div className="ppl-row">
            {entry.origin === 'house' && <Tag tone="mustard">Lab benchmark</Tag>}
            <span className="ppl-caption">
              {arena?.name ?? entry.arenaId} · {getPaperSize(entry.paperSizeId).name} sheet
            </span>
          </div>
          <StatGrid minWidth={120}>
            <Stat label="Throw speed" icon="speed" value={formatSpeed(entry.ticket.launch.speed, units)} />
            <Stat
              label="Throw angle"
              icon="angle"
              value={formatDeg(entry.ticket.launch.pitchDeg)}
              info={
                <InfoDot label="About the throw" title="The throw">
                  The release speed and the climb angle above the horizon. Every ranked flight can be replayed exactly from these numbers.
                </InfoDot>
              }
            />
          </StatGrid>

          <section className="ppl-stack ppl-rentry__similar" aria-label="Similar planes">
            <h3 className="ppl-h3">
              Similar planes{' '}
              <InfoDot label="How is similarity measured?" title="Similar planes">
                The shape seen from above and its proportions, compared with the library and the other planes on this board.
              </InfoDot>
            </h3>
            {similar.length === 0 ? (
              <p className="ppl-small ppl-muted">Nothing on this board or in the library folds quite like it.</p>
            ) : (
              <ul role="list" className="ppl-looks">
                {similar.map((m) => (
                  <li key={m.id} className="ppl-looks__item">
                    <span className="ppl-looks__pair" aria-hidden="true">
                      {m.design && <PlaneThumb design={m.design} view="top" size={64} />}
                    </span>
                    <span className="ppl-looks__text">
                      <span className="ppl-looks__name">{m.name}</span>
                      <span className="ppl-caption">
                        {MATCH_WORD[m.label]} · {m.kind === 'library' ? 'library plane' : 'on this board'}
                      </span>
                    </span>
                    <span className="ppl-looks__score ppl-num">{formatPercent(m.score)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
