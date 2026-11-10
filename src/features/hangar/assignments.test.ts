import { describe, expect, it } from 'vitest';
import { defaultDesign } from '../../core/designs';
import { defaultLaunch } from '../../core/sim';
import type { FlightMetrics } from '../../core/types';
import { initialData, type LabData } from '../../app/store';
import type { FlightSummary } from '../../app/types';
import { ASSIGNMENTS, currentAssignment, newlyCompleted } from './assignments';

const metrics = (distance: number, airtime: number): FlightMetrics => ({
  distance, downrange: distance, lateral: 0, airtime, maxHeight: 2, maxSpeed: 8, meanAirspeed: 6, pathLength: distance,
  glideRatio: null, sinkRate: null, glideAlpha: null, glideSpeed: null, stallCount: 0, landingSpeed: 5, reynolds: 3e4,
});

function flight(envId: string, distance: number, airtime: number, codes: FlightSummary['diagnosisCodes'] = [], windSpeed?: number): FlightSummary {
  return {
    id: `${envId}-${distance}-${airtime}`, planeId: 'p', planeName: 'P', envId,
    conditions: { envId, ...(windSpeed !== undefined ? { windSpeed } : {}) },
    launch: defaultLaunch(), seed: 1, metrics: metrics(distance, airtime), diagnosisCodes: codes, at: '2026-01-01T00:00:00Z',
  };
}

describe('assignments', () => {
  it('has unique ids and starts with the first fold', () => {
    expect(new Set(ASSIGNMENTS.map((a) => a.id)).size).toBe(ASSIGNMENTS.length);
    expect(currentAssignment([])?.id).toBe('first-fold');
    expect(newlyCompleted(initialData())).toEqual([]);
  });

  it('checks the store', () => {
    const plane = defaultDesign();
    const d: LabData = {
      ...initialData(),
      planes: { [plane.id]: plane, g: { ...plane, id: 'g', category: 'glider' }, c: { ...plane, id: 'c', category: 'custom', presetId: undefined } },
      flights: [flight('gym', 11, 2, ['clean-glide']), flight('classroom', 3, 4.2), flight('meadow', 5, 2, [], 2.5)],
    };
    expect(newlyCompleted(d).sort()).toEqual(['airtime-4s', 'clean-glide', 'first-fold', 'fold-glider', 'gym-10m', 'outdoor-breeze', 'own-design'].sort());
  });

  it('needs a real breeze outdoors and ten metres in the gym', () => {
    const d: LabData = { ...initialData(), flights: [flight('meadow', 5, 2, [], 0), flight('gym', 9.9, 2), flight('hangar', 30, 3)] };
    expect(newlyCompleted(d)).toEqual([]);
  });

  it('marked-only goals read assignmentsDone; current skips done ones', () => {
    const d: LabData = { ...initialData(), assignmentsDone: ['first-fold', 'try-tunnel'] };
    expect(newlyCompleted(d)).toEqual([]);
    expect(currentAssignment(d.assignmentsDone)?.id).toBe('gym-10m');
  });
});
