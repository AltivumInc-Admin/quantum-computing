/**
 * Pure-TypeScript quantum-chemistry kernel for the VQE web widgets
 * (qham, qvqe, qpes). Builds on the state-vector kernel in math.ts and adds the
 * machinery VQE needs: Pauli-string expectation values, weighted-Hamiltonian
 * expectations, a dense Pauli/Hamiltonian matrix builder, a small real-symmetric
 * Jacobi eigensolver for the exact ground energy, a 1-qubit VQE optimizer, and a
 * typed loader for the committed H2 dissociation fixture.
 *
 * Conventions match math.ts exactly: amplitudes are Complex = [re, im], and Pauli
 * strings are BIG-ENDIAN — char k of a PauliString acts on qubit k, with qubit 0
 * the most-significant bit of the basis-state index (same as basisLabel). The H2
 * STO-3G Hamiltonian is real-symmetric (every term has an even number of Y
 * factors), so the eigensolver works on the real part.
 */

import {
  type Complex,
  type Gate2,
  I,
  X,
  Y,
  Z,
  ry,
  zeroState,
  applyGate1,
  cAdd,
  cMul,
  cConj,
} from "./math";

// --- Pauli / Hamiltonian types -------------------------------------------

/** A Pauli string over {I,X,Y,Z}; char k acts on qubit k (big-endian). */
export type PauliString = string;

/** A single weighted Pauli term c_i P_i. */
export interface PauliTerm {
  coeff: number;
  pauli: PauliString;
}

/** A Hamiltonian as a sum of weighted Pauli terms. */
export type Hamiltonian = PauliTerm[];

const PAULI_GATE: Record<string, Gate2> = { I, X, Y, Z };

// --- expectation values ---------------------------------------------------

/** Apply a Pauli string to a state (each non-identity factor via applyGate1). */
function applyPauli(state: Complex[], pauli: PauliString, n: number): Complex[] {
  let s = state;
  for (let q = 0; q < n; q++) {
    const p = pauli[q];
    if (p === "I") continue;
    s = applyGate1(s, PAULI_GATE[p], q, n);
  }
  return s;
}

/**
 * <psi|P|psi> for a Pauli string P. Equals Re sum_k conj(psi[k]) (P psi)[k];
 * the result is real for any (Hermitian) Pauli string.
 */
export function pauliExpectation(state: Complex[], pauli: PauliString): number {
  const n = pauli.length;
  const Ppsi = applyPauli(state, pauli, n);
  let re = 0;
  for (let k = 0; k < state.length; k++) {
    re += cMul(cConj(state[k]), Ppsi[k])[0];
  }
  return re;
}

/** <H> = sum_i coeff_i <P_i>. */
export function hamiltonianExpectation(state: Complex[], H: Hamiltonian): number {
  let e = 0;
  for (const t of H) e += t.coeff * pauliExpectation(state, t.pauli);
  return e;
}

/**
 * Closed-form energy of the tapered single-qubit H2 Hamiltonian
 * H = c0 I + cz Z + cx X for the ansatz RY(theta)|0>, where <Z> = cos(theta) and
 * <X> = sin(theta). Equals hamiltonianExpectation(RY(theta)|0>, [...]) exactly.
 */
export function energy1q(c0: number, cz: number, cx: number, theta: number): number {
  return c0 + cz * Math.cos(theta) + cx * Math.sin(theta);
}

/** The tapered single-qubit H2 Hamiltonian as a Hamiltonian term list. */
export function oneQubitHamiltonian(c0: number, cz: number, cx: number): Hamiltonian {
  return [
    { coeff: c0, pauli: "I" },
    { coeff: cz, pauli: "Z" },
    { coeff: cx, pauli: "X" },
  ];
}

// --- dense matrices + eigensolver -----------------------------------------

/** Kronecker product of two complex matrices. */
function kron(a: Complex[][], b: Complex[][]): Complex[][] {
  const ra = a.length;
  const ca = a[0].length;
  const rb = b.length;
  const cb = b[0].length;
  const out: Complex[][] = Array.from({ length: ra * rb }, () =>
    Array.from({ length: ca * cb }, () => [0, 0] as Complex)
  );
  for (let i = 0; i < ra; i++)
    for (let j = 0; j < ca; j++)
      for (let k = 0; k < rb; k++)
        for (let l = 0; l < cb; l++) out[i * rb + k][j * cb + l] = cMul(a[i][j], b[k][l]);
  return out;
}

/** Dense 2^n x 2^n matrix of a Pauli string via Kronecker products. */
export function pauliMatrix(pauli: PauliString): Complex[][] {
  let m: Complex[][] = [[[1, 0]]]; // 1x1 scalar identity
  for (const p of pauli) m = kron(m, PAULI_GATE[p] as unknown as Complex[][]);
  return m;
}

/** Dense Hermitian matrix sum_i coeff_i P_i. */
export function hamiltonianMatrix(H: Hamiltonian): Complex[][] {
  const n = H[0].pauli.length;
  const dim = 1 << n;
  const out: Complex[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => [0, 0] as Complex)
  );
  for (const t of H) {
    const pm = pauliMatrix(t.pauli);
    const c: Complex = [t.coeff, 0];
    for (let i = 0; i < dim; i++)
      for (let j = 0; j < dim; j++) out[i][j] = cAdd(out[i][j], cMul(c, pm[i][j]));
  }
  return out;
}

/**
 * Eigendecomposition of a real-symmetric matrix via the classic (Numerical
 * Recipes) cyclic Jacobi method. Each rotation uses the bounded tangent form
 * (|angle| <= pi/4), which guarantees monotonic convergence even on degenerate
 * spectra — a naive `atan2` angle can exceed pi/4 and cycle without converging.
 * Returns eigenvalues ascending with their eigenvectors (vectors[k] is the k-th
 * eigenvector). Sized for the small (2x2 … 16x16) matrices used here.
 */
export function eighSymmetric(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const n = matrix.length;
  const a = matrix.map((row) => row.slice());
  const v = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
  const d = a.map((row, i) => row[i]); // running eigenvalue estimates
  const b = d.slice();
  const z = new Array(n).fill(0);

  // Rotate a[i][j] and a[k][l] using (s, tau) — the NR `ROTATE` macro.
  const rot = (m: number[][], i: number, j: number, k: number, l: number, s: number, tau: number) => {
    const g = m[i][j];
    const h = m[k][l];
    m[i][j] = g - s * (h + g * tau);
    m[k][l] = h + s * (g - h * tau);
  };

  for (let sweep = 0; sweep < 100; sweep++) {
    let sm = 0;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) sm += Math.abs(a[p][q]);
    if (sm === 0) break; // fully diagonal -> done
    const thresh = sweep < 3 ? (0.2 * sm) / (n * n) : 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const g = 100 * Math.abs(a[p][q]);
        if (sweep > 3 && Math.abs(d[p]) + g === Math.abs(d[p]) && Math.abs(d[q]) + g === Math.abs(d[q])) {
          a[p][q] = 0;
        } else if (Math.abs(a[p][q]) > thresh) {
          let h = d[q] - d[p];
          let t: number;
          if (Math.abs(h) + g === Math.abs(h)) {
            t = a[p][q] / h;
          } else {
            const theta = (0.5 * h) / a[p][q];
            t = 1 / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
            if (theta < 0) t = -t;
          }
          const c = 1 / Math.sqrt(1 + t * t);
          const s = t * c;
          const tau = s / (1 + c);
          h = t * a[p][q];
          z[p] -= h;
          z[q] += h;
          d[p] -= h;
          d[q] += h;
          a[p][q] = 0;
          for (let j = 0; j < p; j++) rot(a, j, p, j, q, s, tau);
          for (let j = p + 1; j < q; j++) rot(a, p, j, j, q, s, tau);
          for (let j = q + 1; j < n; j++) rot(a, p, j, q, j, s, tau);
          for (let j = 0; j < n; j++) rot(v, j, p, j, q, s, tau);
        }
      }
    }
    for (let p = 0; p < n; p++) {
      b[p] += z[p];
      d[p] = b[p];
      z[p] = 0;
    }
  }

  const order = d.map((_, i) => i).sort((i, j) => d[i] - d[j]);
  return {
    values: order.map((i) => d[i]),
    vectors: order.map((i) => v.map((row) => row[i])),
  };
}

/** Smallest eigenpair (exact ground state) of a Hamiltonian. */
export function exactGround(H: Hamiltonian): { energy: number; vector: Complex[] } {
  const real = hamiltonianMatrix(H).map((row) => row.map((c) => c[0]));
  const { values, vectors } = eighSymmetric(real);
  return { energy: values[0], vector: vectors[0].map((x) => [x, 0] as Complex) };
}

// --- 1-qubit VQE ----------------------------------------------------------

/** Prepare the 1-qubit RY ansatz state RY(theta[0])|0>. */
export function prepareAnsatz(theta: number[]): Complex[] {
  return applyGate1(zeroState(1), ry(theta[0]), 0, 1);
}

/** VQE objective: <H> for the RY ansatz at the given angle(s). */
export function vqeEnergy(theta: number[], H: Hamiltonian): number {
  return hamiltonianExpectation(prepareAnsatz(theta), H);
}

/** 1-D grid search for the minimum VQE energy over theta. */
export function vqeGridSearch(
  H: Hamiltonian,
  res: number,
  range: [number, number] = [-Math.PI, Math.PI]
): { theta: number[]; energy: number } {
  let best = { theta: [range[0]], energy: Infinity };
  for (let i = 0; i < res; i++) {
    const th = range[0] + ((range[1] - range[0]) * i) / (res - 1);
    const e = vqeEnergy([th], H);
    if (e < best.energy) best = { theta: [th], energy: e };
  }
  return best;
}

/**
 * Parameter-shift gradient descent minimizing the VQE energy. Returns the final
 * angle/energy and the per-step energy history (for plotting a convergence
 * trace). The RY parameter-shift rule is dE/dtheta = 1/2 [E(theta+pi/2) - E(theta-pi/2)].
 */
export function vqeGradientDescent(
  H: Hamiltonian,
  theta0: number[],
  lr: number,
  steps: number
): { theta: number[]; energy: number; history: number[] } {
  let theta = theta0.slice();
  const history: number[] = [];
  for (let s = 0; s < steps; s++) {
    history.push(vqeEnergy(theta, H));
    const grad = theta.map((_, i) => {
      const tp = theta.slice();
      tp[i] += Math.PI / 2;
      const tm = theta.slice();
      tm[i] -= Math.PI / 2;
      return 0.5 * (vqeEnergy(tp, H) - vqeEnergy(tm, H));
    });
    theta = theta.map((t, i) => t - lr * grad[i]);
  }
  const energy = vqeEnergy(theta, H);
  history.push(energy);
  return { theta, energy, history };
}

// --- H2 dissociation fixture ----------------------------------------------

/** One bond-length sample from the committed H2 fixture. */
export interface H2Point {
  R: number;
  c0: number;
  cz: number;
  cx: number;
  fci: number;
  hf: number;
  jw: number[];
}

/** The full committed H2 dissociation fixture. */
export interface H2Curve {
  molecule: string;
  basis: string;
  provenance: string;
  jwTerms: string[];
  equilibrium: { R: number; fci: number; hf: number };
  points: H2Point[];
}

/** Validate + type the committed h2_dissociation.json (throws on shape mismatch). */
export function loadH2Curve(json: unknown): H2Curve {
  const o = json as Partial<H2Curve>;
  if (
    !o ||
    typeof o.basis !== "string" ||
    !Array.isArray(o.jwTerms) ||
    !Array.isArray(o.points) ||
    o.points.length === 0
  ) {
    throw new Error("loadH2Curve: malformed fixture");
  }
  let prevR = -Infinity;
  for (const p of o.points) {
    const fields = [p.R, p.c0, p.cz, p.cx, p.fci, p.hf];
    if (fields.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
      throw new Error("loadH2Curve: non-finite point field");
    }
    if (!Array.isArray(p.jw) || p.jw.length !== o.jwTerms.length) {
      throw new Error("loadH2Curve: jw length mismatch");
    }
    if (p.R <= prevR) throw new Error("loadH2Curve: R must be strictly increasing");
    prevR = p.R;
  }
  // `molecule` and `provenance` are rendered verbatim by qham's footer.
  if (typeof o.molecule !== "string" || typeof o.provenance !== "string") {
    throw new Error("loadH2Curve: missing molecule/provenance");
  }
  // `equilibrium` was the one declared field the loader never touched, yet qpes
  // prints four teaching facts from it (equilibrium R, min FCI, well depth) and
  // draws its amber marker at (equilibrium.R, equilibrium.fci) — a coordinate
  // pair sourced independently of the FCI path it is supposed to sit on. qham
  // and qvqe also open on equilibrium.R. So tie it to the curve: it must BE the
  // sampled minimum, not a hand-maintained restatement of one.
  const eq = o.equilibrium;
  if (
    !eq ||
    typeof eq !== "object" ||
    [eq.R, eq.fci, eq.hf].some((x) => typeof x !== "number" || !Number.isFinite(x))
  ) {
    throw new Error("loadH2Curve: malformed equilibrium block");
  }
  const argmin = o.points.reduce((a, b) => (b.fci < a.fci ? b : a));
  // The fixture carries 6 decimals; 1e-6 is its own precision, not a tolerance.
  if (
    Math.abs(eq.R - argmin.R) > 1e-9 ||
    Math.abs(eq.fci - argmin.fci) > 1e-6 ||
    Math.abs(eq.hf - argmin.hf) > 1e-6
  ) {
    throw new Error("loadH2Curve: equilibrium is not the sampled minimum");
  }
  return o as H2Curve;
}

function h2Bracket(R: number, points: H2Point[]): { a: H2Point; b: H2Point; t: number } {
  const first = points[0];
  const last = points[points.length - 1];
  if (R <= first.R) return { a: first, b: first, t: 0 };
  if (R >= last.R) return { a: last, b: last, t: 0 };
  let i = 0;
  while (i < points.length - 1 && points[i + 1].R < R) i++;
  const a = points[i];
  const b = points[i + 1];
  return { a, b, t: (R - a.R) / (b.R - a.R) };
}

/** Linearly interpolate the tapered (c0, cz, cx) at bond length R. */
export function h2OneQubit(
  R: number,
  points: H2Point[]
): { c0: number; cz: number; cx: number } {
  const { a, b, t } = h2Bracket(R, points);
  return {
    c0: a.c0 + t * (b.c0 - a.c0),
    cz: a.cz + t * (b.cz - a.cz),
    cx: a.cx + t * (b.cx - a.cx),
  };
}

/** Linearly interpolate the FCI and restricted-HF energies at bond length R. */
export function h2Energies(R: number, points: H2Point[]): { fci: number; hf: number } {
  const { a, b, t } = h2Bracket(R, points);
  return { fci: a.fci + t * (b.fci - a.fci), hf: a.hf + t * (b.hf - a.hf) };
}

/** Exact ground energy of the tapered single-qubit H = c0 I + cz Z + cx X. */
export function oneQubitGroundEnergy(c0: number, cz: number, cx: number): number {
  return c0 - Math.hypot(cz, cx);
}

/** Build the 4-qubit JW Hamiltonian for a fixture point. */
export function jwHamiltonian(jwTerms: string[], coeffs: number[]): Hamiltonian {
  return jwTerms.map((pauli, i) => ({ coeff: coeffs[i], pauli }));
}
