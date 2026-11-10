import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '../../ui/Button';
import { useReducedMotion } from '../../ui/motion';
import type { ProfessorPose } from '../../ui/Professor';
import { LabScene } from './LabScene';
import { HELLO } from './script';
import { StepFrame, type StepProps } from './StepFrame';

/** Step 1: the lab at golden hour; the Professor waves hello. */
export function HelloStep({ next }: StepProps): ReactElement {
  const reduced = useReducedMotion();
  // A wave (arms up, a little hop), then he settles into talking.
  const [pose, setPose] = useState<ProfessorPose>(reduced ? 'talk' : 'cheer');
  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => setPose('talk'), 1900);
    return () => window.clearTimeout(t);
  }, [reduced]);

  return (
    <StepFrame
      className="ppl-onb__step--hello"
      pose={pose}
      title={HELLO.title}
      stage={<LabScene className="ppl-onb__scene" />}
      extra={<p className="ppl-onb__note">{HELLO.sub}</p>}
      actions={
        <Button variant="primary" size="lg" block iconRight="next" onClick={next} autoFocus>
          Show me
        </Button>
      }
    >
      {HELLO.text}
    </StepFrame>
  );
}
