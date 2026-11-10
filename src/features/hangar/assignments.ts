import { getEnvironment } from '../../core/env';
import type { LabData } from '../../app/store';
import type { FlightSummary } from '../../app/types';

/**
 * The Professor's assignments: a short, ordered list of gentle goals. Each check is a pure function of the
 * stored lab data. Goals that leave no trace in the store (visiting the tunnel, entering a ranking, beating a
 * benchmark) are marked by the screen where they happen and their check reads `assignmentsDone`.
 */
export interface Assignment {
  id: AssignmentId;
  title: string;
  /** One or two sentences in the Professor's voice. */
  hint: string;
  /** Where to go to work on it. */
  action: { label: string; href: string };
  check: (d: LabData) => boolean;
}

export type AssignmentId =
  | 'first-fold'
  | 'gym-10m'
  | 'clean-glide'
  | 'fold-glider'
  | 'airtime-4s'
  | 'try-tunnel'
  | 'outdoor-breeze'
  | 'enter-ranking'
  | 'own-design'
  | 'beat-benchmark';

/** A breeze outdoors: at least this mean wind, m/s. */
export const BREEZE_MIN = 1;
export const GYM_DISTANCE = 10;
export const LONG_AIRTIME = 4;

const marked = (id: AssignmentId) => (d: LabData): boolean => d.assignmentsDone.includes(id);
const anyFlight = (d: LabData, test: (f: FlightSummary) => boolean): boolean => d.flights.some(test);

function isBreezyOutdoor(f: FlightSummary): boolean {
  const env = getEnvironment(f.envId);
  if (env.indoor) return false;
  const wind = f.conditions.windSpeed ?? env.wind.speed;
  return wind >= BREEZE_MIN;
}

export const ASSIGNMENTS: readonly Assignment[] = [
  {
    id: 'first-fold',
    title: 'Fold your first plane',
    hint: 'Every record starts with one sheet. Pick a plane from the library and fold it along with me.',
    action: { label: 'Fold a plane', href: '/fold' },
    check: (d) => Object.keys(d.planes).length > 0,
  },
  {
    id: 'gym-10m',
    title: `Fly ${GYM_DISTANCE} m in the gym`,
    hint: 'Take your plane to the gymnasium and send it ten metres, about a third of a basketball court.',
    action: { label: 'Go fly', href: '/fly' },
    check: (d) => anyFlight(d, (f) => f.envId === 'gym' && f.metrics.distance >= GYM_DISTANCE),
  },
  {
    id: 'clean-glide',
    title: 'Trim a plane to a clean glide',
    hint: 'Bend the trailing edges a touch until the plane settles into a smooth, straight glide.',
    action: { label: 'Go fly', href: '/fly' },
    check: (d) => anyFlight(d, (f) => f.diagnosisCodes.includes('clean-glide')),
  },
  {
    id: 'fold-glider',
    title: 'Fold a glider',
    hint: 'Darts are fast. Gliders are patient. Fold one with broad wings and feel the difference.',
    action: { label: 'See the gliders', href: '/hangar?category=glider' },
    check: (d) => Object.values(d.planes).some((p) => p.category === 'glider'),
  },
  {
    id: 'airtime-4s',
    title: `Stay up ${LONG_AIRTIME} seconds`,
    hint: 'Throw gently upward and let a floaty plane take its time coming down.',
    action: { label: 'Go fly', href: '/fly' },
    check: (d) => anyFlight(d, (f) => f.metrics.airtime >= LONG_AIRTIME),
  },
  {
    id: 'try-tunnel',
    title: 'Try the wind tunnel',
    hint: 'Hold your plane in a steady wind and watch where the forces push. It explains every flight.',
    action: { label: 'Open the tunnel', href: '/tunnel' },
    check: marked('try-tunnel'),
  },
  {
    id: 'outdoor-breeze',
    title: 'Fly outdoors in a breeze',
    hint: 'Real air moves. Take a plane to the meadow or the hill with a little wind and see how it copes.',
    action: { label: 'Go fly', href: '/fly' },
    check: (d) => anyFlight(d, isBreezyOutdoor),
  },
  {
    id: 'enter-ranking',
    title: 'Enter a ranking',
    hint: 'Fly in the record hangar under the arena rules and put your name on a board.',
    action: { label: 'See the ranks', href: '/ranks' },
    check: marked('enter-ranking'),
  },
  {
    id: 'own-design',
    title: 'Design your own plane',
    hint: 'Start from a blank sheet and fold whatever you like. The lab will tell you what it resembles.',
    action: { label: 'Start a design', href: '/fold?new=1' },
    check: (d) => Object.values(d.planes).some((p) => p.category === 'custom' || p.presetId === undefined),
  },
  {
    id: 'beat-benchmark',
    title: 'Beat a lab benchmark',
    hint: 'Each library plane has a reference flight on every board. Out-fly one of them in a ranked throw.',
    action: { label: 'See the ranks', href: '/ranks' },
    check: marked('beat-benchmark'),
  },
];

export function getAssignment(id: string): Assignment | undefined {
  return ASSIGNMENTS.find((a) => a.id === id);
}

/** Ids whose checks pass now but are not recorded yet. */
export function newlyCompleted(d: LabData): AssignmentId[] {
  return ASSIGNMENTS.filter((a) => !d.assignmentsDone.includes(a.id) && a.check(d)).map((a) => a.id);
}

/** The first assignment not done yet, in order; null when all are done. */
export function currentAssignment(done: readonly string[]): Assignment | null {
  return ASSIGNMENTS.find((a) => !done.includes(a.id)) ?? null;
}
