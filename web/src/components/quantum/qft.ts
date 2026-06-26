import type { Complex } from "./math";

/** Quantum Fourier Transform as a DFT: out[k] = (1/sqrt(N)) sum_j amps[j] e^{+2*pi*i*j*k/N}. */
export function qft(amps: Complex[]): Complex[] {
  const N = amps.length;
  const norm = 1 / Math.sqrt(N);
  const out: Complex[] = [];
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let j = 0; j < N; j++) {
      const ang = (2 * Math.PI * j * k) / N;
      const c = Math.cos(ang), s = Math.sin(ang);
      re += amps[j][0] * c - amps[j][1] * s;
      im += amps[j][0] * s + amps[j][1] * c;
    }
    out.push([re * norm, im * norm]);
  }
  return out;
}

export function basisState(n: number, j: number): Complex[] {
  const N = 1 << n;
  const a: Complex[] = Array.from({ length: N }, () => [0, 0] as Complex);
  a[j] = [1, 0];
  return a;
}

/** Normalized comb: equal amplitude on indices j with j mod period === 0. */
export function periodicState(n: number, period: number): Complex[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new RangeError("periodicState: period must be a positive integer");
  }
  const N = 1 << n;
  const idx: number[] = [];
  for (let j = 0; j < N; j += period) idx.push(j);
  const amp = 1 / Math.sqrt(idx.length);
  const a: Complex[] = Array.from({ length: N }, () => [0, 0] as Complex);
  for (const j of idx) a[j] = [amp, 0];
  return a;
}
