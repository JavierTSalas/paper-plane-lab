import { useEffect, useState, type ReactElement } from 'react';
import { useLocation } from 'wouter';
import { labStore, useLab } from '../../app/store';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ProfessorSays } from '../../ui/Professor';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/Toast';
import { cx } from '../../ui/cx';
import { ASSIGNMENTS, currentAssignment, getAssignment, newlyCompleted } from './assignments';

/** Records every assignment whose check passes, now and whenever the store changes. */
export function useAssignmentSync(): void {
  useEffect(() => {
    const run = (): void => {
      const s = labStore.getState();
      const ids = newlyCompleted(s);
      if (ids.length === 0) return;
      for (const id of ids) s.markAssignment(id);
      const first = getAssignment(ids[0]!);
      if (first) {
        toast({
          title: ids.length === 1 ? `Assignment done: ${first.title}` : `${ids.length} assignments done`,
          body: 'The Professor stamped your notebook.',
          tone: 'success',
          icon: 'star',
        });
      }
    };
    run();
    return labStore.subscribe(run);
  }, []);
}

/** A round ink stamp with a check mark, slightly askew. */
export function Stamp({ size = 36, index }: { size?: number; index: number }): ReactElement {
  const tilt = ((index * 37) % 21) - 10;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="ppl-stamp" style={{ transform: `rotate(${tilt}deg)` }}>
      <circle cx="20" cy="20" r="17" fill="var(--accent-wash)" stroke="var(--accent-ink)" strokeWidth="2" strokeDasharray="3 1.6" />
      <circle cx="20" cy="20" r="12.5" fill="none" stroke="var(--accent-ink)" strokeWidth="1.5" opacity="0.6" />
      <path d="M13.5 20.5 18 25l8.5-10" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Header card: Professor Wren and the current assignment, with the stamp strip. */
export function ProfessorDesk(): ReactElement {
  const done = useLab((s) => s.assignmentsDone);
  const name = useLab((s) => s.profile.name);
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const current = currentAssignment(done);
  const count = ASSIGNMENTS.filter((a) => done.includes(a.id)).length;

  return (
    <Card as="section" className="ppl-desk" aria-labelledby="ppl-desk-title">
      <p className="ppl-eyebrow" id="ppl-desk-title">
        The Professor&rsquo;s desk
      </p>
      {current ? (
        <ProfessorSays
          pose={count === 0 ? 'talk' : 'point'}
          title={current.title}
          className="ppl-desk__says"
          size={84}
          actions={
            <>
              <Button variant="primary" size="sm" iconRight="next" onClick={() => navigate(current.action.href)}>
                {current.action.label}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
                All assignments
              </Button>
            </>
          }
        >
          {count === 0 && name ? `Welcome to the lab, ${name}. ` : ''}
          {current.hint}
        </ProfessorSays>
      ) : (
        <ProfessorSays
          pose="cheer"
          title="Every assignment stamped"
          className="ppl-desk__says"
          size={84}
          actions={
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              See your notebook
            </Button>
          }
        >
          You have done everything I had on my list. The lab is yours now: chase a record, or fold something nobody has folded before.
        </ProfessorSays>
      )}

      <button type="button" className="ppl-desk__strip" onClick={() => setOpen(true)} aria-label={`Assignments: ${count} of ${ASSIGNMENTS.length} done. Show all.`}>
        <span className="ppl-desk__stamps" aria-hidden="true">
          {ASSIGNMENTS.map((a, i) =>
            done.includes(a.id) ? (
              <Stamp key={a.id} index={i} size={26} />
            ) : (
              <span key={a.id} className={cx('ppl-desk__slot', current?.id === a.id && 'is-current')}>
                {i + 1}
              </span>
            ),
          )}
        </span>
        <span className="ppl-caption ppl-num">
          {count} of {ASSIGNMENTS.length}
        </span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Assignments" description="Gentle goals from Professor Wren, in order. Each one teaches something.">
        <ol role="list" className="ppl-assign">
          {ASSIGNMENTS.map((a, i) => {
            const isDone = done.includes(a.id);
            const isCurrent = current?.id === a.id;
            return (
              <li key={a.id} className={cx('ppl-assign__item', isDone && 'is-done', isCurrent && 'is-current')}>
                <span className="ppl-assign__mark">{isDone ? <Stamp index={i} size={40} /> : <span className="ppl-assign__num ppl-num">{i + 1}</span>}</span>
                <span className="ppl-assign__text">
                  <span className="ppl-h3">{a.title}</span>
                  <span className="ppl-small ppl-muted">{isDone ? 'Done. Stamped.' : a.hint}</span>
                </span>
                {!isDone && (
                  <Button
                    size="sm"
                    variant={isCurrent ? 'primary' : 'secondary'}
                    onClick={() => {
                      setOpen(false);
                      navigate(a.action.href);
                    }}
                  >
                    Go
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </Sheet>
    </Card>
  );
}
