/** Small, fast, seedable PRNG (mulberry32). Deterministic across JS engines: integer math only. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal deviate (Box-Muller, cached pair). */
  gauss(): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
}

export function createRng(seed: number): Rng {
  let a = (seed >>> 0) || 0x9e3779b9;
  let spare: number | null = null;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = (): number => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u < 1e-12) u = next();
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * v;
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
  return { next, gauss, range: (lo, hi) => lo + (hi - lo) * next() };
}

/** Stable 32-bit string hash (FNV-1a). */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
