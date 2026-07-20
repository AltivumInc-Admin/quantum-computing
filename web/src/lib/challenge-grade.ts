// Instant, in-browser Tier-A grading: build the learner's circuit and the
// reference circuit with the qcsim-parity kernel and compare their state
// vectors up to global phase. Zero network, zero backend — the moat.

import { simulate, statesApproxEqual, type Complex } from "@/components/quantum/math";
import { parseProgram, opsFor, MAX_QUBITS, type Program } from "@/components/quantum/qsim-dsl";
import type { ChallengeSpec } from "./challenge-schema";

export type GradeStatus = "solved" | "wrong" | "error";

export interface GradeResult {
  status: GradeStatus;
  message: string;
  /** On a solve, the size of the learner's circuit — the raw skill measurement. */
  metrics?: { gates: number; qubits: number };
}

/**
 * The first gate in `parsed` that falls outside `allowedGates`, or null when the
 * program is clean (or the Rep declares no whitelist). Lives here, in the kernel
 * both graders already depend on, because debug-circuit-grade.ts had an
 * identical Set-and-scan of its own — two implementations of one rule, whose
 * learner-facing messages had already drifted ("this challenge" vs "this Rep").
 * The message stays at the CALL SITE so each Rep kind keeps its own noun.
 */
export function gateViolation(
  parsed: Program,
  allowedGates: string[] | undefined
): string | null {
  if (!allowedGates || allowedGates.length === 0) return null;
  const allowed = new Set(allowedGates.map((g) => g.toUpperCase()));
  for (const g of parsed.gates) {
    if (!allowed.has(g.gate.toUpperCase())) return g.gate;
  }
  return null;
}

/** A validated, simulated reference circuit — or the reason it is unusable. */
export type ResolvedTarget = { state: Complex[]; n: number } | { error: string };

/**
 * Validate the AUTHOR's reference circuit and simulate it at the grading width.
 *
 * Both tiers ran a byte-identical copy of this gate (parse, reject a parse
 * error, reject a slider-bound theta, derive n, cap at MAX_QUBITS, simulate) and
 * both prior fixes to it had to be applied twice. Only the width contribution
 * genuinely differs between tiers, so it enters as `extraWidth`: gradeTs passes
 * `max(spec.qubits ?? 0, learner.n)`, gradePy passes the qubit count implied by
 * the length of the state vector its Python actually produced.
 */
export function resolveTarget(spec: ChallengeSpec, extraWidth: number): ResolvedTarget {
  const target = parseProgram(spec.target.program);
  // The reference circuit must be valid and fully concrete: a parse error or a
  // slider-bound `theta` would otherwise be graded against the wrong state
  // (opsFor passes theta=0, collapsing a bound rotation to the identity).
  if (target.error) {
    return { error: `This challenge's target circuit is invalid: ${target.error}` };
  }
  if (target.hasTheta) {
    return { error: "This challenge's target circuit must be concrete (no slider theta)." };
  }
  const n = Math.max(extraWidth, target.n, 1);
  // Defense-in-depth: the learner path is already hard-clamped in parseProgram,
  // but an author's spec.qubits/target.program is unbounded static content — cap
  // it so a typo (e.g. qubits: 30) degrades to a clear error instead of freezing
  // the tab on a 2**n allocation (and 1<<n overflows past 31 bits).
  if (n > MAX_QUBITS) {
    return {
      error: `This challenge is configured for ${n} qubits, beyond the ${MAX_QUBITS}-qubit limit for in-browser grading.`,
    };
  }
  return { state: simulate(opsFor(target, 0), n), n };
}

export function gradeTs(learnerSource: string, spec: ChallengeSpec): GradeResult {
  const learner = parseProgram(learnerSource);
  if (learner.error) {
    return { status: "error", message: `Your circuit: ${learner.error}` };
  }

  const violation = gateViolation(learner, spec.allowedGates);
  if (violation) {
    return {
      status: "error",
      message: `The ${violation} gate isn't allowed for this challenge — try [${spec.allowedGates!.join(
        ", "
      )}].`,
    };
  }

  const resolved = resolveTarget(spec, Math.max(spec.qubits ?? 0, learner.n));
  if ("error" in resolved) {
    return { status: "error", message: resolved.error };
  }
  const { state: targetState, n } = resolved;
  const learnerState = simulate(opsFor(learner, 0), n);

  if (statesApproxEqual(learnerState, targetState)) {
    return {
      status: "solved",
      message: "Correct — your circuit prepares the target state.",
      metrics: { gates: learner.gates.length, qubits: n },
    };
  }
  return {
    status: "wrong",
    message: spec.hint
      ? spec.hint
      : "Not quite — the resulting state doesn't match the target yet.",
  };
}
