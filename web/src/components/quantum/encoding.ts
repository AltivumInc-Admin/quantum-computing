import { type Complex, cMul, cConj, H, ry, rz, applyGate1, applyCNOT, zeroState } from "./math";

/** Angle encoding: RY(x0) on q0, RY(x1) on q1, applied to |00>. */
export function angleState(x0: number, x1: number): Complex[] {
  let s = zeroState(2);
  s = applyGate1(s, ry(x0), 0, 2);
  s = applyGate1(s, ry(x1), 1, 2);
  return s;
}

/** Amplitude encoding: v/||v|| over the next power of two. Zero vector -> |0...0>. */
export function amplitudeState(features: number[]): Complex[] {
  const dim = 1 << Math.max(1, Math.ceil(Math.log2(Math.max(2, features.length))));
  const v = features.slice();
  while (v.length < dim) v.push(0);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm < 1e-9) {
    const z: Complex[] = Array.from({ length: dim }, () => [0, 0] as Complex);
    z[0] = [1, 0];
    return z;
  }
  return v.map((x) => [x / norm, 0] as Complex);
}

/** IQP / ZZ feature map (Havlicek): per rep on |00>: H both; RZ(2x_i); CX; RZ(2(pi-x0)(pi-x1)) on q1; CX. */
export function iqpState(x0: number, x1: number, reps = 2): Complex[] {
  let s = zeroState(2);
  for (let r = 0; r < reps; r++) {
    s = applyGate1(s, H, 0, 2);
    s = applyGate1(s, H, 1, 2);
    s = applyGate1(s, rz(2 * x0), 0, 2);
    s = applyGate1(s, rz(2 * x1), 1, 2);
    s = applyCNOT(s, 0, 1, 2);
    s = applyGate1(s, rz(2 * (Math.PI - x0) * (Math.PI - x1)), 1, 2);
    s = applyCNOT(s, 0, 1, 2);
  }
  return s;
}

/** Fidelity kernel |<a|b>|^2. */
export function fidelity(a: Complex[], b: Complex[]): number {
  let re = 0, im = 0;
  for (let k = 0; k < a.length; k++) {
    const c = cMul(cConj(a[k]), b[k]);
    re += c[0];
    im += c[1];
  }
  return re * re + im * im;
}
