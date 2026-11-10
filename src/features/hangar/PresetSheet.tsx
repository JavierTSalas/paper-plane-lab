import type { ReactElement } from 'react';
import { useLocation } from 'wouter';
import type { PlanePreset } from '../../core/designs';
import { getPaperSize } from '../../core/paper';
import { useLab } from '../../app/store';
import { getPlaneBuild } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { Tag } from '../../ui/Chip';
import { formatDeg, formatSpeed } from '../../ui/format';
import { Sheet } from '../../ui/Sheet';
import { PlaneView } from '../fold/view';
import { CATEGORY_LABEL, CATEGORY_STRENGTH, CATEGORY_TONE, presetDesign } from './catalog';

export function DifficultyDots({ level }: { level: 1 | 2 | 3 }): ReactElement {
  const word = level === 1 ? 'Easy' : level === 2 ? 'Medium' : 'Tricky';
  return (
    <span className="ppl-dots" role="img" aria-label={`Difficulty: ${word}`} title={`Difficulty: ${word}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= level ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export interface PresetSheetProps {
  preset: PlanePreset | null;
  onClose: () => void;
}

/** Story, strengths, throw hint and sources of a library plane, with "Fold this plane". */
export function PresetSheet({ preset, onClose }: PresetSheetProps): ReactElement {
  const units = useLab((s) => s.settings.units);
  const [, navigate] = useLocation();
  const design = preset ? presetDesign(preset.id) : undefined;
  const model = design ? getPlaneBuild(design).model : null;
  const byline = preset ? [preset.designer, preset.year].filter(Boolean).join(', ') : '';

  return (
    <Sheet
      open={preset !== null}
      onClose={onClose}
      size="md"
      title={preset?.name ?? ''}
      description={byline ? `Designed by ${byline}` : undefined}
      footer={
        preset && (
          <Button variant="primary" block icon="fold" onClick={() => navigate(`/fold?preset=${encodeURIComponent(preset.id)}`)}>
            Fold this plane
          </Button>
        )
      }
    >
      {preset && (
        <div className="ppl-stack ppl-preset">
          {model && (
            <div className="ppl-preset__hero">
              <PlaneView model={model} interactive aspect={16 / 9} label={`${preset.name}, drag to turn it`} />
            </div>
          )}
          <div className="ppl-row">
            <Tag tone={CATEGORY_TONE[preset.category]}>{CATEGORY_LABEL[preset.category]}</Tag>
            <DifficultyDots level={preset.difficulty} />
            <span className="ppl-caption">Best on {getPaperSize(preset.recommendedSizeId).name}</span>
            {preset.fidelity === 'approximate' && (
              <Tag tone="warn" icon="info">
                Approximate
              </Tag>
            )}
          </div>
          <p className="ppl-body">{preset.story}</p>

          <section className="ppl-preset__block">
            <h3 className="ppl-h3">What it is good at</h3>
            <p className="ppl-small">{CATEGORY_STRENGTH[preset.category]}</p>
          </section>

          <section className="ppl-preset__block">
            <h3 className="ppl-h3">How to throw it</h3>
            <p className="ppl-small">
              <span className="ppl-num">
                {formatSpeed(preset.throwHint.speed, units)} at {formatDeg(preset.throwHint.pitchDeg)}
              </span>{' '}
              above the horizon. {preset.throwHint.note}
            </p>
          </section>

          {preset.fidelity === 'approximate' && (
            <section className="ppl-preset__block">
              <h3 className="ppl-h3">An approximation</h3>
              <p className="ppl-small ppl-muted">
                {preset.fidelityNote ??
                  'The lab folds only simple, straight folds, so this plane is a close stand-in for the published design rather than an exact copy.'}
              </p>
            </section>
          )}

          {preset.sources.length > 0 && (
            <section className="ppl-preset__block">
              <h3 className="ppl-h3">Sources</h3>
              <ul className="ppl-preset__sources">
                {preset.sources.map((s) => (
                  <li key={s}>
                    <a href={s} target="_blank" rel="noopener noreferrer" className="ppl-small">
                      {hostOf(s)}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}
