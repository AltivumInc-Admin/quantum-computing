// Objective grading for a ```qexpect Rep. The truth is the EXACT expectation
// value ⟨ψ|P|ψ⟩, computed with the same qcsim-parity kernel every widget uses:
// simulate the concrete circuit, apply each single-qubit Pauli factor to a
// copy of the state, and take the (necessarily real) inner product. The three
// distractors are the canonical expectation-value MISCONCEPTIONS — not random
// noise — so a wrong pick diagnoses exactly which mental model slipped:
//
//   sign flip            -v          misread the phase the circuit prepared
//   probability confusion (1+v)/2    confused ⟨P⟩ with P(measuring +1)
//   determinism          ±1          expected a definite eigenvalue reading
//
// Values are settled in integer HUNDREDTHS (the 2-decimal display grid) so two
// options can never render identically — the same integer-settlement move
// cost-estimate-grade.ts makes with cents. Pure — no React, no storage.

import {
  NAMED_GATES,
  applyGate1,
  cConj,
  cMul,
  simulate,
  type Gate2,
} from "@/components/quantum/math";
import { parseProgram, opsFor, MAX_QUBITS } from "@/components/quantum/qsim-dsl";
import type { ExpectationSpec } from "./expectation-schema";

const PAULIS = new Set(["X", "Y", "Z"]);

export interface PauliFactor {
  pauli: "X" | "Y" | "Z";
  qubit: number;
}

export interface ParsedObservable {
  factors?: PauliFactor[];
  error?: string;
}

/** Parse "Z 0", "Z 0 Z 1", "X 0 Y 2" — one Pauli factor per site, at most once. */
export function parseObservable(source: string): ParsedObservable {
  const tokens = source.trim().split(/\s+/);
  if (tokens.length === 0 || tokens[0] === "") {
    return { error: "observable is empty" };
  }
  if (tokens.length % 2 !== 0) {
    return { error: `observable must be PAULI-qubit pairs (e.g. "Z 0 Z 1") — got an odd token count` };
  }
  const factors: PauliFactor[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < tokens.length; i += 2) {
    const pauli = tokens[i].toUpperCase();
    if (!PAULIS.has(pauli)) {
      return { error: `unknown Pauli "${tokens[i]}" — use X, Y, or Z` };
    }
    const qubit = Number(tokens[i + 1]);
    if (!Number.isInteger(qubit) || qubit < 0) {
      return { error: `"${tokens[i + 1]}" is not a valid qubit index` };
    }
    if (qubit >= MAX_QUBITS) {
      return { error: `qubit ${qubit} is beyond the ${MAX_QUBITS}-qubit in-browser limit` };
    }
    if (seen.has(qubit)) {
      return { error: `qubit ${qubit} appears twice — a Pauli string has one factor per site` };
    }
    seen.add(qubit);
    factors.push({ pauli: pauli as PauliFactor["pauli"], qubit });
  }
  return { factors };
}

/** Bare operator label, e.g. "Z₀Z₁" — what a single shot MEASURES. */
export function pauliString(factors: PauliFactor[]): string {
  const sub = (n: number) => String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
  return factors.map((f) => `${f.pauli}${sub(f.qubit)}`).join("");
}

/** Expectation-value label, e.g. "⟨Z₀Z₁⟩" — the long-run average, never a shot. */
export function observableLabel(factors: PauliFactor[]): string {
  return `⟨${pauliString(factors)}⟩`;
}

// Settle on the 2-decimal display grid ONCE (half-up with an IEEE epsilon),
// so option identity is decided exactly where the learner sees it.
const hundredthsOf = (v: number): number => Math.round(v * 100 + Math.sign(v) * 1e-7);

export const fmtExpectation = (v: number): string =>
  (v === 0 ? 0 : v).toFixed(2); // normalize -0 to 0 before display

/** djb2 + warmed LCG — the identical deterministic shuffle cost-estimate uses. */
function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return h >>> 0;
}
function seededOrder(n: number, id: string): number[] {
  let s = hashId(id) || 1;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  next();
  next();
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export interface ExpectationTruth {
  /** The exact ⟨P⟩, settled to the 2-decimal display grid. */
  value: number;
  /** P(+1 outcome) = (1 + ⟨P⟩)/2 — the reveal's single-shot story. */
  pPlus: number;
  /** Four distinct options in a deterministic per-Rep shuffle. */
  options: number[];
  correctIndex: number;
  factors: PauliFactor[];
  n: number;
}

export interface ExpectationTruthResult {
  truth?: ExpectationTruth;
  error?: string;
}

/**
 * `shuffleSalt` varies the option ORDER (never the values): the lesson surface
 * omits it for a stable layout, while /review passes the card's repetition
 * count so a scheduled re-review draws a fresh permutation — remembering
 * "second button" must not rate as mastery forever.
 */
export function expectationTruth(
  spec: ExpectationSpec,
  shuffleSalt?: string | number
): ExpectationTruthResult {
  const program = parseProgram(spec.program);
  if (program.error) {
    return { error: `this Rep's circuit is invalid: ${program.error}` };
  }
  if (program.hasTheta) {
    return { error: "this Rep's circuit must be concrete (no slider theta) — the truth kernel needs a fixed state." };
  }
  const obs = parseObservable(spec.observable);
  if (obs.error) return { error: `this Rep's observable is invalid: ${obs.error}` };
  const factors = obs.factors!;

  const n = Math.max(
    spec.qubits ?? 0,
    program.n,
    Math.max(...factors.map((f) => f.qubit)) + 1,
    1
  );
  if (n > MAX_QUBITS) {
    return { error: `this Rep is configured for ${n} qubits, beyond the ${MAX_QUBITS}-qubit in-browser limit.` };
  }

  // ⟨ψ|P|ψ⟩: apply each single-qubit Pauli factor to a copy of ψ, then take
  // the inner product with ψ. Pauli strings are Hermitian, so the result is
  // real to machine precision — a sizable imaginary part is an internal bug.
  const psi = simulate(opsFor(program, 0), n);
  let phi = psi.slice();
  for (const f of factors) {
    phi = applyGate1(phi, NAMED_GATES[f.pauli] as Gate2, f.qubit, n);
  }
  let re = 0;
  let im = 0;
  for (let i = 0; i < psi.length; i++) {
    const term = cMul(cConj(psi[i]), phi[i]);
    re += term[0];
    im += term[1];
  }
  if (Math.abs(im) > 1e-9) {
    return { error: "internal error: a Pauli-string expectation came out complex." };
  }

  const vH = hundredthsOf(re); // in hundredths, -100..100
  if (Math.abs(vH) > 100) {
    return { error: "internal error: a Pauli-string expectation left [-1, 1]." };
  }

  // Distractors as misconceptions, in priority order; take the first three
  // distinct from the truth and each other ON THE DISPLAY GRID. The pool has
  // enough spread that any truth in [-1, 1] yields three (proved by test).
  const poolH = [
    -vH, // sign flip
    hundredthsOf((1 + vH / 100) / 2), // P(+1) confusion
    vH >= 0 ? -100 : 100, // determinism, far extreme
    vH >= 0 ? 100 : -100, // determinism, near extreme
    0, // "superposition averages to nothing"
    50,
    -50,
  ];
  const distractorsH: number[] = [];
  for (const d of poolH) {
    if (d !== vH && !distractorsH.includes(d)) distractorsH.push(d);
    if (distractorsH.length === 3) break;
  }
  if (distractorsH.length < 3) {
    return { error: "this Rep's distractors collide — pick a different circuit/observable." };
  }

  const optionsH = [vH, ...distractorsH];
  const seedKey = shuffleSalt == null ? spec.id : `${spec.id}#${shuffleSalt}`;
  const options = seededOrder(4, seedKey).map((i) => optionsH[i] / 100);
  const correctIndex = options.findIndex((v) => hundredthsOf(v) === vH);

  return {
    truth: {
      value: vH / 100,
      // Settled on the SAME 2-decimal grid as the P(+1)-confusion distractor:
      // for odd truths the raw double can toFixed-round the other way, and the
      // reveal would then print 0.85 under a trap button reading 0.86 —
      // telling exactly the learner who held the misconception that their
      // arithmetic (not their concept) was off.
      pPlus: hundredthsOf((1 + vH / 100) / 2) / 100,
      options,
      correctIndex,
      factors,
      n,
    },
  };
}

/** Grade a committed pick against the truth. */
export function gradeExpectation(pickIndex: number, truth: ExpectationTruth): boolean {
  return pickIndex === truth.correctIndex;
}

/** A one-line recall answer for the /review card. */
export function expectationReviewAnswer(spec: ExpectationSpec, truth: ExpectationTruth): string {
  const steps = spec.program
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("; ");
  return `${observableLabel(truth.factors)} = ${fmtExpectation(truth.value)} for \`${steps}\``;
}
