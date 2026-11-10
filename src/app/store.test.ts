import { describe, expect, it } from 'vitest';
import { makePaper } from '../core/paper';
import { LOCAL_STORAGE_KEY } from '../core/leaderboard';
import type { FlightMetrics, PlaneDesign } from '../core/types';
import { FLY_SESSION_KEY } from '../features/fly/flight';
import { DRAFT_KEY } from '../features/fold/draft';
import { PROGRESS_KEY } from '../features/onboarding/progress';
import {
  FLIGHT_CAP,
  SIDE_LOCAL_KEYS,
  SIDE_SESSION_KEYS,
  STORAGE_KEY,
  STORE_VERSION,
  bestFlightsByPlane,
  clearSideStorage,
  createLabStore,
  initialData,
  memoryStorage,
  migrate,
  reduce,
  sanitize,
  selectCurrentPlane,
} from './store';
import type { FlightSummary } from './types';

function plane(id: string, name = id): PlaneDesign {
  return {
    v: 1,
    id,
    name,
    category: 'dart',
    paper: makePaper(),
    steps: [],
    shape: { keel: 'mountain', keelSpreadDeg: 20, wingLine: null, dihedralDeg: 5, wingletLine: null, wingletDeg: 0 },
    trim: { elevatorDeg: 0, elevatorChordFrac: 0.15, aileronDeg: 0, rudderDeg: 0, clip: null },
  };
}

const METRICS: FlightMetrics = {
  distance: 5,
  downrange: 5,
  lateral: 0,
  airtime: 2,
  maxHeight: 2,
  maxSpeed: 8,
  meanAirspeed: 6,
  pathLength: 6,
  glideRatio: 5,
  sinkRate: 1,
  glideAlpha: 0.1,
  glideSpeed: 6,
  stallCount: 0,
  landingSpeed: 5,
  reynolds: 40000,
};

function flight(id: string, planeId: string, distance: number, airtime = 2): FlightSummary {
  return {
    id,
    planeId,
    planeName: planeId,
    envId: 'classroom',
    conditions: { envId: 'classroom' },
    launch: { speed: 8, pitchDeg: 5, yawDeg: 0, rollDeg: 0, aoaDeg: 2 },
    seed: 1,
    metrics: { ...METRICS, distance, airtime },
    diagnosisCodes: ['clean-glide'],
    at: '2026-11-09T12:00:00.000Z',
  };
}

describe('reducers', () => {
  it('saves, selects, renames and deletes planes', () => {
    let d = reduce.savePlane(initialData(), plane('a', 'Dart'));
    d = reduce.savePlane(d, plane('b'));
    expect(d.currentPlaneId).toBe('b');
    d = reduce.selectPlane(d, 'a');
    expect(selectCurrentPlane(d)?.name).toBe('Dart');
    d = reduce.selectPlane(d, 'missing');
    expect(d.currentPlaneId).toBeNull();
    d = reduce.renamePlane(d, 'a', '  Swift   Arrow ');
    expect(d.planes.a!.name).toBe('Swift Arrow');
    expect(reduce.renamePlane(d, 'a', '   ')).toBe(d);
    d = reduce.selectPlane(d, 'a');
    d = reduce.deletePlane(d, 'a');
    expect(d.planes.a).toBeUndefined();
    expect(d.currentPlaneId).toBeNull();
  });

  it('merges trim and shape patches and replaces paper', () => {
    let d = reduce.savePlane(initialData(), plane('a'));
    d = reduce.updateTrim(d, 'a', { elevatorDeg: 6 });
    d = reduce.updateShape(d, 'a', { dihedralDeg: 10 });
    d = reduce.updatePaper(d, 'a', makePaper({ sizeId: 'letter', front: 'sky' }));
    const p = d.planes.a!;
    expect(p.trim.elevatorDeg).toBe(6);
    expect(p.trim.elevatorChordFrac).toBe(0.15);
    expect(p.shape.dihedralDeg).toBe(10);
    expect(p.shape.keel).toBe('mountain');
    expect(p.paper.sizeId).toBe('letter');
    expect(reduce.updateTrim(d, 'nope', { elevatorDeg: 1 })).toBe(d);
  });

  it('logs flights newest first, de-duplicates ids and caps the list', () => {
    let d = initialData();
    for (let i = 0; i < FLIGHT_CAP + 5; i++) d = reduce.logFlight(d, flight(`f${i}`, 'a', i));
    expect(d.flights).toHaveLength(FLIGHT_CAP);
    expect(d.flights[0]!.id).toBe(`f${FLIGHT_CAP + 4}`);
    d = reduce.logFlight(d, flight('f100', 'a', 1));
    expect(d.flights.filter((f) => f.id === 'f100')).toHaveLength(1);
    d = reduce.logFlight(d, flight('x', 'b', 1));
    expect(reduce.clearFlights(d, 'b').flights.some((f) => f.planeId === 'b')).toBe(false);
    expect(reduce.clearFlights(d).flights).toHaveLength(0);
  });

  it('handles profile, settings and assignments', () => {
    let d = reduce.completeOnboarding(initialData(), ' Ada ');
    expect(d.profile).toEqual({ name: 'Ada', onboarded: true });
    d = reduce.resetOnboarding(d);
    expect(d.profile).toEqual({ name: 'Ada', onboarded: false });
    d = reduce.completeOnboarding(d);
    expect(d.profile.name).toBe('Ada');
    d = reduce.setSetting(d, 'units', 'imperial');
    expect(d.settings.units).toBe('imperial');
    d = reduce.markAssignment(d, 'first-flight');
    expect(reduce.markAssignment(d, 'first-flight')).toBe(d);
  });

  it('picks the best flight per plane by metric', () => {
    const fs = [flight('1', 'a', 3, 4), flight('2', 'a', 7, 1), flight('3', 'b', 2, 2)];
    expect(bestFlightsByPlane(fs).a!.id).toBe('2');
    expect(bestFlightsByPlane(fs, 'airtime').a!.id).toBe('1');
    expect(bestFlightsByPlane(fs).b!.id).toBe('3');
  });
});

describe('persistence', () => {
  it('stores only data under the versioned key and rehydrates it', () => {
    const storage = memoryStorage();
    const store = createLabStore(storage);
    store.getState().savePlane(plane('a'));
    store.getState().setSetting('units', 'imperial');
    const raw = JSON.parse(storage.dump()[STORAGE_KEY]!) as { state: Record<string, unknown>; version: number };
    expect(raw.version).toBe(STORE_VERSION);
    expect(Object.keys(raw.state).sort()).toEqual(['assignmentsDone', 'currentPlaneId', 'flights', 'planes', 'profile', 'settings']);

    const again = createLabStore(storage);
    expect(again.getState().settings.units).toBe('imperial');
    expect(selectCurrentPlane(again.getState())?.id).toBe('a');
    again.getState().resetAll();
    expect(again.getState().planes).toEqual({});
    expect(typeof again.getState().savePlane).toBe('function');
  });

  it('salvages valid fields from damaged or old data', () => {
    const d = sanitize({
      profile: { name: 'Ada', onboarded: 'yes' },
      planes: { a: plane('a'), junk: { id: 1 } },
      currentPlaneId: 'junk',
      flights: [flight('1', 'a', 1), { nope: true }],
      settings: { units: 'imperial', showTrails: false },
      assignmentsDone: ['x', 3],
    });
    expect(d.profile).toEqual({ name: 'Ada', onboarded: false });
    expect(Object.keys(d.planes)).toEqual(['a']);
    expect(d.currentPlaneId).toBeNull();
    expect(d.flights).toHaveLength(1);
    expect(d.settings).toEqual({ units: 'imperial', reducedMotion: false, showTrails: false });
    expect(d.assignmentsDone).toEqual(['x']);
    expect(migrate(null, 0)).toEqual(initialData());
  });

  it('migrates an older stored version on load', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 0, state: { profile: { name: 'Old', onboarded: true } } }));
    const store = createLabStore(storage);
    expect(store.getState().profile).toEqual({ name: 'Old', onboarded: true });
    expect(store.getState().settings.units).toBe('metric');
  });
});

describe('reset progress', () => {
  it('knows the keys the features keep outside the store', () => {
    expect([...SIDE_LOCAL_KEYS].sort()).toEqual([PROGRESS_KEY, LOCAL_STORAGE_KEY].sort());
    expect([...SIDE_SESSION_KEYS].sort()).toEqual([DRAFT_KEY, FLY_SESSION_KEY].sort());
  });

  it('clears the intro progress, the local leaderboard and the session drafts, and nothing else', () => {
    const local = memoryStorage();
    const session = memoryStorage();
    for (const k of [PROGRESS_KEY, LOCAL_STORAGE_KEY, 'unrelated']) local.setItem(k, '1');
    for (const k of [DRAFT_KEY, FLY_SESSION_KEY, 'unrelated']) session.setItem(k, '1');
    clearSideStorage(local, session);
    expect(local.dump()).toEqual({ unrelated: '1' });
    expect(session.dump()).toEqual({ unrelated: '1' });
  });

  it('survives blocked or missing storage', () => {
    const blocked = {
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => clearSideStorage(blocked, null)).not.toThrow();
    // No window in this test environment: resetAll still resets the store.
    const store = createLabStore(memoryStorage());
    store.getState().savePlane(plane('a'));
    expect(() => store.getState().resetAll()).not.toThrow();
    expect(store.getState().planes).toEqual({});
  });
});
