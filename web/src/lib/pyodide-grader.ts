// Tier-B grading: run the learner's REAL Braket-style Python in the browser via
// Pyodide + the qcsim wheel, then verify the resulting state vector against the
// challenge's reference circuit (computed in TS) up to global phase.
//
// This is the advanced, free-form path. It loads a standalone Pyodide runtime
// from CDN on first use and installs the same qcsim wheel the in-browser lab
// ships (single-sourced via the content manifest), so `from braket.circuits
// import Circuit` resolves to qcsim exactly as it does in the lab. The module is
// imported lazily (only when a tier:"py" challenge is checked) so it never
// touches the main bundle.
//
// NOTE: requires a live browser (Pyodide/WebAssembly + network for the CDN
// runtime); it cannot run under jsdom. All shipped challenges currently use the
// instant Tier-A TS grader; this path is wired and ready for free-form Python
// challenges and should be verified end-to-end in a browser before authoring
// tier:"py" content.

import { simulate, statesApproxEqual, type Complex } from "@/components/quantum/math";
import { parseProgram, opsFor, MAX_QUBITS } from "@/components/quantum/qsim-dsl";
import { getPyodide, runSerialized, type Pyodide } from "./pyodide-runtime";
import type { ChallengeSpec } from "./challenge-schema";
import type { GradeResult } from "./challenge-grade";

export async function gradePy(
  learnerSource: string,
  spec: ChallengeSpec
): Promise<GradeResult> {
  let py: Pyodide;
  try {
    py = await getPyodide();
  } catch (e) {
    return { status: "error", message: `Couldn't start Python: ${(e as Error).message}` };
  }

  // The challenge convention: the learner assigns their circuit to `circuit`.
  const program =
    `${learnerSource}\n` +
    `import json as _json, numpy as _np\n` +
    `_sv = circuit.state_vector()\n` +
    `_json.dumps([[float(_np.real(z)), float(_np.imag(z))] for z in _sv])\n`;

  // Run in a fresh, serialized namespace so a `circuit` left over from an earlier
  // editor/grader run can never stand in for one the submission failed to define.
  let learnerState: Complex[];
  try {
    learnerState = JSON.parse((await runSerialized(py, program)) as string) as Complex[];
  } catch (e) {
    return { status: "error", message: `Your code raised: ${(e as Error).message}` };
  }

  const target = parseProgram(spec.target.program);
  // Reference circuit must be valid and concrete — see gradeTs for the same guard.
  if (target.error) {
    return { status: "error", message: `This challenge's target circuit is invalid: ${target.error}` };
  }
  if (target.hasTheta) {
    return { status: "error", message: "This challenge's target circuit must be concrete (no slider theta)." };
  }
  const n = Math.max(target.n, Math.round(Math.log2(learnerState.length)) || 1, 1);
  // Bound the reference simulation: learnerState.length is whatever the learner's
  // Python produced (Pyodide-memory-bounded, not DSL-clamped), so cap n before a
  // 2**n target allocation.
  if (n > MAX_QUBITS) {
    return {
      status: "error",
      message: `This challenge is configured for ${n} qubits, beyond the ${MAX_QUBITS}-qubit limit for in-browser grading.`,
    };
  }
  const targetState = simulate(opsFor(target, 0), n);

  if (statesApproxEqual(learnerState, targetState)) {
    return { status: "solved", message: "Correct — verified against the reference state vector." };
  }
  return {
    status: "wrong",
    message: spec.hint ?? "Your code ran, but its state doesn't match the target yet.",
  };
}
