/**
 * Structural validation of untrusted JSON (a ticket from the network or from storage). Builds a clean copy
 * that holds only the known fields, so nothing unexpected is stored or fed to the fold engine.
 * Rule checks (speed caps, paper sizes, trim limits) live in verify.ts.
 */
import type {
  Conditions, FlightTicket, FoldLine, FoldStep, Launch, PaperSpec, PlaneCategory, PlaneDesign, ShapeSpec, TrimSpec, Vec2,
} from '../types';

export type Parsed<T> = { ok: true; value: T } | { ok: false; reasons: string[] };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const CATEGORIES: readonly PlaneCategory[] = ['dart', 'glider', 'hybrid', 'wing', 'custom'];
/** No coordinate of a sheet-sized model is anywhere near this, metres. */
const COORD_BOUND = 10;
const MAX_TEXT = 200;

class Reader {
  readonly reasons: string[] = [];

  num(o: Obj, key: string, path: string): number {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.reasons.push(`${path}.${key} must be a finite number`);
      return 0;
    }
    return v;
  }

  str(o: Obj, key: string, path: string, max = MAX_TEXT): string {
    const v = o[key];
    if (typeof v !== 'string' || v.length > max) {
      this.reasons.push(`${path}.${key} must be a string of at most ${max} characters`);
      return '';
    }
    return v;
  }

  optStr(o: Obj, key: string, path: string, max = MAX_TEXT): string | undefined {
    return o[key] === undefined ? undefined : this.str(o, key, path, max);
  }

  oneOf<T extends string>(o: Obj, key: string, path: string, options: readonly T[]): T {
    const v = o[key];
    if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T;
    this.reasons.push(`${path}.${key} must be one of ${options.join(', ')}`);
    return options[0]!;
  }

  obj(o: Obj, key: string, path: string): Obj {
    const v = o[key];
    if (!isObj(v)) {
      this.reasons.push(`${path}.${key} must be an object`);
      return {};
    }
    return v;
  }

  vec2(v: unknown, path: string): Vec2 {
    if (
      Array.isArray(v) && v.length === 2 &&
      v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= COORD_BOUND)
    ) {
      return [v[0] as number, v[1] as number];
    }
    this.reasons.push(`${path} must be a point [x, y] in metres`);
    return [0, 0];
  }

  line(v: unknown, path: string): FoldLine {
    if (!isObj(v)) {
      this.reasons.push(`${path} must be a line { a, b }`);
      return { a: [0, 0], b: [1, 0] };
    }
    return { a: this.vec2(v.a, `${path}.a`), b: this.vec2(v.b, `${path}.b`) };
  }

  optLine(v: unknown, path: string): FoldLine | null {
    return v === null ? null : this.line(v, path);
  }
}

function readPaper(r: Reader, o: Obj): PaperSpec {
  const p = 'design.paper';
  const paper: PaperSpec = {
    sizeId: r.str(o, 'sizeId', p, 32),
    width: r.num(o, 'width', p),
    height: r.num(o, 'height', p),
    front: r.str(o, 'front', p, 32),
    back: r.str(o, 'back', p, 32),
  };
  const pattern = r.optStr(o, 'pattern', p, 32);
  if (pattern !== undefined) paper.pattern = pattern;
  return paper;
}

function readStep(r: Reader, v: unknown, i: number): FoldStep {
  const p = `design.steps[${i}]`;
  if (!isObj(v)) {
    r.reasons.push(`${p} must be an object`);
    return { kind: 'flip' };
  }
  const label = r.optStr(v, 'label', p);
  const withLabel = <T extends FoldStep>(s: T): T => (label === undefined ? s : { ...s, label });
  const kind = r.oneOf(v, 'kind', p, ['fold', 'crease', 'flip'] as const);
  if (kind === 'flip') return withLabel({ kind: 'flip' });
  if (kind === 'crease') return withLabel({ kind: 'crease', line: r.line(v.line, `${p}.line`) });
  const step: FoldStep = {
    kind: 'fold',
    line: r.line(v.line, `${p}.line`),
    moving: r.oneOf(v, 'moving', p, ['left', 'right'] as const),
    dir: r.oneOf(v, 'dir', p, ['valley', 'mountain'] as const),
    layers: r.oneOf(v, 'layers', p, ['all', 'flap'] as const),
  };
  if (v.pick !== undefined) step.pick = r.vec2(v.pick, `${p}.pick`);
  return withLabel(step);
}

function readShape(r: Reader, o: Obj): ShapeSpec {
  const p = 'design.shape';
  return {
    keel: r.oneOf(o, 'keel', p, ['valley', 'mountain', 'none'] as const),
    keelSpreadDeg: r.num(o, 'keelSpreadDeg', p),
    wingLine: r.optLine(o.wingLine, `${p}.wingLine`),
    dihedralDeg: r.num(o, 'dihedralDeg', p),
    wingletLine: r.optLine(o.wingletLine, `${p}.wingletLine`),
    wingletDeg: r.num(o, 'wingletDeg', p),
  };
}

function readTrim(r: Reader, o: Obj): TrimSpec {
  const p = 'design.trim';
  let clip: TrimSpec['clip'] = null;
  if (o.clip !== null) {
    const c = r.obj(o, 'clip', p);
    clip = { mass: r.num(c, 'mass', `${p}.clip`), x: r.num(c, 'x', `${p}.clip`) };
  }
  return {
    elevatorDeg: r.num(o, 'elevatorDeg', p),
    elevatorChordFrac: r.num(o, 'elevatorChordFrac', p),
    aileronDeg: r.num(o, 'aileronDeg', p),
    rudderDeg: r.num(o, 'rudderDeg', p),
    clip,
  };
}

/** Upper bound on steps accepted by the parser; the ranked limit (verify.ts) is lower. */
const PARSE_MAX_STEPS = 256;

function readDesign(r: Reader, o: Obj): PlaneDesign {
  const p = 'design';
  if (o.v !== 1) r.reasons.push('design.v must be 1');
  const rawSteps = o.steps;
  let steps: FoldStep[] = [];
  if (!Array.isArray(rawSteps) || rawSteps.length > PARSE_MAX_STEPS) {
    r.reasons.push(`design.steps must be an array of at most ${PARSE_MAX_STEPS} steps`);
  } else {
    steps = rawSteps.map((s, i) => readStep(r, s, i));
  }
  const design: PlaneDesign = {
    v: 1,
    id: r.str(o, 'id', p, 64),
    name: r.str(o, 'name', p, 64),
    category: r.oneOf(o, 'category', p, CATEGORIES),
    paper: readPaper(r, r.obj(o, 'paper', p)),
    steps,
    shape: readShape(r, r.obj(o, 'shape', p)),
    trim: readTrim(r, r.obj(o, 'trim', p)),
  };
  const presetId = r.optStr(o, 'presetId', p, 64);
  if (presetId !== undefined) design.presetId = presetId;
  const author = r.optStr(o, 'author', p, 64);
  if (author !== undefined) design.author = author;
  return design;
}

function readLaunch(r: Reader, o: Obj): Launch {
  const p = 'launch';
  return {
    speed: r.num(o, 'speed', p),
    pitchDeg: r.num(o, 'pitchDeg', p),
    yawDeg: r.num(o, 'yawDeg', p),
    rollDeg: r.num(o, 'rollDeg', p),
    aoaDeg: r.num(o, 'aoaDeg', p),
  };
}

function readConditions(r: Reader, o: Obj): Conditions {
  const p = 'conditions';
  const c: Conditions = { envId: r.str(o, 'envId', p, 32) };
  if (o.windSpeed !== undefined) c.windSpeed = r.num(o, 'windSpeed', p);
  if (o.windTowardDeg !== undefined) c.windTowardDeg = r.num(o, 'windTowardDeg', p);
  if (o.gustiness !== undefined) c.gustiness = r.num(o, 'gustiness', p);
  return c;
}

/** Validate the shape of an untrusted ticket and return a clean copy. */
export function parseTicket(v: unknown): Parsed<FlightTicket> {
  const r = new Reader();
  if (!isObj(v)) return { ok: false, reasons: ['ticket must be an object'] };
  const seed = v.seed;
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    r.reasons.push('ticket.seed must be an unsigned 32-bit integer');
  }
  const ticket: FlightTicket = {
    design: readDesign(r, r.obj(v, 'design', 'ticket')),
    launch: readLaunch(r, r.obj(v, 'launch', 'ticket')),
    conditions: readConditions(r, r.obj(v, 'conditions', 'ticket')),
    seed: typeof seed === 'number' ? seed : 0,
  };
  return r.reasons.length > 0 ? { ok: false, reasons: r.reasons.slice(0, 20) } : { ok: true, value: ticket };
}
