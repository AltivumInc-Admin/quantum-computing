/**
 * Shared deterministic RNG + the labeled training-point type used by the QML
 * explorables (kernel / VQC / barren). These were previously copy-pasted into
 * each module (`mulberry32` ×3, `gauss` ×2, and the same `{x,y}` point type
 * under two names `Point`/`Pt`).
 */

/** Labeled 2D training point. */
export interface Point {
  x: [number, number];
  y: -1 | 1;
}

/** Deterministic seeded PRNG (mulberry32); the widgets seed it per run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard-normal sample via Box–Muller, drawn from a uniform `rng`. */
export function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
}
