import { useId, useMemo, type MouseEvent, type ReactElement } from 'react';
import { usePlaneBuild } from '../../app/hooks';
import { useLab } from '../../app/store';
import { CardLink } from '../../ui/Card';
import { lengthParts, timeParts } from '../../ui/format';
import { Icon, type IconName } from '../../ui/icons';
import { PlaneView } from '../fold/view';
import { flyIntro, makePlayerDesign } from './flow';
import { GRADUATE } from './script';
import { StepFrame, type StepProps } from './StepFrame';

interface Door {
  path: string;
  icon: IconName;
  title: string;
  sub: string;
}

const DOORS: readonly Door[] = [
  {
    path: '/hangar',
    icon: 'hangar',
    title: 'Explore the plane library',
    sub: 'Classic designs, each with its story and folds.',
  },
  {
    path: '/fold?new=1',
    icon: 'fold',
    title: 'Design my own',
    sub: 'Fold anything; the lab works out how it flies.',
  },
  {
    path: '/fly',
    icon: 'fly',
    title: 'Go flying',
    sub: 'Gym, hangar, meadow and a windy cliff.',
  },
];

/** Step 6: graduation. Optional name, the player's dart on show, three doors into the lab. */
export function GraduateStep({ progress, update, finish }: StepProps): ReactElement {
  const units = useLab((s) => s.settings.units);
  const inputId = useId();
  const hintId = useId();
  const design = useMemo(() => makePlayerDesign(progress.planeId, progress.color ?? 'white'), [progress.planeId, progress.color]);
  const build = usePlaneBuild(design)!;
  // Best intro throw, re-simulated (still air, fixed seed) rather than stored.
  const best = useMemo(() => {
    let top: { distance: number; airtime: number } | null = null;
    for (const l of progress.throws) {
      const m = flyIntro(build.airframe, l).metrics;
      if (!top || m.distance > top.distance) top = { distance: m.distance, airtime: m.airtime };
    }
    return top;
  }, [build, progress.throws]);

  const go = (e: MouseEvent<HTMLAnchorElement>, path: string): void => {
    e.preventDefault();
    finish(path, progress.name);
  };

  const name = progress.name.trim();
  return (
    <StepFrame
      className="ppl-onb__step--graduate"
      pose="cheer"
      title={GRADUATE.title}
      stage={
        <div className="ppl-onb__cert">
          <span className="ppl-eyebrow">Lab member</span>
          <p className="ppl-onb__cert-name">{name || 'New lab member'}</p>
          {progress.color ? (
            <PlaneView model={build.model} paper={design.paper} yaw={35} pitch={24} backdrop className="ppl-onb__cert-plane" label="Your first dart" />
          ) : (
            <p className="ppl-onb__note">Your dart is still a flat sheet. Fold it whenever you like.</p>
          )}
          {best && (
            <p className="ppl-onb__cert-best ppl-num">
              <Icon name="distance" size={18} /> Best throw {lengthParts(best.distance, units).value} {lengthParts(best.distance, units).unit} ·{' '}
              {timeParts(best.airtime).value} {timeParts(best.airtime).unit}
            </p>
          )}
        </div>
      }
      extra={
        <div className="ppl-onb__name">
          <label htmlFor={inputId} className="ppl-onb__name-label">
            {GRADUATE.nameLabel}
          </label>
          <input
            id={inputId}
            className="ppl-onb__input"
            type="text"
            autoComplete="nickname"
            maxLength={40}
            placeholder="Optional"
            value={progress.name}
            aria-describedby={hintId}
            onChange={(e) => update({ name: e.target.value })}
          />
          <span id={hintId} className="ppl-onb__name-hint">
            {GRADUATE.nameHint}
          </span>
        </div>
      }
      actions={
        <nav className="ppl-onb__doors" aria-label="Where to next">
          {DOORS.map((d) => (
            <CardLink key={d.path} href={`#${d.path}`} padding="sm" className="ppl-onb__door" onClick={(e) => go(e, d.path)}>
              <span className="ppl-onb__door-row">
                <span className="ppl-onb__door-icon" aria-hidden="true">
                  <Icon name={d.icon} size={24} />
                </span>
                <span className="ppl-onb__door-text">
                  <span className="ppl-onb__door-title">{d.title}</span>
                  <span className="ppl-onb__door-sub">{d.sub}</span>
                </span>
                <Icon name="next" size={20} />
              </span>
            </CardLink>
          ))}
        </nav>
      }
    >
      {GRADUATE.text}
    </StepFrame>
  );
}
