// Instant, in-browser Tier-A grading: build the learner's circuit and the
// reference circuit with the qcsim-parity kernel and compare their state
// vectors up to global phase. Zero network, zero backend — the moat.

import { simulate, statesApproxEqual } from "@/components/quantum/math";
import { parseProgram, opsFor } from "@/components/quantum/qsim-dsl";
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
  const n = Math.max(spec.qubits ?? 0, target.n, learner.n, 1);
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
