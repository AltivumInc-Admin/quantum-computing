/**
 * Pure-TypeScript state-vector kernel for the inline `qsim` circuit lab.
 *
 * Conventions mirror qcsim (qcsim/src/qcsim/circuits.py) exactly so the browser
 * and Python simulators never disagree: state is a length-2^n array of complex
 * amplitudes, and qubit 0 is the MOST-significant bit of the basis-state index
 * (big-endian), matching Braket's measurement output. The committed gate
 * fixtures (__fixtures__/gates.json) are generated from qcsim, and
 * math.test.ts asserts these matrices agree to 1e-10.
 */

/** A complex number as [real, imaginary]. */
export type Complex = [number, number];

/** A 2x2 single-qubit gate. */
export type Gate2 = [[Complex, Complex], [Complex, Complex]];

// --- complex arithmetic ---------------------------------------------------

export const cAdd = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
export const cMul = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
export const cAbs2 = (a: Complex): number => a[0] * a[0] + a[1] * a[1];
export const cConj = (a: Complex): Complex => [a[0], -a[1]];

/** Clamp `v` into [min, max]. */
export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

const R2 = Math.SQRT1_2; // 1/sqrt(2)

// --- constant gate matrices (match qcsim) ---------------------------------

export const I: Gate2 = [[[1, 0], [0, 0]], [[0, 0], [1, 0]]];
export const X: Gate2 = [[[0, 0], [1, 0]], [[1, 0], [0, 0]]];
export const Y: Gate2 = [[[0, 0], [0, -1]], [[0, 1], [0, 0]]];
export const Z: Gate2 = [[[1, 0], [0, 0]], [[0, 0], [-1, 0]]];
export const H: Gate2 = [[[R2, 0], [R2, 0]], [[R2, 0], [-R2, 0]]];
export const S: Gate2 = [[[1, 0], [0, 0]], [[0, 0], [0, 1]]];
export const T: Gate2 = [[[1, 0], [0, 0]], [[0, 0], [Math.SQRT1_2, Math.SQRT1_2]]];

// --- parameterized rotation gates (match qcsim _rx/_ry/_rz) ---------------

export function rx(theta: number): Gate2 {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [[[c, 0], [0, -s]], [[0, -s], [c, 0]]];
}

export function ry(theta: number): Gate2 {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [[[c, 0], [-s, 0]], [[s, 0], [c, 0]]];
}

export function rz(theta: number): Gate2 {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [[[c, -s], [0, 0]], [[0, 0], [c, s]]];
}

export const NAMED_GATES: Record<string, Gate2> = { I, X, Y, Z, H, S, T };

// --- state-vector operations ----------------------------------------------

/** The |0...0> state for `n` qubits. */
export function zeroState(n: number): Complex[] {
  const state: Complex[] = Array.from({ length: 1 << n }, () => [0, 0] as Complex);
  state[0] = [1, 0];
  return state;
}

/** Apply a 2x2 gate to `qubit` (big-endian: qubit 0 is the MSB). */
export function applyGate1(state: Complex[], gate: Gate2, qubit: number, n: number): Complex[] {
  const out = state.map((c) => [c[0], c[1]] as Complex);
  const stride = 1 << (n - 1 - qubit);
  for (let i = 0; i < state.length; i++) {
    if ((i & stride) === 0) {
      const j = i | stride;
      const a = state[i];
      const b = state[j];
      out[i] = cAdd(cMul(gate[0][0], a), cMul(gate[0][1], b));
      out[j] = cAdd(cMul(gate[1][0], a), cMul(gate[1][1], b));
    }
  }
  return out;
}

/**
 * In-place butterfly variant of applyGate1: mutates `state` and returns it. Each
 * (i, j) stride pair is read fully before being written, so no entry is read
 * after it is overwritten. Use only when `state` is a private scratch vector
 * (e.g. the QAOA / Deutsch-Jozsa kernels); external callers keep applyGate1.
 */
export function applyGate1InPlace(state: Complex[], gate: Gate2, qubit: number, n: number): Complex[] {
  const stride = 1 << (n - 1 - qubit);
  for (let i = 0; i < state.length; i++) {
    if ((i & stride) === 0) {
      const j = i | stride;
      const a = state[i];
      const b = state[j];
      state[i] = cAdd(cMul(gate[0][0], a), cMul(gate[0][1], b));
      state[j] = cAdd(cMul(gate[1][0], a), cMul(gate[1][1], b));
    }
  }
  return state;
}

/** Apply CNOT: flip `target` when `control` is |1>. */
export function applyCNOT(state: Complex[], control: number, target: number, n: number): Complex[] {
  const out = state.map((c) => [c[0], c[1]] as Complex);
  const cMask = 1 << (n - 1 - control);
  const tMask = 1 << (n - 1 - target);
  for (let i = 0; i < state.length; i++) {
    if ((i & cMask) !== 0 && (i & tMask) === 0) {
      const j = i | tMask;
      out[i] = [state[j][0], state[j][1]];
      out[j] = [state[i][0], state[i][1]];
    }
  }
  return out;
}

/** Measurement probabilities P(basis state) = |amplitude|^2. */
export function probabilities(state: Complex[]): number[] {
  return state.map(cAbs2);
}

/** Bloch-sphere coordinates for a single-qubit state [a|0> + b|1>]. */
export function blochVector(state: Complex[]): { x: number; y: number; z: number } {
  const a = state[0];
  const b = state[1];
  const ab = cMul(cConj(a), b); // <0|psi>* <1|psi>
  return { x: 2 * ab[0], y: 2 * ab[1], z: cAbs2(a) - cAbs2(b) };
}

/**
 * Canonical single-qubit state from Bloch angles:
 *   cos(θ/2)|0> + e^{iφ} sin(θ/2)|1>   (relative phase on |1>, |0> real).
 * Shared by the qbloch builder and the qscrolly explorable so both render the
 * same amplitudes; the Bloch vector itself is convention-independent.
 */
export function singleQubitState(theta: number, phi: number): Complex[] {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [
    [c, 0],
    [s * Math.cos(phi), s * Math.sin(phi)],
  ];
}

/**
 * Great-circle angle (radians) between two single-qubit pure states on the
 * Bloch sphere: acos of the dot product of their (unit) Bloch vectors, clamped
 * against float drift past ±1. Global-phase-invariant because blochVector is.
 * This is the graded distance for the ```qblochtarget Rep — a slider-driven
 * state lands near but never bit-exactly on a target, so the challenge grader's
 * statesApproxEqual (eps 1e-9) is the wrong yardstick there.
 */
export function blochAngle(a: Complex[], b: Complex[]): number {
  const u = blochVector(a);
  const v = blochVector(b);
  const dot = u.x * v.x + u.y * v.y + u.z * v.z;
  return Math.acos(clamp(dot, -1, 1));
}

// --- a tiny circuit runner for the inline lab DSL -------------------------

export interface Op {
  gate: string; // H,X,Y,Z,S,T,I,RX,RY,RZ,CNOT
  target: number;
  control?: number;
  theta?: number;
}

/**
 * Resolve a single-qubit op (a named gate or RX/RY/RZ) to its 2x2 matrix; throws
 * for CNOT and unknown gates. Single-sources the gate-name -> matrix dispatch so
 * noise.ts's opMatrix and applyOp don't each re-implement it.
 */
export function gateMatrixFor(op: Op): Gate2 {
  const g = op.gate.toUpperCase();
  if (g === "RX") return rx(op.theta ?? 0);
  if (g === "RY") return ry(op.theta ?? 0);
  if (g === "RZ") return rz(op.theta ?? 0);
  const named = NAMED_GATES[g];
  if (named) return named;
  throw new Error(`unknown gate '${op.gate}'`);
}

/** Apply a single op to a state, returning the new state (no mutation). */
function applyOp(state: Complex[], op: Op, n: number): Complex[] {
  if (op.gate.toUpperCase() === "CNOT") {
    if (op.control === undefined) throw new Error("CNOT requires a control qubit");
    return applyCNOT(state, op.control, op.target, n);
  }
  return applyGate1(state, gateMatrixFor(op), op.target, n);
}

/** Run a sequence of ops on |0...0> and return the final state vector. */
export function simulate(ops: Op[], n: number): Complex[] {
  let state = zeroState(n);
  for (const op of ops) state = applyOp(state, op, n);
  return state;
}

/**
 * Snapshot the state after each op, including the initial |0...0> frame, so the
 * wavefunction scrubber can step gate-by-gate. `simulateSteps(ops, n)` returns
 * `ops.length + 1` frames; the last is identical to `simulate(ops, n)`.
 */
export function simulateSteps(ops: Op[], n: number): Complex[][] {
  const frames: Complex[][] = [zeroState(n)];
  let state = frames[0];
  for (const op of ops) {
    state = applyOp(state, op, n);
    frames.push(state);
  }
  return frames;
}

/**
 * Whether two state vectors are equal up to an unobservable global phase. Used
 * by the challenge grader: a learner's circuit is correct if its state matches
 * the target regardless of overall phase. Aligns phase on the first significant
 * amplitude of `a`, then compares all amplitudes within `eps`.
 */
export function statesApproxEqual(a: Complex[], b: Complex[], eps = 1e-9): boolean {
  if (a.length !== b.length) return false;
  let phase: Complex = [1, 0];
  for (let i = 0; i < a.length; i++) {
    if (cAbs2(a[i]) > eps * eps) {
      const num = cMul(b[i], cConj(a[i])); // b[i] / a[i], since |a[i]|^2 divides out
      const denom = cAbs2(a[i]);
      phase = [num[0] / denom, num[1] / denom];
      break;
    }
  }
  for (let i = 0; i < a.length; i++) {
    const rotated = cMul(a[i], phase);
    if (Math.abs(rotated[0] - b[i][0]) > eps || Math.abs(rotated[1] - b[i][1]) > eps) {
      return false;
    }
  }
  return true;
}

/** Binary basis-state label for index `i` over `n` qubits (qubit 0 leftmost). */
export function basisLabel(i: number, n: number): string {
  return i.toString(2).padStart(n, "0");
}
