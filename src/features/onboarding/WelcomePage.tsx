import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType, type ReactElement } from 'react';
import { useLocation } from 'wouter';
import { getPlaneBuild } from '../../app/hooks';
import { labStore, useLab } from '../../app/store';
import type { FlightSummary } from '../../app/types';
import { Button } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import { Stepper } from '../../ui/Stepper';
import {
  clearProgress,
  flyIntro,
  INTRO_CONDITIONS,
  INTRO_ENV_ID,
  loadProgress,
  makePlayerDesign,
  saveProgress,
  STEP_IDS,
  STEP_LABELS,
  type Progress,
  type StepId,
} from './flow';
import { HelloStep } from './HelloStep';
import { SKIP_LABEL } from './script';
import type { StepProps } from './StepFrame';
import './onboarding.css';

const loadFold = (): Promise<typeof import('./FoldSteps')> => import('./FoldSteps');
const loadFly = (): Promise<typeof import('./FlySteps')> => import('./FlySteps');
const loadGraduate = (): Promise<typeof import('./GraduateStep')> => import('./GraduateStep');

// The first screen paints without the fold renderer or three.js; later steps arrive in their own chunks.
const WatchFold = lazy(() => loadFold().then((m) => ({ default: m.WatchFold })));
const YourFold = lazy(() => loadFold().then((m) => ({ default: m.YourFold })));
const WatchThrow = lazy(() => loadFly().then((m) => ({ default: m.WatchThrow })));
const YourThrow = lazy(() => loadFly().then((m) => ({ default: m.YourThrow })));
const GraduateStep = lazy(() => loadGraduate().then((m) => ({ default: m.GraduateStep })));

const SCREENS: Record<StepId, ComponentType<StepProps>> = {
  hello: HelloStep,
  'watch-fold': WatchFold,
  'watch-throw': WatchThrow,
  'your-fold': YourFold,
  'your-throw': YourThrow,
  graduate: GraduateStep,
};

/** Warm the chunks of the next steps while the player reads. */
const PREFETCH: Partial<Record<StepId, () => Promise<unknown>>> = {
  hello: loadFold,
  'watch-fold': loadFly,
  'your-throw': loadGraduate,
};

/** Save the player's dart and log their intro throws (re-simulated: still air, fixed seed). */
function keepPlayerWork(p: Progress, name: string): void {
  if (!p.color) return;
  const s = labStore.getState();
  const design = makePlayerDesign(p.planeId, p.color, name || undefined);
  s.savePlane(design);
  s.selectPlane(design.id);
  if (p.throws.length === 0) return;
  const build = getPlaneBuild(design);
  const now = Date.now();
  p.throws.forEach((launch, i) => {
    const result = flyIntro(build.airframe, launch);
    const summary: FlightSummary = {
      id: `${p.planeId}-intro-${i}`,
      planeId: design.id,
      planeName: design.name,
      envId: INTRO_ENV_ID,
      conditions: INTRO_CONDITIONS,
      launch,
      seed: result.seed,
      metrics: result.metrics,
      diagnosisCodes: result.diagnosis.map((d) => d.code),
      at: new Date(now - (p.throws.length - 1 - i) * 1000).toISOString(),
    };
    s.logFlight(summary);
  });
}

/** Professor Wren's intro: hello, watch him fold and throw, fold and throw your own, graduate. */
export default function WelcomePage(): ReactElement {
  const completeOnboarding = useLab((s) => s.completeOnboarding);
  const [, navigate] = useLocation();
  const [progress, setProgress] = useState<Progress>(loadProgress);

  useEffect(() => saveProgress(progress), [progress]);

  const update = useCallback((patch: Partial<Progress>) => setProgress((p) => ({ ...p, ...patch })), []);
  const go = useCallback((step: number) => {
    setProgress((p) => ({ ...p, step, reached: Math.max(p.reached, step) }));
    window.scrollTo({ top: 0 });
  }, []);
  const next = useCallback(() => go(Math.min(STEP_IDS.length - 1, progress.step + 1)), [go, progress.step]);

  const finish = useCallback(
    (path: string, name?: string) => {
      const clean = (name ?? progress.name).trim();
      keepPlayerWork(progress, clean);
      completeOnboarding(clean || undefined);
      clearProgress();
      navigate(path);
    },
    [progress, completeOnboarding, navigate],
  );

  const id = STEP_IDS[progress.step] ?? 'hello';
  useEffect(() => {
    const prefetch = PREFETCH[id];
    if (!prefetch) return;
    const t = window.setTimeout(() => void prefetch().catch(() => undefined), 600);
    return () => window.clearTimeout(t);
  }, [id]);

  const Screen = SCREENS[id];
  return (
    <main className="ppl-onb" data-step={id}>
      <header className="ppl-onb__top">
        <Stepper
          className="ppl-onb__dots"
          label="Intro progress"
          count={STEP_IDS.length}
          index={progress.step}
          onIndexChange={go}
          maxReachable={progress.reached}
          stepLabels={STEP_IDS.map((s) => STEP_LABELS[s])}
        />
        <Button variant="ghost" size="sm" className="ppl-onb__skip" iconRight="next" onClick={() => finish('/hangar')}>
          {SKIP_LABEL}
        </Button>
      </header>
      <h1 className="ppl-sr-only">Welcome to Paper Plane Lab: {STEP_LABELS[id]}</h1>
      <Suspense
        fallback={
          <div className="ppl-onb__loading">
            <Spinner />
          </div>
        }
      >
        <Screen key={id} progress={progress} update={update} next={next} finish={finish} />
      </Suspense>
    </main>
  );
}
