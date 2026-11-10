import { getPlaneBuild } from '../../app/hooks';
import { labStore } from '../../app/store';
import type { FlightSummary } from '../../app/types';
import { flyIntro, INTRO_CONDITIONS, INTRO_ENV_ID, makePlayerDesign } from './flow';
import type { Progress } from './progress';

/** Save the player's dart and log their intro throws (re-simulated: still air, fixed seed). */
export function keepPlayerWork(p: Progress, name: string): void {
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
