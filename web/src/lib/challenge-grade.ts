// Instant, in-browser Tier-A grading: build the learner's circuit and the
// reference circuit with the qcsim-parity kernel and compare their state
// vectors up to global phase. Zero network, zero backend — the moat.

import { simulate, statesApproxEqual } from "@/components/quantum/math";
import { parseProgram, opsFor, MAX_QUBITS } from "@/components/quantum/qsim-dsl";
import type { ChallengeSpec } from "./challenge-schema";

export type GradeStatus = "solved" | "wrong" | "error";

export interface GradeResult {
  status: GradeStatus;
  message: string;
}

export function gradeTs(learnerSource: string, spec: ChallengeSpec): GradeResult {
  const learner = parseProgram(learnerSource);
  if (learner.error) {
    return { status: "error", message: `Your circuit: ${learner.error}` };
  }

  if (spec.allowedGates && spec.allowedGates.length > 0) {
    const allowed = new Set(spec.allowedGates.map((g) => g.toUpperCase()));
    for (const g of learner.gates) {
      if (!allowed.has(g.gate.toUpperCase())) {
        return {
          status: "error",
          message: `The ${g.gate} gate isn't allowed for this challenge — try [${spec.allowedGates.join(
            ", "
          )}].`,
        };
      }
    }
  }

  const target = parseProgram(spec.target.program);
  // The reference circuit must be valid and fully concrete: a parse error or a
  // slider-bound `theta` would otherwise be graded against the wrong state
  // (opsFor passes theta=0, collapsing a bound rotation to the identity).
  if (target.error) {
    return { status: "error", message: `This challenge's target circuit is invalid: ${target.error}` };
  }
  if (target.hasTheta) {
    return { status: "error", message: "This challenge's target circuit must be concrete (no slider theta)." };
  }
  const n = Math.max(spec.qubits ?? 0, target.n, learner.n, 1);
  // Defense-in-depth: the learner path is already hard-clamped in parseProgram,
  // but an author's spec.qubits/target.program is unbounded static content — cap
  // it so a typo (e.g. qubits: 30) degrades to a clear error instead of freezing
  // the tab on a 2**n allocation (and 1<<n overflows past 31 bits).
  if (n > MAX_QUBITS) {
    return {
      status: "error",
      message: `This challenge is configured for ${n} qubits, beyond the ${MAX_QUBITS}-qubit limit for in-browser grading.`,
    };
  }
  const targetState = simulate(opsFor(target, 0), n);
  const learnerState = simulate(opsFor(learner, 0), n);

  if (statesApproxEqual(learnerState, targetState)) {
    return { status: "solved", message: "Correct — your circuit prepares the target state." };
  }
  return {
    status: "wrong",
    message: spec.hint
      ? spec.hint
      : "Not quite — the resulting state doesn't match the target yet.",
  };
}
