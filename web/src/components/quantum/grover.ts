/** Grover's search on N = 2^n items, real amplitudes (single marked item). */
export function uniform(n: number): number[] {
  const N = 1 << n;
  return new Array(N).fill(1 / Math.sqrt(N));
}

/** One Grover iteration: oracle (negate marked) then diffusion (reflect about the mean). */
export function groverIteration(amps: number[], marked: number): number[] {
  const a = amps.slice();
  a[marked] = -a[marked];
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  return a.map((x) => 2 * mean - x);
}

/** Amplitude vectors for iterations 0..iterations (inclusive); hist[k] is after k iterations. */
export function groverHistory(n: number, marked: number, iterations: number): number[][] {
  if (n > 4) throw new Error("qgrover supports up to 4 qubits (N <= 16)");
  let a = uniform(n);
  const hist = [a];
  for (let k = 0; k < iterations; k++) {
    a = groverIteration(a, marked);
    hist.push(a);
  }
  return hist;
}

/** Standard near-optimal iteration count: round((pi/4)*sqrt(N) - 0.5). */
export function optimalIterations(n: number): number {
  const N = 1 << n;
  return Math.round((Math.PI / 4) * Math.sqrt(N) - 0.5);
}
