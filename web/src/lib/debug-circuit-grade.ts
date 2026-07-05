// Instant, in-browser grading for a ```qdebug Rep — the challenge kernel with a
// debug-specific brain: the learner's EDITED circuit is graded against the
// target (up to global phase, same statesApproxEqual moat), and a wrong answer
// that is still state-equal to the ORIGINAL broken circuit gets the specific
// "you haven't changed the bug yet" diagnostic instead of the generic hint.
//
// debugTruth() is the author-time gate (mirroring blochTargetTruth's |0⟩ guard
// and costEstimateTruth's collision guard): both programs must parse, be
// concrete (no slider theta), fit the in-browser qubit cap, respect the Rep's
// own allowedGates, and — the load-bearing rule — the broken circuit must NOT
// already prepare the target state, or there is nothing to fix and the Rep
// would mint a free FSRS card at first Check.

import { simulate, statesApproxEqual, zeroState, type Complex } from "@/components/quantum/math";
import { parseProgram, opsFor, MAX_QUBITS, type Program } from "@/components/quantum/qsim-dsl";
import type { DebugCircuitSpec } from "./debug-circuit-schema";
import type { GradeResult } from "./challenge-grade";

export interface DebugTruth {
  targetState: Complex[];
  brokenState: Complex[];
  n: number;
  error?: string;
}

function gateViolation(parsed: Program, allowedGates: string[] | undefined): string | null {
  if (!allowedGates || allowedGates.length === 0) return null;
  const allowed = new Set(allowedGates.map((g) => g.toUpperCase()));
  for (const g of parsed.gates) {
    if (!allowed.has(g.gate.toUpperCase())) return g.gate;
  }
  return null;
}

/**
 * Validate the Rep's own two circuits and precompute both reference states.
 * An error here is an AUTHORING bug, surfaced loudly in the widget.
 */
export function debugTruth(spec: DebugCircuitSpec): DebugTruth {
  const fail = (error: string): DebugTruth => ({ targetState: [], brokenState: [], n: 1, error });

  const target = parseProgram(spec.target.program);
  if (target.error) return fail(`this Rep's target circuit is invalid: ${target.error}`);
  if (target.hasTheta) return fail("this Rep's target circuit must be concrete (no slider theta).");

  const broken = parseProgram(spec.broken.program);
  if (broken.error) return fail(`this Rep's broken circuit is invalid: ${broken.error}`);
  if (broken.hasTheta) return fail("this Rep's broken circuit must be concrete (no slider theta).");
  // The bug must be SEMANTIC (wrong gate / order / wiring), not a parse error —
  // otherwise the unchanged-bug diagnostic and the nothing-to-fix guard below
  // could not compare states at all.

  // The prefilled editor must itself be legal under the Rep's gate whitelist,
  // or the learner's very first Check of the unchanged circuit would return a
  // confusing "gate isn't allowed" error for code they didn't write.
  const brokenViolation = gateViolation(broken, spec.allowedGates);
  if (brokenViolation) {
    return fail(`this Rep's broken circuit uses ${brokenViolation}, which its own allowedGates forbids.`);
  }
  const targetViolation = gateViolation(target, spec.allowedGates);
  if (targetViolation) {
    return fail(`this Rep's target circuit uses ${targetViolation}, which its own allowedGates forbids.`);
  }

  const n = Math.max(spec.qubits ?? 0, target.n, broken.n, 1);
  if (n > MAX_QUBITS) {
    return fail(`this Rep is configured for ${n} qubits, beyond the ${MAX_QUBITS}-qubit limit for in-browser grading.`);
  }

  const targetState = simulate(opsFor(target, 0), n);
  const brokenState = simulate(opsFor(broken, 0), n);
  if (statesApproxEqual(brokenState, targetState)) {
    return fail("this Rep's broken circuit already prepares the target state — there is nothing to fix.");
  }
  // Mirror blochTargetTruth's |0⟩ guard for real: a |0…0⟩ target means
  // deleting every gate (an empty program simulates to the start state)
  // "solves" the Rep without engaging the bug — a free "good" card.
  if (statesApproxEqual(targetState, zeroState(n))) {
    return fail("this Rep's target is the |0…0⟩ start state — deleting every gate would solve it without engaging the bug.");
  }
  return { targetState, brokenState, n };
}

/** Grade the learner's edited circuit against a precomputed truth. */
export function gradeDebug(
  learnerSource: string,
  spec: DebugCircuitSpec,
  truth: DebugTruth
): GradeResult {
  if (truth.error) {
    return { status: "error", message: `debug error: ${truth.error}` };
  }

  const learner = parseProgram(learnerSource);
  if (learner.error) {
    return { status: "error", message: `Your circuit: ${learner.error}` };
  }
  const violation = gateViolation(learner, spec.allowedGates);
  if (violation) {
    return {
      status: "error",
      message: `The ${violation} gate isn't allowed for this Rep — try [${spec.allowedGates!.join(", ")}].`,
    };
  }
  // A learner circuit that grows past the truth's qubit count can't match the
  // target anyway, but cap it before 2**n allocation, same as gradeTs.
  const n = Math.max(truth.n, learner.n);
  if (n > MAX_QUBITS) {
    return {
      status: "error",
      message: `Your circuit uses ${n} qubits, beyond the ${MAX_QUBITS}-qubit limit for in-browser grading.`,
    };
  }
  const learnerState = simulate(opsFor(learner, 0), n);
  // The truth states were simulated at truth.n; if the learner widened the
  // register, re-simulate the references at the same width for a fair compare.
  const targetState =
    n === truth.n ? truth.targetState : simulate(opsFor(parseProgram(spec.target.program), 0), n);
  const brokenState =
    n === truth.n ? truth.brokenState : simulate(opsFor(parseProgram(spec.broken.program), 0), n);

  if (statesApproxEqual(learnerState, targetState)) {
    return { status: "solved", message: "Correct — your fix prepares the target state." };
  }
  if (statesApproxEqual(learnerState, brokenState)) {
    // The most common debug failure: edits that don't change the state (or no
    // edit at all). Name it precisely instead of burning the hint on it.
    return {
      status: "wrong",
      message:
        "You haven't changed the bug yet — the circuit still prepares the same wrong state it started with.",
    };
  }
  return {
    status: "wrong",
    message: spec.hint ?? "Your edit changed the state, but it doesn't match the target yet.",
  };
}
