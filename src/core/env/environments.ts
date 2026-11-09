/**
 * The places a plane can be flown: the physical side only (air, wind, room, ground).
 * Values: docs/research/03-wind-atmosphere.md section 8 unless a comment says otherwise.
 */
import type { Environment, RoomBounds, Vec3 } from '../types';

/** Standard sea-level pressure, Pa (doc 03 sections 1.1 and 8: every environment is at 101 325 Pa). */
const PRESSURE = 101_325;
/** Release height of an adult's overhand throw above the ground, metres (doc 02 section 5). */
export const RELEASE_HEIGHT = 1.8;
/** The thrower stands this far in from the back wall, on the room's centreline, metres (design choice). */
const BACK_WALL_GAP = 1.5;

const LAUNCH: Vec3 = [0, RELEASE_HEIGHT, 0];

/** Room of the given length (along the throw), width and height with the thrower near the back wall. */
const room = (length: number, width: number, height: number): RoomBounds => ({
  xMin: -BACK_WALL_GAP,
  xMax: length - BACK_WALL_GAP,
  zMin: -width / 2,
  zMax: width / 2,
  ceiling: height,
});

export const ENVIRONMENTS: readonly Environment[] = [
  {
    id: 'classroom',
    name: 'Classroom',
    blurb: 'Desks pushed aside, windows shut: nine quiet metres to the blackboard.',
    indoor: true,
    bounds: room(9, 7, 3),
    terrain: { kind: 'flat' },
    tempC: 21,
    pressurePa: PRESSURE,
    humidity: 0.4,
    // Occupied-room air: 0.05 m/s draft, gusts 0.04 / 0.04 / 0.03 m/s with a 1 m length scale.
    wind: {
      speed: 0.05,
      towardDeg: null,
      roughness: 0,
      turbulence: { sigma: [0.04, 0.04, 0.03], length: 1 },
      gustiness: 0,
      thermals: [],
    },
    adjustableWind: false,
    maxWind: 0,
    launch: LAUNCH,
  },
  {
    id: 'gym',
    name: 'Gymnasium',
    blurb: 'A school gym after hours, with a high ceiling and room for a proper throw.',
    indoor: true,
    bounds: room(40, 25, 8),
    terrain: { kind: 'flat' },
    tempC: 18,
    pressurePa: PRESSURE,
    humidity: 0.45,
    // 0.10 m/s draft, gusts 0.05 / 0.05 / 0.04 m/s with a 3 m length scale.
    wind: {
      speed: 0.1,
      towardDeg: null,
      roughness: 0,
      turbulence: { sigma: [0.05, 0.05, 0.04], length: 3 },
      gustiness: 0,
      thermals: [],
    },
    adjustableWind: false,
    maxWind: 0,
    launch: LAUNCH,
  },
  {
    id: 'hangar',
    name: 'Record Hangar',
    blurb: 'A vast, still hall where the doors stay closed and records are set.',
    indoor: true,
    // Long enough for the 98.43 m distance record and high enough for a record time-aloft climb
    // (peak 11 - 22 m, doc 02 sections 5 and 6.2).
    bounds: room(120, 60, 25),
    terrain: { kind: 'flat' },
    tempC: 18,
    pressurePa: PRESSURE,
    humidity: 0.45,
    // The gymnasium's air with a longer length scale for the bigger hall (5 m: design choice, no data).
    wind: {
      speed: 0.1,
      towardDeg: null,
      roughness: 0,
      turbulence: { sigma: [0.05, 0.05, 0.04], length: 5 },
      gustiness: 0,
      thermals: [],
    },
    adjustableWind: false,
    maxWind: 0,
    launch: LAUNCH,
  },
  {
    id: 'meadow',
    name: 'Calm Meadow',
    blurb: 'Short grass, a light breeze at your back and one lazy thermal rising off the warm ground.',
    indoor: false,
    bounds: null,
    terrain: { kind: 'flat' },
    tempC: 24,
    pressurePa: PRESSURE,
    humidity: 0.5,
    // U10 = 1.5 m/s over open grass (z0 = 0.03 m); one thermal with w* = 1.5 m/s under a 1000 m layer.
    // The thermal's place, a few metres ahead and a little right of the throw line, is a design choice.
    wind: {
      speed: 1.5,
      towardDeg: 0,
      roughness: 0.03,
      turbulence: null,
      gustiness: 0.5,
      thermals: [{ x: 18, z: 2, wStar: 1.5, mixedLayerHeight: 1000 }],
    },
    adjustableWind: true,
    maxWind: 6,
    launch: LAUNCH,
  },
  {
    id: 'hill',
    name: 'Breezy Hill',
    blurb: 'A grassy slope facing the wind, where the air climbs the hill and can carry a plane with it.',
    indoor: false,
    bounds: null,
    // Cosine ridges 15 m high and 75 m from crest to valley (steepest slope 17 degrees). The thrower stands
    // on the windward slope 20 m below the crest, where the lift is already strong (design choice).
    terrain: { kind: 'hill', height: 15, halfWidth: 75, crestX: -20 },
    tempC: 15,
    pressurePa: PRESSURE,
    humidity: 0.6,
    // Wind over grass, blowing up the slope into the thrower's face. Doc 03 section 8 lists U10 = 4.5 m/s;
    // the default here is 3.5 m/s (still Beaufort 3). At 4.5 m/s the wind at head height plus the gusts
    // matches the airspeed of a single-sheet plane and every test plane was blown back over the thrower.
    wind: { speed: 3.5, towardDeg: 180, roughness: 0.03, turbulence: null, gustiness: 0.5, thermals: [] },
    adjustableWind: true,
    maxWind: 9,
    launch: LAUNCH,
  },
  {
    id: 'cliff',
    name: 'Coastal Cliff',
    blurb: 'A cliff top above the sea: the onshore wind sweeps up the face and the water is a long way down.',
    indoor: false,
    bounds: null,
    // 25 m cliff with a rounded top (the wind field is the flow round a half cylinder, so the ground is that
    // cylinder). The thrower stands on the shoulder, 8 m out from where the top stops being flat: from further
    // back, every plane landed on the nearly level ground in front of the thrower (design choice).
    terrain: { kind: 'cliff', height: 25, edgeX: -8 },
    tempC: 16,
    pressurePa: PRESSURE,
    humidity: 0.8,
    // Onshore wind over open water (z0 = 0.0002 m). Doc 03 section 8 lists U10 = 4 m/s; the default here is
    // 2.5 m/s. The flow round the cliff top runs at almost twice the profile speed, so at 4 m/s the air at the
    // lip moves faster than a paper plane flies and nothing thrown from the top gets out to sea.
    wind: { speed: 2.5, towardDeg: 180, roughness: 0.0002, turbulence: null, gustiness: 0.5, thermals: [] },
    adjustableWind: true,
    maxWind: 9,
    launch: LAUNCH,
  },
];

export const DEFAULT_ENVIRONMENT_ID = 'classroom';

/** The environment with the given id; the classroom when the id is unknown (stored data may be stale). */
export function getEnvironment(id: string): Environment {
  return ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0];
}
