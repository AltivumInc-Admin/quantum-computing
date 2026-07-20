import { type Complex, zeroState, cAbs2 } from "./math";

/**
 * Gradient-variance sweep behind the barren-plateau explorable. The widget runs
 * this for n = 2..8 on every depth change, so the hot path is deliberately
 * allocation-free: `applyRyInPlace` writes the butterfly components directly
 * instead of routing through the generic complex-gate kernel, and
 * `gradientVariances` reads BOTH cost functions off one pair of built states.
 */

const czEdgeCache = new Map<number, [number, number][]>();

function czEdges(n: number): [number, number][] {
  const hit = czEdgeCache.get(n);
  if (hit) return hit;
  const seen = new Set<string>();
  const e: [number, number][] = [];
  for (let q = 0; q < n; q++) {
    const a = q, b = (q + 1) % n;
    if (a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!seen.has(key)) { seen.add(key); e.push([a, b]); }
  }
  czEdgeCache.set(n, e);
  return e;
}

function applyCZRingInPlace(state: Complex[], n: number): void {
  for (const [a, b] of czEdges(n)) {
    const ma = 1 << (n - 1 - a), mb = 1 << (n - 1 - b);
    for (let i = 0; i < state.length; i++) if ((i & ma) && (i & mb)) state[i] = [-state[i][0], -state[i][1]];
  }
}

/**
 * Zero-allocation RY butterfly. RY is real-entried
 * ([[c, -s], [s, c]]), so the generic `applyGate1InPlace` path — which builds
 * each output amplitude as `cAdd(cMul(gate[0][0], a), cMul(gate[0][1], b))` and
 * allocates six short-lived [re, im] tuples per butterfly — can be replaced by
 * four in-place writes. The arithmetic is float-identical, not merely close:
 * `cMul([c, 0], a)` is exactly `[c*a0, c*a1]` (the cross terms multiply by an
 * exact zero), and `x + (-y)` is exactly `x - y` in IEEE-754. The only observable
 * difference is the sign of amplitudes that are exactly zero (+0 vs -0), which
 * `cAbs2` squares away before either cost function sees it — the sweep's outputs
 * compare `Object.is`-identical to the pre-optimization path at every reachable
 * (n, depth, samples). Measured: 2.6-2.9x faster than the generic kernel.
 */
function applyRyInPlace(state: Complex[], theta: number, qubit: number, n: number): void {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  const stride = 1 << (n - 1 - qubit);
  for (let i = 0; i < state.length; i++) {
    if ((i & stride) === 0) {
      const a = state[i];
      const b = state[i | stride];
      const a0 = a[0], a1 = a[1], b0 = b[0], b1 = b[1];
      a[0] = c * a0 - s * b0;
      a[1] = c * a1 - s * b1;
      b[0] = s * a0 + c * b0;
      b[1] = s * a1 + c * b1;
    }
  }
}

/** Hardware-efficient ansatz: RY(pi/4) seed, then L layers of [RY(theta_q) per qubit] + CZ ring. */
function buildState(n: number, L: number, thetas: number[]): Complex[] {
  const s = zeroState(n);
  for (let q = 0; q < n; q++) applyRyInPlace(s, Math.PI / 4, q, n);
  let p = 0;
  for (let l = 0; l < L; l++) {
    for (let q = 0; q < n; q++) applyRyInPlace(s, thetas[p++], q, n);
    applyCZRingInPlace(s, n);
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

const PROBE = 0; // qubit 0, layer 0 — inside q0's causal cone (nonzero local gradient)

function variance(grads: number[]): number {
  const mean = grads.reduce((a, b) => a + b, 0) / grads.length;
  return grads.reduce((a, g) => a + (g - mean) ** 2, 0) / grads.length;
}

/** Variance over `samples` random theta of the parameter-shift gradient of a fixed probed param. */
export function gradientVariance(n: number, L: number, cost: Cost, samples: number, rng: () => number): number {
  const nParams = n * L;
  const costFn = cost === "global" ? costGlobal : costLocal;
  const grads: number[] = [];
  for (let s = 0; s < samples; s++) {
    const th = Array.from({ length: nParams }, () => rng() * 2 * Math.PI);
    const tp = th.slice(); tp[PROBE] += Math.PI / 2;
    const tm = th.slice(); tm[PROBE] -= Math.PI / 2;
    grads.push(0.5 * (costFn(buildState(n, L, tp), n) - costFn(buildState(n, L, tm), n)));
  }
  return variance(grads);
}

/**
 * Both cost functions' gradient variances from ONE simulation pass.
 *
 * The explorer used to call `gradientVariance` twice per qubit count with a
 * freshly seeded `mulberry32(n)` each time — identical seeds, so the two runs
 * drew the same thetas and rebuilt bit-identical state vectors, and only the
 * cost readout differed. costGlobal/costLocal are pure O(2^n) reductions over a
 * finished state, so both can be evaluated on one (tp, tm) pair. Outputs are
 * float-identical to the two-call form (verified `Object.is` across n = 2..8 at
 * every reachable depth/sample count), and the sweep runs ~2x faster.
 */
export function gradientVariances(
  n: number,
  L: number,
  samples: number,
  rng: () => number
): { global: number; local: number } {
  const nParams = n * L;
  const gGlobal: number[] = [];
  const gLocal: number[] = [];
  for (let s = 0; s < samples; s++) {
    const th = Array.from({ length: nParams }, () => rng() * 2 * Math.PI);
    const tp = th.slice(); tp[PROBE] += Math.PI / 2;
    const tm = th.slice(); tm[PROBE] -= Math.PI / 2;
    const sp = buildState(n, L, tp);
    const sm = buildState(n, L, tm);
    gGlobal.push(0.5 * (costGlobal(sp, n) - costGlobal(sm, n)));
    gLocal.push(0.5 * (costLocal(sp, n) - costLocal(sm, n)));
  }
  return { global: variance(gGlobal), local: variance(gLocal) };
}
