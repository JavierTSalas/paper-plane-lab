/**
 * The Professor's reading of a flight: rule-based, from the output samples alone, with the virtual tunnel's
 * trim analysis to ground the "why".
 *
 * The thresholds in this file are judgement calls about what a person watching the flight would call a dive,
 * a stall or a spiral; they are not measured values. Each is named and explained where it is defined.
 * Texts use metric units (the Professor speaks SI).
 */
import { STANDARD_GRAVITY } from '../airframe';
import { DEG } from '../math';
import { analyzeTrim } from '../tunnel';
import { airFrom } from '../wind';
import type { Airframe, Diagnosis, DiagnosisCode, Environment, FlightResult, Launch, TrimAnalysis } from '../types';

/** Share of its weight the air must have carried, averaged over the flight, for it to count as flying at all. */
const UNSUPPORTED_BELOW = 0.4;
/** The same for a plane that has no trimmed glide at all: it only stays up while the throw's speed lasts. */
const UNTRIMMED_BELOW = 0.8;
/** An unsupported flight from a throw at least this hard is a thrown arc, not a dive, m/s (above the casual band of doc 02 section 5). */
const BALLISTIC_FROM_SPEED = 12;
/** Thrown below this fraction of its glide speed, a plane cannot carry its weight (lift goes with speed squared: 56 %). */
const TOO_SLOW_RATIO = 0.75;
/** Thrown above this multiple of its glide speed, the surplus lift dominates the first second. */
const TOO_FAST_RATIO = 1.3;
/** Stalled for at least this share of the flight = mushing. */
const MUSH_FRACTION = 0.35;
/** A climb or dip counts toward porpoising when it is at least this high, metres. */
const HUMP_HEIGHT = 0.1;
/** Air-relative heading change that makes a spiral / a veer, radians. */
const SPIRAL_TURN = 150 * DEG;
const VEER_TURN = 35 * DEG;
/** Bank that counts as rolled over, radians. */
const ROLL_OFF_BANK = 50 * DEG;
/** Sideways drift, as a share of the distance flown, that counts as veering off. */
const VEER_DRIFT = 0.35;
/** Heading is only tracked while the plane moves at least this fast over level ground, m/s. */
const MIN_TRACK_SPEED = 1;
/** Largest believable heading change between two samples, radians: more is the velocity passing through zero. */
const MAX_HEADING_STEP = 30 * DEG;
/** Loop: upside down by more than this (cosine of the angle between body-up and world-up) ... */
const INVERTED_BELOW = -0.3;
/** ... reached by pitching up at least this far with less than this much roll, radians. */
const LOOP_MIN_PITCH = 1.5;
const LOOP_MAX_ROLL = 1.0;
/** Wind counts as having carried the flight when it moved the air this far, metres and share of the path. */
const WIND_MIN_DRIFT = 2;
const WIND_DRIFT_SHARE = 0.25;
/** Rising air counts when it lifted the surrounding air by this much during the flight, metres ... */
const WIND_MIN_LIFT = 1;
/** ... and it is the headline when it made up at least this share of the plane's sink through the air. */
const WIND_LIFT_SHARE = 0.25;
/** The Professor makes at most this many remarks about one flight. */
const MAX_DIAGNOSES = 3;

interface Reading {
  airtime: number;
  /** Mean vertical force of the air over the weight: 1 = carried, 0 = free fall. */
  support: number;
  stalledFraction: number;
  endsStalled: boolean;
  humps: number;
  /** Total change of heading through the air, radians; positive = to the right. */
  turn: number;
  /** Bank of largest size during the flight and at its end, radians; positive = right wing down. */
  maxBank: number;
  endBank: number;
  looped: boolean;
  tumbled: boolean;
  /** Horizontal distance the air itself moved during the flight, metres, and how far it rose. */
  windDrift: number;
  windLift: number;
  meanWind: number;
  /** Airspeed at release, m/s. */
  launchAirspeed: number;
  /** Largest load factor seen in the first second (lift over weight). */
  peakLoad: number;
}

function read(result: FlightResult, airframe: Airframe, stallAngle: number): Reading {
  const samples = result.samples;
  const n = samples.length;
  const first = samples[0];
  const last = samples[n - 1];
  const airtime = last.t - first.t;
  const g = STANDARD_GRAVITY;
  const weight = airframe.mass * g;

  let stalledTime = 0;
  let turn = 0;
  let maxBank = 0;
  let pitch = 0;
  let roll = 0;
  let looped = false;
  let driftX = 0;
  let driftZ = 0;
  let windLift = 0;
  let windTime = 0;
  let peakLoad = 0;
  let heading: number | null = null;
  // Humps: alternate between waiting for a rise and waiting for a fall of HUMP_HEIGHT.
  let humps = 0;
  let low = first.pos[1];
  let high = first.pos[1];
  let rising = false;

  const bankOf = (q: readonly number[]): number =>
    Math.atan2(-2 * (q[1] * q[2] - q[3] * q[0]), 1 - 2 * (q[0] * q[0] + q[2] * q[2]));

  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const dt = i > 0 ? s.t - samples[i - 1].t : 0;
    if (i > 0) {
      const p = samples[i - 1];
      if (Math.abs(s.alpha) > stallAngle && s.airspeed > 0) stalledTime += dt;
      pitch += 0.5 * (p.omega[2] + s.omega[2]) * dt;
      roll += 0.5 * (p.omega[0] + s.omega[0]) * dt;
      driftX += 0.5 * (p.wind[0] + s.wind[0]) * dt;
      driftZ += 0.5 * (p.wind[2] + s.wind[2]) * dt;
      windLift += 0.5 * (p.wind[1] + s.wind[1]) * dt;
      windTime += 0.5 * (Math.hypot(p.wind[0], p.wind[2]) + Math.hypot(s.wind[0], s.wind[2])) * dt;
    }
    const upY = 1 - 2 * (s.quat[0] * s.quat[0] + s.quat[2] * s.quat[2]);
    if (upY < INVERTED_BELOW && pitch > LOOP_MIN_PITCH && Math.abs(roll) < LOOP_MAX_ROLL) looped = true;
    const bank = bankOf(s.quat);
    if (Math.abs(bank) > Math.abs(maxBank)) maxBank = bank;

    const ax = s.vel[0] - s.wind[0];
    const az = s.vel[2] - s.wind[2];
    if (Math.hypot(ax, az) > MIN_TRACK_SPEED) {
      const h = Math.atan2(az, ax);
      if (heading !== null) {
        let d = h - heading;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        if (Math.abs(d) < MAX_HEADING_STEP) turn += d;
      }
      heading = h;
    } else {
      heading = null;
    }

    if (s.t <= 1) {
      const lift = 0.5 * airframe.ref.area * s.airspeed * s.airspeed * s.cl;
      // Density cancels to within a few percent between environments; 1.2 kg/m³ is enough for a ratio in a sentence.
      peakLoad = Math.max(peakLoad, (1.2 * lift) / weight);
    }

    const y = s.pos[1];
    if (rising) {
      if (y > high) high = y;
      if (high - y >= HUMP_HEIGHT) {
        humps++;
        rising = false;
        low = y;
      }
    } else {
      if (y < low) low = y;
      if (y - low >= HUMP_HEIGHT) {
        rising = true;
        high = y;
      }
    }
  }

  return {
    airtime,
    support: airtime > 0 ? 1 + (last.vel[1] - first.vel[1]) / (g * airtime) : 1,
    stalledFraction: airtime > 0 ? stalledTime / airtime : 0,
    endsStalled: Math.abs(last.alpha) > stallAngle,
    humps,
    turn,
    maxBank,
    endBank: bankOf(last.quat),
    looped,
    tumbled: result.events.some((e) => e.kind === 'tumble'),
    windDrift: Math.hypot(driftX, driftZ),
    windLift,
    meanWind: airtime > 0 ? windTime / airtime : 0,
    launchAirspeed: first.airspeed,
    peakLoad,
  };
}

/** The bends the plane carries, read back from its elements. */
function bendsOf(airframe: Airframe): { elevatorMm: number; uneven: boolean } {
  let left = 0;
  let right = 0;
  let leftArea = 0;
  let rightArea = 0;
  let edge = 0;
  let edgeArea = 0;
  let rudder = false;
  for (const e of airframe.elements) {
    if (e.bendFrac <= 0) continue;
    if (e.role === 'fuselage') {
      if (e.bendRad !== 0) rudder = true;
      continue;
    }
    if (e.role !== 'wing' && e.role !== 'center') continue;
    const z = e.le[2] + 0.5 * e.chord * e.chordDir[2];
    if (z >= 0) {
      right += e.bendRad * e.area;
      rightArea += e.area;
    } else {
      left += e.bendRad * e.area;
      leftArea += e.area;
    }
    // Height of the bent edge above the wing surface.
    edge += e.bendFrac * e.chord * Math.sin(e.bendRad) * e.area;
    edgeArea += e.area;
  }
  const l = leftArea > 0 ? left / leftArea : 0;
  const r = rightArea > 0 ? right / rightArea : 0;
  return {
    elevatorMm: edgeArea > 0 ? (1000 * edge) / edgeArea : 0,
    uneven: rudder || Math.abs(l - r) > 0.2 * DEG,
  };
}

const f1 = (x: number): string => x.toFixed(1);
const f0 = (x: number): string => Math.round(x).toFixed(0);
const pct = (x: number): string => f0(100 * x);

interface Context {
  result: FlightResult;
  airframe: Airframe;
  launch: Launch;
  env: Environment;
  trim: TrimAnalysis;
  r: Reading;
  stallDeg: number;
  bends: { elevatorMm: number; uneven: boolean };
}

/** "left" / "right" for a signed quantity whose positive sense is to the right. */
const sideOf = (x: number): string => (x >= 0 ? 'right' : 'left');

function marginText(trim: TrimAnalysis): string {
  const size = f0(Math.abs(trim.staticMarginPct));
  return trim.staticMarginPct >= 0
    ? `${size} % of the wing chord ahead of the neutral point`
    : `${size} % of the wing chord behind the neutral point`;
}

/** Up-bend to suggest when the plane needs more nose-up trim, millimetres. */
const bendUpAdvice = (c: Context): string =>
  c.bends.elevatorMm > 0.5
    ? `Bend both trailing edges up a little more, about ${f0(Math.max(1, 0.5 * c.bends.elevatorMm))} mm, and throw again.`
    : 'Bend both trailing edges up about 2 mm, and throw again.';

const bendDownAdvice = (c: Context): string =>
  c.bends.elevatorMm > 1
    ? `Flatten the up-bend of the trailing edges by about ${f0(Math.max(1, 0.5 * c.bends.elevatorMm))} mm, or slide a paper clip onto the nose.`
    : 'Move weight forward: slide a paper clip onto the nose, or fold the nose over once more.';

const WRITERS: Record<DiagnosisCode, (c: Context) => Diagnosis> = {
  'clean-glide': (c) => {
    const m = c.result.metrics;
    const what =
      m.glideSpeed !== null && m.glideRatio !== null
        ? `A clean glide: it settled at ${f1(m.glideSpeed)} m/s and covered ${f1(m.distance)} m in ${f1(m.airtime)} s.`
        : `A clean flight: ${f1(m.distance)} m in ${f1(m.airtime)} s.`;
    const why =
      c.trim.trimmable && c.trim.glideRatio !== null
        ? `The centre of gravity sits ${marginText(c.trim)}, and the trim balances it at a glide ratio of about ${f1(c.trim.glideRatio)}.`
        : 'The throw matched the plane: it kept its nose on the flight path all the way down.';
    return { code: 'clean-glide', what, why, fix: '' };
  },

  'nose-dive': (c) => {
    const { trim, launch, r } = c;
    let why: string;
    if (!trim.trimmable) {
      why = `The centre of gravity sits ${marginText(trim)} and nothing lifts the nose against it, so the wing meets the air edge-on and makes almost no lift.`;
    } else if (trim.speed !== null && trim.speed > launch.speed * (1 / TOO_SLOW_RATIO)) {
      why = `This trim only carries the plane at ${f1(trim.speed)} m/s; at ${f1(r.launchAirspeed)} m/s the wing held up about ${pct(Math.max(0, r.support))} % of the weight.`;
    } else {
      why = `Over the flight the wing carried only about ${pct(Math.max(0, r.support))} % of the weight, so the path bent down faster than the plane could follow.`;
    }
    return {
      code: 'nose-dive',
      what: `The nose dropped and it dived into the ground after ${f1(c.result.metrics.distance)} m.`,
      why,
      fix: bendUpAdvice(c),
    };
  },

  'stall-mush': (c) => {
    const { trim, r, launch } = c;
    let why: string;
    let fix: string;
    if (!trim.pitchStable) {
      why = `The centre of gravity sits ${marginText(trim)}, so once the nose rises nothing brings it back and the wing stalls.`;
      fix = 'Move weight forward: slide a paper clip onto the nose, or fold the nose over once more.';
    } else if (launch.pitchDeg > 25 && r.launchAirspeed < 1.5 * (trim.speed ?? r.launchAirspeed)) {
      why = `Thrown ${f0(launch.pitchDeg)}° upward, it ran out of speed on the climb and the wing passed its stall angle of ${f0(c.stallDeg)}°.`;
      fix = 'Throw flatter: aim just above the horizon.';
    } else {
      why = `The wing spent ${pct(r.stalledFraction)} % of the flight beyond its stall angle of ${f0(c.stallDeg)}°: much drag, little lift.`;
      fix = bendDownAdvice(c);
    }
    const what =
      r.stalledFraction >= MUSH_FRACTION
        ? 'It reared up, lost its speed and mushed down nose-high.'
        : 'It climbed until the speed was gone, stalled and dropped.';
    return { code: 'stall-mush', what, why, fix };
  },

  porpoise: (c) => {
    const { trim, r } = c;
    const swoops = Math.max(2, r.humps, c.result.metrics.stallCount);
    const fast = trim.speed !== null && r.launchAirspeed > TOO_FAST_RATIO * trim.speed;
    return {
      code: 'porpoise',
      what: `It swooped up and dipped ${swoops} times, like a porpoise.`,
      why:
        fast && trim.speed !== null
          ? `It glides at ${f1(trim.speed)} m/s but left your hand at ${f1(r.launchAirspeed)} m/s, so the surplus lift swung it up until the speed was gone, again and again.`
          : `Its trim asks for more lift than the wing can hold steadily, so it climbs, stalls at ${f0(c.stallDeg)}° and dips to pick up speed.`,
      fix:
        fast && trim.speed !== null
          ? `Throw gentler and flatter, close to ${f1(trim.speed)} m/s.`
          : bendDownAdvice(c),
    };
  },

  loop: (c) => {
    const { trim, r } = c;
    const what = 'It pulled up, went over on its back and looped.';
    if (!trim.pitchStable) {
      return {
        code: 'loop',
        what,
        why: `The centre of gravity sits ${marginText(trim)}, so once the nose started up nothing stopped it.`,
        fix: 'Move weight forward: slide a paper clip onto the nose, or fold the nose over once more.',
      };
    }
    return {
      code: 'loop',
      what,
      why:
        trim.speed !== null
          ? `Lift grows with the square of speed: at ${f1(r.launchAirspeed)} m/s, against a glide speed of ${f1(trim.speed)} m/s, the wing made about ${f0(Math.max(2, r.peakLoad))} times the plane's weight.`
          : 'The wing made several times the plane\'s weight in lift, and the up-trim turned that into a loop.',
      fix:
        trim.speed !== null
          ? `Throw gentler, near ${f1(trim.speed)} m/s, or flatten the up-bend of the trailing edges.`
          : 'Throw gentler, or flatten the up-bend of the trailing edges.',
    };
  },

  spiral: (c) => lateral(c, 'spiral'),
  'roll-off': (c) => lateral(c, 'roll-off'),

  tumble: (c) => {
    const { trim } = c;
    const unstable = !trim.pitchStable;
    return {
      code: 'tumble',
      what: 'It tumbled over itself instead of flying.',
      why: unstable
        ? `The centre of gravity sits ${marginText(trim)}, so every swing of the nose grows instead of dying out.`
        : 'It lost its airspeed completely, and a flat sheet with no airflow over it simply flutters down.',
      fix: unstable
        ? 'Add weight at the nose (a paper clip, or one more nose fold) until it balances about a third of the way back from the nose.'
        : 'Throw it faster and flatter, so the air keeps flowing over the wing.',
    };
  },

  'wind-carried': (c) => {
    const { r } = c;
    // Rising air is the story when it made up a good part of the plane's sink through the air.
    const samples = c.result.samples;
    const lost = samples[0].pos[1] - samples[samples.length - 1].pos[1];
    const lifted = r.windLift >= WIND_MIN_LIFT && r.windLift >= WIND_LIFT_SHARE * (r.windLift + Math.max(lost, 0));
    const speed = c.result.metrics.meanAirspeed;
    return {
      code: 'wind-carried',
      what: lifted
        ? `Rising air held it up: the air around it climbed about ${f1(r.windLift)} m during the flight.`
        : `The wind carried it: the air itself moved about ${f1(r.windDrift)} m during the flight.`,
      why: lifted
        ? 'A glider always sinks through the air around it; when that air rises as fast as the plane sinks, it stays up.'
        : `A ${f1(r.meanWind)} m/s wind is ${pct(speed > 0 ? r.meanWind / speed : 0)} % of this plane's ${f1(speed)} m/s airspeed, so the moving air decides much of where it lands.`,
      fix: lifted
        ? 'To stay in the lift longer, throw gently into the wind.'
        : 'Throw into the wind for time aloft and with it for distance, or wait for a calmer moment.',
    };
  },

  'hit-wall': (c) => {
    const { env, result } = c;
    const b = env.bounds;
    const touch = result.events[result.events.length - 1].pos;
    const far = b !== null && touch[0] > b.xMax - 0.05;
    const back = b !== null && touch[0] < b.xMin + 0.05;
    const length = b ? b.xMax - b.xMin : 0;
    const width = b ? b.zMax - b.zMin : 0;
    if (far) {
      return {
        code: 'hit-wall',
        what: `It was still flying when it met the far wall after ${f1(result.metrics.airtime)} s.`,
        why: `The room is ${f0(length)} m long, and this throw had more distance in it than that.`,
        fix: 'Throw a little gentler, or take it to a bigger room.',
      };
    }
    return {
      code: 'hit-wall',
      what: back ? 'It turned back and hit the wall behind you.' : `It drifted ${f1(Math.abs(result.metrics.lateral))} m sideways into the ${sideOf(result.metrics.lateral)} wall.`,
      why: `The room is ${f0(width)} m wide, and the plane did not hold its heading long enough to stay inside it.`,
      fix: 'Level the wings at release and aim straight down the middle of the room.',
    };
  },

  'hit-ceiling': (c) => {
    const { env, launch, trim, r } = c;
    const height = env.bounds ? env.bounds.ceiling : 0;
    const fast = trim.speed !== null && r.launchAirspeed > TOO_FAST_RATIO * trim.speed;
    return {
      code: 'hit-ceiling',
      what: `It climbed into the ceiling, ${f1(height)} m up.`,
      why:
        fast && trim.speed !== null && launch.pitchDeg < 30
          ? `Thrown at ${f1(r.launchAirspeed)} m/s it had far more lift than weight (it glides at ${f1(trim.speed)} m/s), and the surplus carried it up.`
          : `A throw of ${f1(launch.speed)} m/s aimed ${f0(launch.pitchDeg)}° up has the energy to climb ${f1((launch.speed * Math.sin(launch.pitchDeg * DEG)) ** 2 / (2 * STANDARD_GRAVITY))} m even without lift.`,
      fix: 'Throw flatter and gentler, or find a taller room.',
    };
  },

  'too-slow': (c) => {
    const { trim, r } = c;
    const need = trim.speed ?? 0;
    return {
      code: 'too-slow',
      what: 'It sank straight out of your hand: too slow to fly.',
      why: `It needs about ${f1(need)} m/s to carry its weight; at ${f1(r.launchAirspeed)} m/s the wing makes only ${pct((r.launchAirspeed / need) ** 2)} % of that lift.`,
      fix: `Throw it firmly and level, at about ${f1(need)} m/s.`,
    };
  },

  ballistic: (c) => {
    const { r } = c;
    return {
      code: 'ballistic',
      what: 'It flew like a thrown dart: a fast arc with the wings hardly working.',
      why: `Over the whole flight the wing carried only about ${pct(Math.max(0, r.support))} % of the weight; momentum and gravity drew the path.`,
      fix: 'For a glide at the end of the arc, bend both trailing edges up about 1 mm.',
    };
  },
};

function lateral(c: Context, code: 'spiral' | 'roll-off'): Diagnosis {
  const { trim, r, launch, result } = c;
  // Which way it went: by the turn when it turned, else by the bank.
  const way = Math.abs(r.turn) > VEER_TURN / 2 ? r.turn : r.maxBank;
  const side = sideOf(way);
  const other = sideOf(-way);
  let why: string;
  let fix: string;
  if (c.bends.uneven) {
    why = `Its trailing edges are not bent alike, so one wing lifts more than the other and rolls it to the ${side}.`;
    fix = `Even out the bends: raise the ${side} trailing edge about 1 mm, or lower the ${other} one.`;
  } else if (Math.abs(launch.rollDeg) >= 8 && Math.sign(launch.rollDeg) === Math.sign(way)) {
    why = `It left your hand banked ${f0(Math.abs(launch.rollDeg))}° to the ${side}; a banked wing pulls sideways, and this plane has too little dihedral to level itself.`;
    fix = 'Release it with level wings, and raise both wingtips into a shallow Y.';
  } else if (!trim.rollStable || trim.cnBetaDynamic <= 0) {
    why = 'With flat wings and a deep keel nothing levels it: once it slips to one side, the bank and the turn feed each other.';
    fix = 'Raise both wingtips into a shallow Y, about 10° above level.';
  } else {
    why = 'A small bank at the start grew faster than the dihedral could level it, and the turn steepened as the nose dropped.';
    fix = 'Add a little more dihedral (wingtips higher), and check that both wings match.';
  }
  const what =
    code === 'spiral'
      ? `It banked ${side} and wound into a spiral, turning ${f0(Math.abs(r.turn) / DEG)}°.`
      : `It rolled to the ${side} and veered ${f1(Math.abs(result.metrics.lateral))} m off course.`;
  return { code, what, why, fix };
}

/**
 * Read a finished flight. The list is ordered by importance: first how it flew wrong (if it did), then what it
 * hit, then what the wind did. A flight with nothing to remark returns exactly one 'clean-glide'.
 */
export function diagnose(result: FlightResult, airframe: Airframe, launch: Launch, env: Environment): Diagnosis[] {
  if (result.samples.length < 2 || airframe.elements.length === 0) {
    return [{ code: 'ballistic', what: 'It never really flew.', why: 'The flight was over before the air could act on it.', fix: 'Give it room and a firm, level throw.' }];
  }
  const air = airFrom(env.tempC, env.pressurePa, env.humidity);
  const trim = analyzeTrim(airframe, air);
  const wing = airframe.surfaces.find((s) => s.role === 'wing' || s.role === 'center') ?? airframe.surfaces[0];
  const stallAngle = wing ? wing.alphaStall : Math.PI / 2;
  const r = read(result, airframe, stallAngle);
  const c: Context = { result, airframe, launch, env, trim, r, stallDeg: stallAngle / DEG, bends: bendsOf(airframe) };
  const m = result.metrics;
  const codes: DiagnosisCode[] = [];

  const hitWall = result.outcome === 'wall';
  const hitCeiling = result.outcome === 'ceiling';

  // 1. Attitude lost altogether.
  if (r.tumbled) codes.push('tumble');
  else if (r.looped) codes.push('loop');

  // 2. Direction lost.
  const veered = Math.abs(m.lateral) > VEER_DRIFT * Math.max(m.distance, 1);
  if (!r.tumbled && !r.looped) {
    if (Math.abs(r.turn) >= SPIRAL_TURN) codes.push('spiral');
    else if (Math.abs(r.maxBank) >= ROLL_OFF_BANK || (Math.abs(r.turn) >= VEER_TURN && veered)) codes.push('roll-off');
  }

  // 3. Pitch behaviour, unless the attitude was lost anyway.
  if (codes.length === 0 || codes[0] === 'spiral' || codes[0] === 'roll-off') {
    const slow = trim.trimmable && trim.speed !== null && r.launchAirspeed < TOO_SLOW_RATIO * trim.speed;
    // Mushing, or a stall that the flight never got over: one stall and a drop back to the ground.
    const stalledOut =
      r.stalledFraction >= MUSH_FRACTION || (m.stallCount >= 1 && (r.endsStalled || r.support < UNSUPPORTED_BELOW));
    const lateralFault = codes.length > 0;
    if (slow && !hitCeiling && (m.stallCount >= 1 || r.support < 0.8)) codes.push('too-slow');
    else if (!lateralFault && (m.stallCount >= 2 || r.humps >= 2)) codes.push('porpoise');
    else if (stalledOut) codes.push('stall-mush');
    else if (!lateralFault && !hitWall && !hitCeiling && r.support < (trim.trimmable ? UNSUPPORTED_BELOW : UNTRIMMED_BELOW)) {
      codes.push(launch.speed >= BALLISTIC_FROM_SPEED ? 'ballistic' : 'nose-dive');
    }
  }

  // 4. What it hit.
  if (hitWall) codes.push('hit-wall');
  if (hitCeiling) codes.push('hit-ceiling');

  // 5. What the air did.
  if (!env.indoor) {
    const drifted = r.windDrift >= WIND_MIN_DRIFT && r.windDrift >= WIND_DRIFT_SHARE * m.pathLength;
    if (drifted || r.windLift >= WIND_MIN_LIFT) codes.push('wind-carried');
  }

  if (codes.length === 0) codes.push('clean-glide');
  return codes.slice(0, MAX_DIAGNOSES).map((code) => WRITERS[code](c));
}
