import { type Complex, ry, rz, applyGate1, applyCNOT, zeroState, cAbs2 } from "./math";
import { mulberry32, gauss, type Point } from "./rng";

export type { Point };

export const N_PARAMS = 9; // 2 blocks x (RY,RY,RZ,RZ) + final RY on q0

/** <Z_0> for a 2-qubit state (big-endian: q0 = MSB). |00>,|01> -> +1 ; |10>,|11> -> -1. */
export function expectZ0(state: Complex[]): number {
  return cAbs2(state[0]) + cAbs2(state[1]) - cAbs2(state[2]) - cAbs2(state[3]);
}

/** f(x;theta,bias) = <Z_0> after angle-encoding x then the ansatz, + bias. */
export function vqcOutput(x: [number, number], theta: number[], bias: number): number {
  let s = zeroState(2);
  s = applyGate1(s, ry(x[0]), 0, 2);
  s = applyGate1(s, ry(x[1]), 1, 2);
  let p = 0;
  for (let l = 0; l < 2; l++) {
    s = applyCNOT(s, 0, 1, 2);
    s = applyGate1(s, ry(theta[p++]), 0, 2);
    s = applyGate1(s, ry(theta[p++]), 1, 2);
    s = applyGate1(s, rz(theta[p++]), 0, 2);
    s = applyGate1(s, rz(theta[p++]), 1, 2);
  }
  s = applyGate1(s, ry(theta[p++]), 0, 2); // final RY on q0 (keeps the last gate non-diagonal)
  return expectZ0(s) + bias;
}

/** Parameter-shift gradient of f w.r.t. theta[j] (bias cancels in the difference). */
export function paramShiftGrad(x: [number, number], theta: number[], bias: number, j: number): number {
  const tp = theta.slice(); tp[j] += Math.PI / 2;
  const tm = theta.slice(); tm[j] -= Math.PI / 2;
  return 0.5 * (vqcOutput(x, tp, bias) - vqcOutput(x, tm, bias));
}

export function mseLoss(data: Point[], theta: number[], bias: number): number {
  let s = 0;
  for (const d of data) s += (vqcOutput(d.x, theta, bias) - d.y) ** 2;
  return s / data.length;
}

/** One full-batch gradient-descent step on MSE; returns updated theta + bias. */
export function trainStep(data: Point[], theta: number[], bias: number, lr: number): { theta: number[]; bias: number } {
  const grads = new Array(theta.length).fill(0);
  let gb = 0;
  for (const d of data) {
    const e = 2 * (vqcOutput(d.x, theta, bias) - d.y);
    gb += e;
    for (let j = 0; j < theta.length; j++) grads[j] += e * paramShiftGrad(d.x, theta, bias, j);
  }
  const M = data.length;
  return { theta: theta.map((t, j) => t - (lr * grads[j]) / M), bias: bias - (lr * gb) / M };
}

/**
 * Fraction of `data` the classifier labels correctly (sign of f, thresholded at
 * 0). Lives here rather than in the view: it is the model's own forward pass —
 * the same one `mseLoss` runs — and it produces the headline number the learner
 * reads, so it belongs inside the unit-tested boundary alongside kernel.ts's
 * `accuracy`.
 */
export function accuracyOf(data: Point[], theta: number[], bias: number): number {
  let correct = 0;
  for (const d of data) {
    const pred = vqcOutput(d.x, theta, bias) >= 0 ? 1 : -1;
    if (pred === d.y) correct++;
  }
  return correct / data.length;
}

/** The trainer's initialization policy: N_PARAMS small random angles in [-0.1, 0.3). */
export function initTheta(): number[] {
  return Array.from({ length: N_PARAMS }, () => -0.1 + 0.4 * Math.random());
}

/** Two separable Gaussian blobs at (+/-0.7,+/-0.7), clipped to [-pi, pi]. */
export function makeBlobs(n: number, seed: number): Point[] {
  const rng = mulberry32(seed);
  const clip = (v: number) => Math.max(-Math.PI, Math.min(Math.PI, v));
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const pos = i % 2 === 0;
    const c = pos ? 0.7 : -0.7;
    pts.push({ x: [clip(c + 0.35 * gauss(rng)), clip(c + 0.35 * gauss(rng))], y: pos ? 1 : -1 });
  }
  return pts;
}
