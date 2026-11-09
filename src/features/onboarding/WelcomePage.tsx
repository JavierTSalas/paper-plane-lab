import type { ReactElement } from 'react';
import { useLocation } from 'wouter';
import { useLab } from '../../app/store';
import { Button } from '../../ui/Button';
import { ProfessorSays } from '../../ui/Professor';

/** Placeholder for the onboarding flow; the skip path is already real. */
export default function WelcomePage(): ReactElement {
  const completeOnboarding = useLab((s) => s.completeOnboarding);
  const [, navigate] = useLocation();
  const skip = (): void => {
    completeOnboarding();
    navigate('/hangar');
  };
  return (
    <main className="ppl-page" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <ProfessorSays
        pose="cheer"
        layout="stack"
        size={180}
        title="Welcome to the Paper Plane Lab!"
        actions={
          <Button variant="primary" iconRight="next" onClick={skip}>
            Skip intro
          </Button>
        }
      >
        I am Professor Wren. Soon I will fold a Classic Dart with you, step by step, and we will throw it together. The guided intro
        is still being built, so for now you can head straight into the lab.
      </ProfessorSays>
    </main>
  );
}
