import { useMemo, useState, type ReactElement } from 'react';
import { useLocation, useSearch } from 'wouter';
import { PRESETS, type PlanePreset } from '../../core/designs';
import type { PlaneCategory, PlaneDesign } from '../../core/types';
import { planeList, useBestFlights, useLab } from '../../app/store';
import type { FlightSummary } from '../../app/types';
import { Button } from '../../ui/Button';
import { Card, CardLink } from '../../ui/Card';
import { Chip, Tag } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { DASH, formatLength, formatTime, type UnitSystem } from '../../ui/format';
import { Icon } from '../../ui/icons';
import { SectionHeader } from '../../ui/SectionHeader';
import { PlaneThumb } from '../fold/view';
import { CATEGORY_LABEL, CATEGORY_TONE, presetDesign } from './catalog';
import { PresetSheet, DifficultyDots } from './PresetSheet';
import { ProfessorDesk, useAssignmentSync } from './ProfessorDesk';
import './hangar.css';

type Filter = 'all' | Exclude<PlaneCategory, 'custom'>;
const FILTERS: readonly Filter[] = ['all', 'dart', 'glider', 'hybrid', 'wing'];

function isFilter(v: string | null): v is Filter {
  return v !== null && (FILTERS as readonly string[]).includes(v);
}

interface PlaneCardProps {
  plane: PlaneDesign;
  current: boolean;
  bestDistance: FlightSummary | undefined;
  bestAirtime: FlightSummary | undefined;
  units: UnitSystem;
  onOpen: () => void;
}

function PlaneCard({ plane, current, bestDistance, bestAirtime, units, onOpen }: PlaneCardProps): ReactElement {
  return (
    <li>
      <button type="button" className={`ppl-pcard${current ? ' is-current' : ''}`} onClick={onOpen} aria-current={current ? 'true' : undefined}>
        <span className="ppl-pcard__art">
          <PlaneThumb design={plane} size={120} />
          {current && (
            <span className="ppl-pcard__current">
              <Icon name="check" size={14} strokeWidth={2.6} /> Current
            </span>
          )}
        </span>
        <span className="ppl-pcard__name">{plane.name}</span>
        <Tag tone={CATEGORY_TONE[plane.category]} className="ppl-pcard__tag">
          {CATEGORY_LABEL[plane.category]}
        </Tag>
        <span className="ppl-pcard__stats ppl-num">
          <span title="Best distance">
            <Icon name="distance" size={16} /> {bestDistance ? formatLength(bestDistance.metrics.distance, units, { digits: 1 }) : DASH}
          </span>
          <span title="Best airtime">
            <Icon name="timer" size={16} /> {bestAirtime ? formatTime(bestAirtime.metrics.airtime) : DASH}
          </span>
        </span>
      </button>
    </li>
  );
}

function PresetCard({ preset, onOpen }: { preset: PlanePreset; onOpen: () => void }): ReactElement {
  const design = presetDesign(preset.id);
  return (
    <li>
      <button type="button" className="ppl-lcard" onClick={onOpen}>
        <span className="ppl-lcard__art">{design && <PlaneThumb design={design} size={104} />}</span>
        <span className="ppl-lcard__body">
          <span className="ppl-lcard__name">{preset.name}</span>
          {preset.designer && <span className="ppl-caption">by {preset.designer}</span>}
          <span className="ppl-lcard__meta">
            <Tag tone={CATEGORY_TONE[preset.category]}>{CATEGORY_LABEL[preset.category]}</Tag>
            <DifficultyDots level={preset.difficulty} />
            {preset.fidelity === 'approximate' && <span className="ppl-lcard__approx">approximate</span>}
          </span>
          <span className="ppl-small ppl-muted ppl-lcard__blurb">{preset.blurb}</span>
        </span>
      </button>
    </li>
  );
}

/** Home screen: the Professor's desk, the player's planes and the preset library. */
export default function HangarPage(): ReactElement {
  useAssignmentSync();
  const planesById = useLab((s) => s.planes);
  const currentId = useLab((s) => s.currentPlaneId);
  const selectPlane = useLab((s) => s.selectPlane);
  const units = useLab((s) => s.settings.units);
  const bestDistance = useBestFlights('distance');
  const bestAirtime = useBestFlights('airtime');
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryFilter = new URLSearchParams(search).get('category');
  const [filter, setFilter] = useState<Filter>(isFilter(queryFilter) ? queryFilter : 'all');
  const [openPreset, setOpenPreset] = useState<PlanePreset | null>(null);

  const planes = useMemo(() => {
    const list = planeList(planesById);
    // Current plane first: it is the one the other screens use.
    return list.sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
  }, [planesById, currentId]);
  const library = filter === 'all' ? PRESETS : PRESETS.filter((p) => p.category === filter);

  return (
    <div className="ppl-page ppl-hangar">
      <ProfessorDesk />

      <section className="ppl-hangar__section" aria-labelledby="ppl-my-planes">
        <SectionHeader
          id="ppl-my-planes"
          title="My planes"
          subtitle={planes.length > 0 ? 'Tap a plane to see how it flies and why.' : undefined}
          action={
            planes.length > 0 ? (
              <Button size="sm" variant="secondary" icon="plus" onClick={() => navigate('/fold')}>
                Fold
              </Button>
            ) : undefined
          }
        />
        {planes.length === 0 ? (
          <Card tone="sunken">
            <EmptyState
              compact
              icon="fold"
              title="No planes yet"
              body="Fold your first plane and it will wait for you here, ready to fly."
              actions={
                <Button variant="primary" icon="fold" onClick={() => navigate('/fold?preset=classic-dart')}>
                  Fold a Classic Dart
                </Button>
              }
            />
          </Card>
        ) : (
          <ul role="list" className="ppl-pgrid">
            {planes.map((p) => (
              <PlaneCard
                key={p.id}
                plane={p}
                current={p.id === currentId}
                bestDistance={bestDistance[p.id]}
                bestAirtime={bestAirtime[p.id]}
                units={units}
                onOpen={() => {
                  selectPlane(p.id);
                  navigate(`/plane/${encodeURIComponent(p.id)}`);
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="ppl-hangar__section" aria-labelledby="ppl-library">
        <SectionHeader id="ppl-library" title="Plane library" subtitle="Famous folds and classroom classics. Tap one for its story." />
        <div className="ppl-hangar__filters" role="group" aria-label="Filter by category">
          {FILTERS.map((f) => (
            <Chip key={f} size="sm" selected={filter === f} onClick={() => setFilter(f)} aria-pressed={filter === f}>
              {f === 'all' ? 'All' : CATEGORY_LABEL[f]}
            </Chip>
          ))}
        </div>
        {library.length === 0 ? (
          <p className="ppl-small ppl-muted">No library planes in this family yet.</p>
        ) : (
          <ul role="list" className="ppl-lgrid">
            {library.map((p) => (
              <PresetCard key={p.id} preset={p} onOpen={() => setOpenPreset(p)} />
            ))}
          </ul>
        )}
        <CardLink href="#/fold?new=1" tone="sunken" className="ppl-own">
          <svg className="ppl-own__art" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
            <rect x="14" y="8" width="40" height="56" rx="2" fill="var(--card)" stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="4 3" />
            <path d="M34 8v56" stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
            <path d="M44 40l14-10M58 30l-2 7M58 30l-7 1" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="ppl-own__text">
            <span className="ppl-h3">Design your own</span>
            <span className="ppl-small ppl-muted">Start from a blank sheet and fold anything. The lab will tell you what it looks like.</span>
          </span>
          <Icon name="next" size={22} className="ppl-own__chev" />
        </CardLink>
      </section>

      <PresetSheet preset={openPreset} onClose={() => setOpenPreset(null)} />
    </div>
  );
}
