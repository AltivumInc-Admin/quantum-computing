/**
 * Sample `n` measurement shots from a categorical distribution `probs` and return
 * per-outcome counts. `rng` defaults to Math.random; tests inject a seeded generator.
 */
export function sampleCounts(probs: number[], n: number, rng: () => number = Math.random): number[] {
  const cdf: number[] = [];
  let acc = 0;
  for (const p of probs) { acc += p; cdf.push(acc); }
  const counts = new Array(probs.length).fill(0);
  for (let s = 0; s < n; s++) {
    const r = rng() * acc;
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r <= cdf[mid]) hi = mid; else lo = mid + 1;
    }
    counts[lo]++;
  }
  return counts;
}
