import { type Complex, ry, applyGate1, zeroState, cAbs2 } from "./math";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unique CZ ring edges (dedup so n=2 applies CZ once). */
function czEdges(n: number): [number, number][] {
  const seen = new Set<string>();
  const e: [number, number][] = [];
  for (let q = 0; q < n; q++) {
    const a = q, b = (q + 1) % n;
    if (a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!seen.has(key)) { seen.add(key); e.push([a, b]); }
  }
  return e;
}

function applyCZRing(state: Complex[], n: number): Complex[] {
  const out = state.map((c) => [c[0], c[1]] as Complex);
  for (const [a, b] of czEdges(n)) {
    const ma = 1 << (n - 1 - a), mb = 1 << (n - 1 - b);
    for (let i = 0; i < out.length; i++) if ((i & ma) && (i & mb)) out[i] = [-out[i][0], -out[i][1]];
  }
  return out;
}

/** Hardware-efficient ansatz: RY(pi/4) seed, then L layers of [RY(theta_q) per qubit] + CZ ring. */
function buildState(n: number, L: number, thetas: number[]): Complex[] {
  let s = zeroState(n);
  for (let q = 0; q < n; q++) s = applyGate1(s, ry(Math.PI / 4), q, n);
  let p = 0;
  for (let l = 0; l < L; l++) {
    for (let q = 0; q < n; q++) s = applyGate1(s, ry(thetas[p++]), q, n);
    s = applyCZRing(s, n);
  }
  return s;
}

function costGlobal(state: Complex[], n: number): number {
  let e = 0;
  for (let i = 0; i < state.length; i++) {
    let par = 1;
    for (let q = 0; q < n; q++) if ((i >> (n - 1 - q)) & 1) par = -par;
    e += par * cAbs2(state[i]);
  }
  return e;
}
function costLocal(state: Complex[], n: number): number {
  const m = 1 << (n - 1); // qubit 0 (MSB)
  let e = 0;
  for (let i = 0; i < state.length; i++) e += ((i & m) ? -1 : 1) * cAbs2(state[i]);
  return e;
}

export type Cost = "global" | "local";

/** Variance over `samples` random theta of the parameter-shift gradient of a fixed probed param. */
export function gradientVariance(n: number, L: number, cost: Cost, samples: number, rng: () => number): number {
  const nParams = n * L;
  const probe = 0; // qubit 0, layer 0 — inside q0's causal cone (nonzero local gradient)
  const costFn = cost === "global" ? costGlobal : costLocal;
  const grads: number[] = [];
  for (let s = 0; s < samples; s++) {
    const th = Array.from({ length: nParams }, () => rng() * 2 * Math.PI);
    const tp = th.slice(); tp[probe] += Math.PI / 2;
    const tm = th.slice(); tm[probe] -= Math.PI / 2;
    grads.push(0.5 * (costFn(buildState(n, L, tp), n) - costFn(buildState(n, L, tm), n)));
  }
  const mean = grads.reduce((a, b) => a + b, 0) / samples;
  return grads.reduce((a, g) => a + (g - mean) ** 2, 0) / samples;
}
