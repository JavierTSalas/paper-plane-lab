import { useMemo, type ReactElement } from 'react';
import { useLab } from '../../app/store';
import { makeDesign, PRESETS, presetPaper, type PlanePreset } from '../../core/designs';
import { makePaper, PAPER_PATTERNS } from '../../core/paper';
import type { PaperSpec, PlaneCategory, PlaneDesign } from '../../core/types';
import { Button } from '../../ui/Button';
import { Tag, type TagTone } from '../../ui/Chip';
import { cx } from '../../ui/cx';
import { PaperPicker, PaperPreview } from '../../ui/paper';
import { SectionHeader } from '../../ui/SectionHeader';
import { PlaneThumb } from './view';
import './fold.css';

export const CATEGORY_TONE: Record<PlaneCategory, TagTone> = { dart: 'sky', glider: 'sage', hybrid: 'mustard', wing: 'plum', custom: 'rose' };
export const CATEGORY_NAME: Record<PlaneCategory, string> = { dart: 'Dart', glider: 'Glider', hybrid: 'Hybrid', wing: 'Flying wing', custom: 'Custom' };

export interface ChooseStageProps {
  /** Selected preset id, or null for a blank sheet. */
  presetId: string | null;
  paper: PaperSpec;
  onSelect: (presetId: string | null) => void;
  onPaper: (paper: PaperSpec) => void;
  onStart: () => void;
  /** Label of the start button. */
  startLabel: string;
  /** A saved plane the player can carry on with, shown above the gallery. */
  resume?: PlaneDesign | null;
  onResume?: () => void;
}

function Difficulty({ level }: { level: 1 | 2 | 3 }): ReactElement {
  const words = ['', 'Easy', 'Medium', 'Tricky'];
  return (
    <span className="ppl-choose__dots" role="img" aria-label={`Difficulty: ${words[level]}`} title={words[level]}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx('ppl-choose__dot', i <= level && 'is-on')} />
      ))}
    </span>
  );
}

/** Paper in the preset's orientation, keeping the chosen size and colours. */
export function paperForPreset(preset: PlanePreset | undefined, paper: PaperSpec): PaperSpec {
  if (!preset) return paper;
  return presetPaper(preset, { sizeId: paper.sizeId, front: paper.front, back: paper.back, pattern: PAPER_PATTERNS.find((x) => x.id === paper.pattern)?.id });
}

/** Step 1: a preset or a blank sheet, then the paper. */
export function ChooseStage({ presetId, paper, onSelect, onPaper, onStart, startLabel, resume, onResume }: ChooseStageProps): ReactElement {
  const units = useLab((s) => s.settings.units);
  const preset = presetId ? PRESETS.find((p) => p.id === presetId) : undefined;
  const thumbs = useMemo(() => PRESETS.map((p) => makeDesign(p, presetPaper(p, { front: paper.front, back: paper.back }))), [paper.front, paper.back]);
  const blankPaper = useMemo(() => makePaper({ sizeId: paper.sizeId, front: paper.front, back: paper.back }), [paper.sizeId, paper.front, paper.back]);

  return (
    <div className="ppl-choose">
      <section className="ppl-choose__gallery" aria-labelledby="ppl-choose-title">
        {resume && onResume && (
          <div className="ppl-choose__resume">
            <PlaneThumb design={resume} size={84} view="top" />
            <div className="ppl-choose__resumetext">
              <span className="ppl-eyebrow">Your current plane</span>
              <strong>{resume.name}</strong>
            </div>
            <Button size="sm" icon="edit" onClick={onResume}>
              Reshape
            </Button>
          </div>
        )}
        <SectionHeader id="ppl-choose-title" title="What will you fold?" subtitle="Follow a classic step by step, or design your own." />
        <div className="ppl-choose__grid" role="radiogroup" aria-label="Plane to fold">
          {PRESETS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={presetId === p.id}
              className={cx('ppl-choose__opt', presetId === p.id && 'is-selected')}
              onClick={() => onSelect(p.id)}
            >
              <span className="ppl-choose__thumb">
                <PlaneThumb design={thumbs[i]!} size={112} />
              </span>
              <span className="ppl-choose__meta">
                <span className="ppl-choose__name">{p.name}</span>
                <span className="ppl-choose__tags">
                  <Tag tone={CATEGORY_TONE[p.category]}>{CATEGORY_NAME[p.category]}</Tag>
                  <Difficulty level={p.difficulty} />
                </span>
                <span className="ppl-choose__blurb">{p.blurb}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={presetId === null}
            className={cx('ppl-choose__opt', 'ppl-choose__opt--blank', presetId === null && 'is-selected')}
            onClick={() => onSelect(null)}
          >
            <span className="ppl-choose__thumb">
              <PaperPreview paper={blankPaper} size={64} />
            </span>
            <span className="ppl-choose__meta">
              <span className="ppl-choose__name">Blank sheet</span>
              <span className="ppl-choose__tags">
                <Tag tone="rose">Design your own</Tag>
              </span>
              <span className="ppl-choose__blurb">Fold freely with snapping, mirror folds and undo, then shape and trim it.</span>
            </span>
          </button>
        </div>
      </section>

      <section className="ppl-choose__paper" aria-labelledby="ppl-paper-title">
        <SectionHeader id="ppl-paper-title" title="Paper" subtitle={preset ? `${preset.name} folds on any size; ${preset.recommendedSizeId.toUpperCase()} is ideal.` : 'Size and colours of your sheet.'} />
        <PaperPicker value={paper} onChange={(p) => onPaper(paperForPreset(preset, p))} units={units} allowLandscape={!preset} />
      </section>
      <div className="ppl-choose__go">
        <Button variant="primary" size="lg" block icon="next" onClick={onStart}>
          {startLabel}
        </Button>
      </div>
    </div>
  );
}
