import { type Complex, ry, rz, applyGate1, applyCNOT, zeroState, cAbs2 } from "./math";

export interface Pt { x: [number, number]; y: -1 | 1; }

export const N_PARAMS = 9; // 2 blocks x (RY,RY,RZ,RZ) + final RY on q0

/** <Z_0> for a 2-qubit state (big-endian: q0 = MSB). |00>,|01> -> +1 ; |10>,|11> -> -1. */
export function expectZ0(state: Complex[]): number {
  return cAbs2(state[0]) + cAbs2(state[1]) - cAbs2(state[2]) - cAbs2(state[3]);
}

/** f(x;theta,bias) = <Z_0> after angle-encoding x then the ansatz, + bias. */
export function vqcOutput(x: [number, number], theta: number[], bias: number, scale = 1): number {
  let s = zeroState(2);
  s = applyGate1(s, ry(scale * x[0]), 0, 2);
  s = applyGate1(s, ry(scale * x[1]), 1, 2);
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
export function paramShiftGrad(x: [number, number], theta: number[], bias: number, j: number, scale = 1): number {
  const tp = theta.slice(); tp[j] += Math.PI / 2;
  const tm = theta.slice(); tm[j] -= Math.PI / 2;
  return 0.5 * (vqcOutput(x, tp, bias, scale) - vqcOutput(x, tm, bias, scale));
}

export function mseLoss(data: Pt[], theta: number[], bias: number, scale = 1): number {
  let s = 0;
  for (const d of data) s += (vqcOutput(d.x, theta, bias, scale) - d.y) ** 2;
  return s / data.length;
}

/** One full-batch gradient-descent step on MSE; returns updated theta + bias. */
export function trainStep(data: Pt[], theta: number[], bias: number, lr: number, scale = 1): { theta: number[]; bias: number } {
  const grads = new Array(theta.length).fill(0);
  let gb = 0;
  for (const d of data) {
    const e = 2 * (vqcOutput(d.x, theta, bias, scale) - d.y);
    gb += e;
    for (let j = 0; j < theta.length; j++) grads[j] += e * paramShiftGrad(d.x, theta, bias, j, scale);
  }
  const M = data.length;
  return { theta: theta.map((t, j) => t - (lr * grads[j]) / M), bias: bias - (lr * gb) / M };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
}

/** Two separable Gaussian blobs at (+/-0.7,+/-0.7), clipped to [-pi, pi]. */
export function makeBlobs(n: number, seed: number): Pt[] {
  const rng = mulberry32(seed);
  const clip = (v: number) => Math.max(-Math.PI, Math.min(Math.PI, v));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const pos = i % 2 === 0;
    const c = pos ? 0.7 : -0.7;
    pts.push({ x: [clip(c + 0.35 * gauss(rng)), clip(c + 0.35 * gauss(rng))], y: pos ? 1 : -1 });
  }
  return pts;
}
