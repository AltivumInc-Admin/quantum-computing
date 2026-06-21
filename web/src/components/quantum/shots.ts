/**
 * Born-rule sampling for the measurement explorables. `sampleIndex` is the single
 * inverse-transform draw (shared with the correlation demo); `sampleCounts` tallies
 * `n` of them. A zero-probability outcome is never returned — this guards the exact
 * `r === 0` + leading-zero edge that a bare cumulative comparison would mis-hit.
 */

/** Inverse-transform sample one basis-state index from `probs` (never zero-mass). */
export function sampleIndex(probs: number[], rng: () => number = Math.random): number {
  const total = probs.reduce((a, b) => a + b, 0);
  const r = rng() * total;
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc && probs[i] > 0) return i;
  }
  for (let i = probs.length - 1; i >= 0; i--) if (probs[i] > 0) return i;
  return probs.length - 1;
}

/**
 * Sample `n` measurement shots from a categorical distribution `probs` and return
 * per-outcome counts. `rng` defaults to Math.random; tests inject a seeded generator.
 */
export function sampleCounts(probs: number[], n: number, rng: () => number = Math.random): number[] {
  const counts = new Array(probs.length).fill(0);
  for (let s = 0; s < n; s++) counts[sampleIndex(probs, rng)]++;
  return counts;
}
