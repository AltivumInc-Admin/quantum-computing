import {
  type Complex, type Gate2, type Op,
  cAdd, cMul, cConj,
  I as I2, X, Y, Z, H, S, T, rx, ry, rz,
} from "./math";

export type CMatrix = Complex[][];
export type ChannelName = "depolarizing" | "amplitude-damping" | "bit-flip";

const zero: Complex = [0, 0];

function zeros(d: number): CMatrix {
  return Array.from({ length: d }, () => Array.from({ length: d }, () => zero as Complex));
}
function identity(d: number): CMatrix {
  const m = zeros(d);
  for (let i = 0; i < d; i++) m[i][i] = [1, 0];
  return m;
}
function kron(a: CMatrix, b: CMatrix): CMatrix {
  const ar = a.length, ac = a[0].length, br = b.length, bc = b[0].length;
  const res: CMatrix = Array.from({ length: ar * br }, () => Array.from({ length: ac * bc }, () => zero as Complex));
  for (let i = 0; i < ar; i++)
    for (let j = 0; j < ac; j++)
      for (let k = 0; k < br; k++)
        for (let l = 0; l < bc; l++)
          res[i * br + k][j * bc + l] = cMul(a[i][j], b[k][l]);
  return res;
}
function matMul(a: CMatrix, b: CMatrix): CMatrix {
  const n = a.length, m = b[0].length, p = b.length;
  const res: CMatrix = Array.from({ length: n }, () => Array.from({ length: m }, () => zero as Complex));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      let s: Complex = [0, 0];
      for (let k = 0; k < p; k++) s = cAdd(s, cMul(a[i][k], b[k][j]));
      res[i][j] = s;
    }
  return res;
}
function dagger(a: CMatrix): CMatrix {
  const r = a.length, c = a[0].length;
  const res: CMatrix = Array.from({ length: c }, () => Array.from({ length: r }, () => zero as Complex));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) res[j][i] = cConj(a[i][j]);
  return res;
}
function addMat(a: CMatrix, b: CMatrix): CMatrix {
  return a.map((row, i) => row.map((v, j) => cAdd(v, b[i][j])));
}
function gate2ToMatrix(g: Gate2): CMatrix {
  return [[g[0][0], g[0][1]], [g[1][0], g[1][1]]];
}
function expandSingle(g: Gate2, qubit: number, n: number): CMatrix {
  let res: CMatrix = [[[1, 0]]];
  for (let q = 0; q < n; q++) res = kron(res, q === qubit ? gate2ToMatrix(g) : identity(2));
  return res;
}
function expandCNOT(control: number, target: number, n: number): CMatrix {
  const d = 1 << n;
  const m = zeros(d);
  const cMask = 1 << (n - 1 - control);
  const tMask = 1 << (n - 1 - target);
  for (let i = 0; i < d; i++) {
    const j = i & cMask ? i ^ tMask : i;
    m[j][i] = [1, 0];
  }
  return m;
}
function conjugate(U: CMatrix, rho: CMatrix): CMatrix {
  return matMul(matMul(U, rho), dagger(U));
}
function scaleGate(g: Gate2, s: number): Gate2 {
  return [
    [[g[0][0][0] * s, g[0][0][1] * s], [g[0][1][0] * s, g[0][1][1] * s]],
    [[g[1][0][0] * s, g[1][0][1] * s], [g[1][1][0] * s, g[1][1][1] * s]],
  ];
}

export function krausFor(channel: ChannelName, p: number): Gate2[] {
  if (channel === "depolarizing") {
    const a = Math.sqrt(1 - p), b = Math.sqrt(p / 3);
    return [scaleGate(I2, a), scaleGate(X, b), scaleGate(Y, b), scaleGate(Z, b)];
  }
  if (channel === "bit-flip") {
    return [scaleGate(I2, Math.sqrt(1 - p)), scaleGate(X, Math.sqrt(p))];
  }
  const g = p;
  const K0: Gate2 = [[[1, 0], [0, 0]], [[0, 0], [Math.sqrt(1 - g), 0]]];
  const K1: Gate2 = [[[0, 0], [Math.sqrt(g), 0]], [[0, 0], [0, 0]]];
  return [K0, K1];
}

function applyChannel1(rho: CMatrix, kraus: Gate2[], qubit: number, n: number): CMatrix {
  let out = zeros(1 << n);
  for (const k of kraus) out = addMat(out, conjugate(expandSingle(k, qubit, n), rho));
  return out;
}

function opMatrix(op: Op, n: number): { U: CMatrix; qubits: number[] } {
  const g = op.gate.toUpperCase();
  if (g === "CNOT") return { U: expandCNOT(op.control!, op.target, n), qubits: [op.control!, op.target] };
  const gate: Gate2 =
    g === "RX" ? rx(op.theta ?? 0) : g === "RY" ? ry(op.theta ?? 0) : g === "RZ" ? rz(op.theta ?? 0)
    : g === "X" ? X : g === "Y" ? Y : g === "Z" ? Z : g === "H" ? H : g === "S" ? S : g === "T" ? T : I2;
  return { U: expandSingle(gate, op.target, n), qubits: [op.target] };
}

/** Full noisy density matrix after the Kraus-channel run (n <= 3 qubits). */
export function noisyRho(ops: Op[], n: number, channel: ChannelName, p: number): CMatrix {
  if (n > 3) throw new Error("qnoise supports up to 3 qubits");
  const d = 1 << n;
  let rho = zeros(d);
  rho[0][0] = [1, 0];
  for (const op of ops) {
    const { U, qubits } = opMatrix(op, n);
    rho = conjugate(U, rho);
    if (p > 0) {
      const kraus = krausFor(channel, p);
      for (const q of qubits) rho = applyChannel1(rho, kraus, q, n);
    }
  }
  return rho;
}

/** Diagonal of the noisy density matrix = measurement probabilities. */
export function noisyProbs(ops: Op[], n: number, channel: ChannelName, p: number): number[] {
  return noisyRho(ops, n, channel, p).map((row, i) => row[i][0]);
}

/**
 * True quantum state fidelity F = <psi|rho|psi> of a noisy density matrix against
 * the ideal PURE state |psi>. Unlike a classical distribution overlap of the
 * diagonals, this sees coherences, so amplitude-damping / depolarizing correctly
 * drag it below 1 even where the measurement probabilities barely move. Clamped
 * to [0,1] against tiny numerical excursions; F is real because rho is Hermitian.
 */
export function stateFidelity(psi: Complex[], rho: CMatrix): number {
  const d = psi.length;
  let re = 0;
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      // conj(psi_i) * rho_ij * psi_j, accumulate the real part.
      const t = cMul(cConj(psi[i]), cMul(rho[i][j], psi[j]));
      re += t[0];
    }
  }
  return Math.max(0, Math.min(1, re));
}

/** Classical distribution overlap (squared Bhattacharyya) of two prob vectors. */
export function fidelityDist(ideal: number[], noisy: number[]): number {
  let s = 0;
  for (let i = 0; i < ideal.length; i++) s += Math.sqrt(Math.max(0, ideal[i]) * Math.max(0, noisy[i]));
  return s * s;
}
