import { useMemo, useState, type KeyboardEvent, type ReactElement } from 'react';
import { usePlaneBuild } from '../../app/hooks';
import { getPaperColor } from '../../core/paper';
import { Button } from '../../ui/Button';
import { PaperPreview, PaperSwatch } from '../../ui/paper';
import { GuidedFold } from '../fold';
import { FoldPlayer } from '../fold/view';
import { getWrenDesign, makePlayerDesign } from './flow';
import { PLAYER_COLORS } from './progress';
import { WATCH_FOLD, YOUR_FOLD } from './script';
import { StepFrame, type StepProps } from './StepFrame';

/** Step 2: the Professor folds his Classic Dart, one short line per step, then says why it works. */
export function WatchFold({ next }: StepProps): ReactElement {
  const design = getWrenDesign();
  const [segment, setSegment] = useState(0);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);
  const line = done ? WATCH_FOLD.why : (WATCH_FOLD.steps[segment] ?? WATCH_FOLD.intro);

  return (
    <StepFrame
      className="ppl-onb__step--watch-fold"
      pose={done ? 'point' : 'fold'}
      title={done ? 'That is the whole trick.' : WATCH_FOLD.title}
      stage={
        <FoldPlayer
          key={run}
          className="ppl-onb__player"
          design={design}
          mode="auto"
          speed={1.25}
          showControls={false}
          onStepChange={setSegment}
          onComplete={() => setDone(true)}
        />
      }
      actions={
        done ? (
          <>
            <Button
              variant="ghost"
              icon="replay"
              onClick={() => {
                setDone(false);
                setSegment(0);
                setRun((r) => r + 1);
              }}
            >
              Watch again
            </Button>
            <Button variant="primary" size="lg" iconRight="next" onClick={next}>
              Now throw it
            </Button>
          </>
        ) : (
          <Button variant="secondary" iconRight="next" onClick={next}>
            Skip ahead
          </Button>
        )
      }
    >
      {line}
    </StepFrame>
  );
}

/** Seven paper colours as one radio row. */
function SwatchRow({ value, onChange }: { value: string; onChange: (id: string) => void }): ReactElement {
  const index = Math.max(0, PLAYER_COLORS.indexOf(value as (typeof PLAYER_COLORS)[number]));
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const i = (index + delta + PLAYER_COLORS.length) % PLAYER_COLORS.length;
    onChange(PLAYER_COLORS[i]!);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[i]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Paper colour" className="ppl-onb__swatches" onKeyDown={onKey}>
      {PLAYER_COLORS.map((id, i) => (
        <PaperSwatch key={id} color={id} selected={id === value} focusable={i === index} onSelect={() => onChange(id)} />
      ))}
    </div>
  );
}

/** Step 4: pick a paper colour, then fold the same dart with the guided workbench. */
export function YourFold({ progress, update, next }: StepProps): ReactElement {
  const [choice, setChoice] = useState<string>(progress.color ?? 'sky');
  const color = progress.color;
  const design = useMemo(() => makePlayerDesign(progress.planeId, color ?? choice), [progress.planeId, color, choice]);
  const build = usePlaneBuild(design);
  const flatCount = build?.fold.frames.length ?? 5;

  if (!color) {
    return (
      <StepFrame
        className="ppl-onb__step--pick"
        pose="point"
        title={YOUR_FOLD.title}
        stage={
          <div className="ppl-onb__sheet">
            <PaperPreview paper={design.paper} size={220} />
          </div>
        }
        extra={
          <div className="ppl-onb__pick">
            <span className="ppl-onb__pick-name">{getPaperColor(choice).name}</span>
            <SwatchRow value={choice} onChange={setChoice} />
          </div>
        }
        actions={
          <Button variant="primary" size="lg" block iconRight="next" onClick={() => update({ color: choice, foldDone: 0 })}>
            Start folding
          </Button>
        }
      >
        {YOUR_FOLD.pick}
      </StepFrame>
    );
  }

  const done = progress.foldDone;
  const line = done >= flatCount ? YOUR_FOLD.shaping : (YOUR_FOLD.progress[done] ?? YOUR_FOLD.progress[YOUR_FOLD.progress.length - 1]!);
  return (
    <StepFrame
      className="ppl-onb__step--your-fold"
      pose={done >= flatCount ? 'cheer' : done === 0 ? 'point' : 'talk'}
      stage={<GuidedFold compact design={design} done={done} onDoneChange={(n) => update({ foldDone: n })} onComplete={next} finishLabel="Throw it" closingLine={YOUR_FOLD.folded} />}
      actions={
        done === 0 ? (
          <Button variant="ghost" size="sm" icon="back" onClick={() => update({ color: null })}>
            Other paper
          </Button>
        ) : undefined
      }
    >
      {line}
    </StepFrame>
  );
}
