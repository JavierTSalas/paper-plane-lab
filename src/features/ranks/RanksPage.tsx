import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useLocation, useSearch } from 'wouter';
import { ARENAS, formatScore, getArena, groupByDesign, isRankCategory, type DesignGroup } from '../../core/leaderboard';
import { getPaperSize } from '../../core/paper';
import type { RankCategory, RankEntry } from '../../core/types';
import { useLab } from '../../app/store';
import type { UnitSystem } from '../../ui/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Tag } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/icons';
import { InfoDot } from '../../ui/InfoDot';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Spinner } from '../../ui/Spinner';
import { cx } from '../../ui/cx';
import { PlaneThumb } from '../fold/view';
import { EntrySheet } from './EntrySheet';
import { isOnline, lastCallOffline, loadBoard } from './leaderboard';
import '../hangar/hangar.css';
import './ranks.css';

type View = 'design' | 'all';

/** Groups up to this size open by themselves when they hold the player's own flight. */
const AUTO_OPEN_MAX = 8;

interface BoardState {
  key: string;
  entries: RankEntry[] | null;
  error: string | null;
}

function isMine(e: RankEntry, me: string): boolean {
  if (e.origin === 'house') return false;
  if (e.origin === 'local') return true;
  return me.length > 0 && e.player.trim().toLowerCase() === me.trim().toLowerCase();
}

interface RowProps {
  rank: number;
  entry: RankEntry;
  category: RankCategory;
  units: UnitSystem;
  mine: boolean;
  onOpen: () => void;
  sub?: boolean;
}

function EntryRow({ rank, entry, category, units, mine, onOpen, sub = false }: RowProps): ReactElement {
  const house = entry.origin === 'house';
  return (
    <button type="button" className={cx('ppl-rrow', mine && 'is-mine', sub && 'is-sub')} onClick={onOpen}>
      <span className={cx('ppl-rrow__rank ppl-num', rank <= 3 && !sub && `is-top${rank}`)}>{sub ? '' : rank}</span>
      <span className="ppl-rrow__thumb" aria-hidden="true">
        <PlaneThumb design={entry.ticket.design} size={64} />
      </span>
      <span className="ppl-rrow__text">
        <span className="ppl-rrow__plane">{entry.planeName}</span>
        <span className="ppl-rrow__who">
          {house ? (
            <Tag tone="mustard">Lab benchmark</Tag>
          ) : (
            <span className="ppl-small">
              {entry.player}
              {mine && <span className="ppl-rrow__you"> · you</span>}
            </span>
          )}
          <span className="ppl-caption">{getPaperSize(entry.paperSizeId).name}</span>
        </span>
      </span>
      <span className="ppl-rrow__score ppl-num">{formatScore(category, entry.score, units)}</span>
    </button>
  );
}

function GroupRow({ group, rank, category, units, me, onOpen }: { group: DesignGroup; rank: number; category: RankCategory; units: UnitSystem; me: string; onOpen: (e: RankEntry) => void }): ReactElement {
  const more = group.entries.length - 1;
  const mine = group.entries.some((e) => isMine(e, me));
  // The player's own flight is never hidden behind a better one of the same design (unless the group is long).
  const [open, setOpen] = useState(() => mine && !isMine(group.best, me) && group.entries.length <= AUTO_OPEN_MAX);
  return (
    <li className={cx('ppl-rgroup', open && 'is-open')}>
      <EntryRow rank={rank} entry={group.best} category={category} units={units} mine={isMine(group.best, me)} onOpen={() => onOpen(group.best)} />
      {group.entries.length > 1 && (
        <button type="button" className="ppl-rgroup__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="layers" size={16} />
          <span>
            {group.pilots > 1 ? `${group.pilots} pilots fly this design` : `${group.entries.length} flights of this design`}
            {mine && !isMine(group.best, me) ? ', you too' : ''}
          </span>
          <Icon name="chevron-down" size={18} className="ppl-rgroup__chev" />
        </button>
      )}
      {open && more > 0 && (
        <ul role="list" className="ppl-rgroup__more">
          {group.entries.slice(1).map((e) => (
            <li key={e.id}>
              <EntryRow rank={0} sub entry={e} category={category} units={units} mine={isMine(e, me)} onOpen={() => onOpen(e)} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Global rankings: two arenas, distance and airtime, identical designs grouped. */
export default function RanksPage(): ReactElement {
  const units = useLab((s) => s.settings.units);
  const me = useLab((s) => s.profile.name);
  const [, navigate] = useLocation();
  const search = useSearch();
  // Deep link to one board: /ranks?arena=<id>&rank=<category> (from "View rankings" after a submission).
  const query = useMemo(() => new URLSearchParams(search), [search]);
  const [arenaId, setArenaId] = useState(() => getArena(query.get('arena') ?? '')?.id ?? ARENAS[0]!.id);
  const [category, setCategory] = useState<RankCategory>(() => {
    const c = query.get('rank');
    return isRankCategory(c) ? c : 'distance';
  });
  // The link has done its work: drop the query, so it does not ride along to the other tabs.
  useEffect(() => {
    if (search) navigate('/ranks?', { replace: true });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [view, setView] = useState<View>('design');
  const [board, setBoard] = useState<BoardState>({ key: '', entries: null, error: null });
  const [selected, setSelected] = useState<RankEntry | null>(null);
  const [offline, setOffline] = useState(false);
  const key = `${category}|${arenaId}`;
  const arena = ARENAS.find((a) => a.id === arenaId) ?? ARENAS[0]!;

  useEffect(() => {
    let live = true;
    setBoard((b) => (b.key === key ? b : { key, entries: null, error: null }));
    loadBoard(category, arenaId).then(
      (entries) => {
        if (!live) return;
        setBoard({ key, entries, error: null });
        setOffline(lastCallOffline());
      },
      (err: unknown) => {
        if (live) setBoard({ key, entries: [], error: err instanceof Error ? err.message : 'The board could not be loaded.' });
      },
    );
    return () => {
      live = false;
    };
  }, [key, category, arenaId]);

  const entries = board.key === key ? board.entries : null;
  const groups = useMemo(() => (entries ? groupByDesign(entries) : []), [entries]);

  return (
    <div className="ppl-page ppl-ranks">
      <header className="ppl-ranks__head">
        <div className="ppl-ranks__controls">
          <div className="ppl-ranks__arena">
            <SegmentedControl
              label="Arena"
              block
              value={arenaId}
              onChange={setArenaId}
              options={ARENAS.map((a) => ({ value: a.id, label: a.name }))}
            />
            <InfoDot label={`Rules of the ${arena.name}`} title={arena.name}>
              {arena.blurb}
            </InfoDot>
          </div>
          <SegmentedControl<RankCategory>
            label="Category"
            block
            value={category}
            onChange={setCategory}
            options={[
              { value: 'distance', label: 'Distance', icon: 'distance' },
              { value: 'airtime', label: 'Airtime', icon: 'timer' },
            ]}
          />
        </div>

        {!isOnline() ? (
          <p className="ppl-ranks__banner" role="status">
            <Icon name="info" size={18} />
            <span>Online rankings are not connected yet. You are seeing lab benchmarks and flights from this device.</span>
          </p>
        ) : offline ? (
          <p className="ppl-ranks__banner" role="status">
            <Icon name="cloud" size={18} />
            <span>The online rankings could not be reached just now. You are seeing lab benchmarks and flights from this device.</span>
          </p>
        ) : null}
      </header>

      <div className="ppl-ranks__listhead">
        <h2 className="ppl-h2">
          {arena.name} · {category === 'distance' ? 'Distance' : 'Airtime'}
        </h2>
        <SegmentedControl<View>
          label="Show"
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'design', label: 'Best per design' },
            { value: 'all', label: 'All flights' },
          ]}
        />
      </div>

      {entries === null ? (
        <Card tone="sunken" className="ppl-ranks__loading">
          <Spinner size={28} label={null} />
          <p className="ppl-small ppl-muted">The lab is flying its benchmark planes in the hangar. This takes a few seconds the first time.</p>
        </Card>
      ) : board.error ? (
        <Card tone="sunken">
          <EmptyState compact icon="warning" title="The board could not be loaded" body={board.error} />
        </Card>
      ) : entries.length === 0 ? (
        <Card tone="sunken">
          <EmptyState
            compact
            icon="ranks"
            title="No flights on this board yet"
            body="Fly in the Record Hangar and choose Enter ranking on the result card."
            actions={
              <Button variant="primary" icon="fly" onClick={() => navigate('/fly')}>
                Go fly
              </Button>
            }
          />
        </Card>
      ) : view === 'design' ? (
        <ol role="list" className="ppl-rlist">
          {groups.map((g, i) => (
            <GroupRow key={g.designHash} group={g} rank={i + 1} category={category} units={units} me={me} onOpen={setSelected} />
          ))}
        </ol>
      ) : (
        <ol role="list" className="ppl-rlist">
          {entries.map((e, i) => (
            <li key={e.id} className="ppl-rgroup">
              <EntryRow rank={i + 1} entry={e} category={category} units={units} mine={isMine(e, me)} onOpen={() => setSelected(e)} />
            </li>
          ))}
        </ol>
      )}

      {entries !== null && entries.length > 0 && (
        <p className="ppl-caption ppl-ranks__foot">
          To enter, fly in the Record Hangar under the arena&rsquo;s rules and choose Enter ranking on the result card. Every entry is re-flown by the lab to check it.
        </p>
      )}

      <EntrySheet entry={selected} board={entries ?? []} onClose={() => setSelected(null)} />
    </div>
  );
}
