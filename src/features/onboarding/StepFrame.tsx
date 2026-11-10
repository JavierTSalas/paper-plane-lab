import type { ReactElement, ReactNode } from 'react';
import { cx } from '../../ui/cx';
import { useMediaQuery } from '../../ui/hooks';
import { ProfessorSays, type ProfessorPose } from '../../ui/Professor';
import type { Progress } from './progress';

/** What every step screen receives from the page. */
export interface StepProps {
  progress: Progress;
  update: (patch: Partial<Progress>) => void;
  next: () => void;
  /** Leave the intro for a route, saving the player's dart and flights when they exist. */
  finish: (path: string, name?: string) => void;
}

export interface StepFrameProps {
  pose: ProfessorPose;
  title?: ReactNode;
  /** What the Professor says. */
  children: ReactNode;
  /** The demonstration area: scene, fold, flight. */
  stage: ReactNode;
  /** Buttons; at the bottom on phones (thumb reach), under the Professor on desktop. */
  actions?: ReactNode;
  /** Extra content under the bubble (results, pickers). */
  extra?: ReactNode;
  className?: string;
}

/**
 * One intro screen. Phones: Professor and bubble on top, the stage in the middle, actions at the bottom.
 * From 900 px: the Professor in a side column with the actions, the stage centred beside him.
 */
export function StepFrame({ pose, title, children, stage, actions, extra, className }: StepFrameProps): ReactElement {
  const wide = useMediaQuery('(min-width: 900px)');
  return (
    <div className={cx('ppl-onb__step', className)}>
      <div className="ppl-onb__side">
        <ProfessorSays className="ppl-onb__says" pose={pose} title={title} live layout={wide ? 'stack' : 'row'} size={wide ? 168 : 76}>
          {children}
        </ProfessorSays>
        {extra && <div className="ppl-onb__extra">{extra}</div>}
        {actions && <div className="ppl-onb__actions">{actions}</div>}
      </div>
      <div className="ppl-onb__stage">{stage}</div>
    </div>
  );
}
