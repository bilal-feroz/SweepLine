/**
 * Deterministic pseudo-random utilities.
 *
 * Baseline and SweepLine engines are seeded identically, so the bloom they
 * receive is identical: same spawn times, positions, depths and sizes.
 * Per-agent stochastic motion is derived from stateless hashes of
 * (agent id, time) rather than a shared sequential stream, so an agent follows
 * exactly the same path in both engines until SweepLine changes it.
 */

/** Mulberry32 — small, fast, good-quality 32-bit generator. */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Standard normal via Box–Muller. Always consumes exactly two draws. */
  normal(): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/** Stateless integer hash of two values → [0, 1). */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e3779b9, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1-D value noise in [0, 1) for a given channel (e.g. agent id) and coordinate. */
export function valueNoise(channel: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(channel, i);
  const b = hash01(channel, i + 1);
  return a + (b - a) * u;
}

/** Two-octave value noise in [0, 1). */
export function fbm1(channel: number, t: number): number {
  return valueNoise(channel, t) * 0.66 + valueNoise(channel + 7919, t * 2.13) * 0.34;
}
