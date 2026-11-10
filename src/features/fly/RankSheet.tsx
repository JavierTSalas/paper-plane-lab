import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { useLab } from '../../app/store';
import { boardKey, cleanName, formatScore, MAX_PLAYER_NAME } from '../../core/leaderboard';
import type { RankCategory } from '../../core/types';
import { Button } from '../../ui/Button';
import { Tag } from '../../ui/Chip';
import type { UnitSystem } from '../../ui/format';
import { Icon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { isOnline, submitFlight, type SubmitOutcome } from '../ranks';
import { boardLabel, plainReason, ticketOf, type BoardOption, type RankingCheck } from './ranking';
import type { ThrowRecord } from './types';

export interface RankSheetProps {
  open: boolean;
  onClose: () => void;
  record: ThrowRecord;
  /** The boards this throw may enter (and the arenas that refuse it), from `checkRanking`. */
  check: RankingCheck;
  units: UnitSystem;
  /** Called after the first board accepted the throw. */
  onEntered?: () => void;
  onViewRanks: (board: { arenaId: string; category: RankCategory }) => void;
}

interface BoardResult {
  board: BoardOption;
  outcome: SubmitOutcome;
}

const keyOf = (b: BoardOption): string => boardKey(b.category, b.arena.id);

/** Lets the "checking" state paint before a re-simulation blocks the main thread. */
const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

function benchmarkLine(results: readonly BoardResult[]): string | null {
  const beaten = new Set<string>();
  for (const r of results) if (r.outcome.ok) for (const name of r.outcome.beatBenchmarks) beaten.add(name);
  if (beaten.size === 0) return null;
  const names = [...beaten];
  if (names.length === 1) return `It beat the lab benchmark of the ${names[0]}.`;
  if (names.length <= 3) return `It beat the lab benchmarks of the ${names.slice(0, -1).join(', ')} and the ${names[names.length - 1]}.`;
  return `It beat ${names.length} lab benchmarks.`;
}

/**
 * Enter a landed throw in the rankings: choose among the boards it qualifies for, give a name, submit. The
 * lab re-flies the throw to check it; the outcome of every board is shown in place.
 */
export function RankSheet({ open, onClose, record, check, units, onEntered, onViewRanks }: RankSheetProps): ReactElement {
  const profileName = useLab((s) => s.profile.name);
  const setName = useLab((s) => s.setName);
  const [name, setNameDraft] = useState(() => profileName.slice(0, MAX_PLAYER_NAME));
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(check.boards.map(keyOf)));
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<BoardResult[] | null>(null);
  const formId = useId();
  const nameId = useId();
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const ticket = useMemo(() => ticketOf(record), [record]);
  const picked = check.boards.filter((b) => chosen.has(keyOf(b)));
  const accepted = results?.filter((r) => r.outcome.ok) ?? [];
  const firstAccepted = accepted[0];
  const stored = accepted.some((r) => r.outcome.ok && r.outcome.entry.origin === 'local');

  const toggle = (b: BoardOption): void => {
    setChosen((old) => {
      const next = new Set(old);
      if (!next.delete(keyOf(b))) next.add(keyOf(b));
      return next;
    });
  };

  const submit = async (): Promise<void> => {
    if (busy || results || picked.length === 0) return;
    const player = cleanName(name, MAX_PLAYER_NAME);
    if (player) setName(player);
    setBusy(true);
    const done: BoardResult[] = [];
    for (const board of picked) {
      await breathe();
      let outcome: SubmitOutcome;
      try {
        outcome = await submitFlight(ticket, board.category, board.arena.id, player ?? 'Pilot', board.score);
      } catch (err) {
        outcome = { ok: false, reasons: [err instanceof Error ? err.message : 'the rankings could not take the flight'] };
      }
      done.push({ board, outcome });
    }
    if (!live.current) return;
    setResults(done);
    setBusy(false);
    if (done.some((r) => r.outcome.ok)) onEntered?.();
  };

  const footer = results ? (
    <>
      <Button variant={firstAccepted ? 'secondary' : 'primary'} onClick={onClose}>
        {firstAccepted ? 'Done' : 'Close'}
      </Button>
      {firstAccepted && (
        <Button variant="primary" icon="ranks" onClick={() => onViewRanks({ arenaId: firstAccepted.board.arena.id, category: firstAccepted.board.category })}>
          View rankings
        </Button>
      )}
    </>
  ) : (
    <Button variant="primary" block icon="ranks" type="submit" form={formId} loading={busy} disabled={picked.length === 0}>
      {busy ? 'The lab is re-flying it' : picked.length > 1 ? `Submit to ${picked.length} boards` : 'Submit'}
    </Button>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="sm"
      title={results ? (firstAccepted ? 'Your throw is on the board' : 'Not entered') : 'Enter the ranking'}
      description={results ? undefined : `${record.build.design.name}: every entry is re-flown by the lab to check it.`}
      footer={footer}
    >
      {results ? (
        <div className="ppl-stack ppl-fly-rank" data-rank-outcome={firstAccepted ? (stored ? 'stored' : 'accepted') : 'rejected'}>
          <ul role="list" className="ppl-fly-rank__list">
            {results.map(({ board, outcome }) => (
              <li key={keyOf(board)} className="ppl-fly-rank__row">
                <span className="ppl-fly-rank__text">
                  <span className="ppl-fly-rank__board">{boardLabel(board)}</span>
                  {outcome.ok ? (
                    <Tag tone="good" icon="check">
                      Accepted
                    </Tag>
                  ) : (
                    <Tag tone="bad" icon="warning">
                      Not accepted
                    </Tag>
                  )}
                  {!outcome.ok && (
                    <span className="ppl-fly-rank__reasons">
                      {outcome.reasons.map((r) => plainReason(r, ticket, board.arena, units)).join(' ')}
                    </span>
                  )}
                </span>
                <span className="ppl-fly-rank__score ppl-num">{formatScore(board.category, outcome.ok ? outcome.entry.score : board.score, units)}</span>
              </li>
            ))}
          </ul>
          <div role="status" className="ppl-stack ppl-fly-rank__status">
            {firstAccepted && stored && (
              <p className="ppl-fly-rank__note">
                <Icon name="info" size={18} />
                <span>
                  {isOnline()
                    ? 'The online rankings could not be reached, so the flight is stored on this device.'
                    : 'Stored on this device. Online rankings are not connected yet, so the flight sits on this device’s boards next to the lab benchmarks.'}
                </span>
              </p>
            )}
            {firstAccepted && !stored && (
              <p className="ppl-fly-rank__note">
                <Icon name="check" size={18} />
                <span>The lab re-flew the throw and it is on the online board.</span>
              </p>
            )}
            {benchmarkLine(results) && (
              <p className="ppl-fly-rank__note">
                <Icon name="star" size={18} />
                <span>{benchmarkLine(results)}</span>
              </p>
            )}
            {!firstAccepted && <p className="ppl-small ppl-muted">Nothing was entered. Fix the points above and throw again.</p>}
          </div>
        </div>
      ) : (
        <form
          id={formId}
          className="ppl-stack ppl-fly-rank"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset className="ppl-fly-rank__boards" disabled={busy}>
            <legend className="ppl-fly-rank__legend">This throw qualifies for</legend>
            {check.boards.map((b) => (
              <label key={keyOf(b)} className="ppl-fly-rank__row ppl-fly-rank__row--pick">
                <input type="checkbox" className="ppl-fly-rank__check" checked={chosen.has(keyOf(b))} onChange={() => toggle(b)} />
                <span className="ppl-fly-rank__text">
                  <span className="ppl-fly-rank__board">{boardLabel(b)}</span>
                </span>
                <span className="ppl-fly-rank__score ppl-num">{formatScore(b.category, b.score, units)}</span>
              </label>
            ))}
          </fieldset>
          {check.refused.map((r) => (
            <p key={r.arena.id} className="ppl-fly-rank__note">
              <Icon name="info" size={18} />
              <span>
                Not the {r.arena.name}: {r.reasons.join(' ')}
              </span>
            </p>
          ))}
          <div className="ppl-fly-rank__name">
            <label htmlFor={nameId} className="ppl-fly-rank__legend">
              Your name on the board
            </label>
            <input
              id={nameId}
              className="ppl-fly-rank__input"
              type="text"
              autoComplete="nickname"
              enterKeyHint="done"
              maxLength={MAX_PLAYER_NAME}
              placeholder="Pilot"
              value={name}
              disabled={busy}
              onChange={(e) => setNameDraft(e.target.value)}
            />
          </div>
        </form>
      )}
    </Sheet>
  );
}
