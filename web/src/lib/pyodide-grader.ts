// Tier-B grading: run the learner's REAL Braket-style Python in the browser via
// Pyodide + the qcsim wheel, then verify the resulting state vector against the
// challenge's reference circuit (computed in TS) up to global phase.
//
// This is the advanced, free-form path. On first use it boots the shared
// WORKER-HOSTED, SAME-ORIGIN self-hosted Pyodide runtime (/pyodide/; the CDN is
// only an integrity-pinned fallback — see pyodide-runtime.ts) and installs the
// same qcsim wheel the in-browser lab ships (single-sourced via the content
// manifest), so `from braket.circuits import Circuit` resolves to qcsim exactly
// as it does in the lab. Learner code executes off the main thread with a hard
// watchdog timeout; a timed-out run surfaces the runtime's learner-facing reset
// message. The module is imported lazily (only when a tier:"py" challenge is
// checked) so it never touches the main bundle.
//
// GRADING INTEGRITY: the learner's source and the grader's state-vector
// extraction used to share one namespace, so a submission could shadow the
// extraction's own names (a fake `json`/`numpy`, a redefined `float`, a
// pre-seeded result) and false-pass. It no longer does: the learner source runs
// via exec() in its OWN dict and crosses in only as DATA (a JSON-encoded string
// literal), while the extraction reads through readout callables captured as
// default-argument LOCALS before the learner runs — immune to shadowing, and to
// a circuit that monkeypatches numpy after it is built. See __grader_extract
// below and the isolation cases in pyodide-grader.test.ts.
//
// NOTE: requires a live browser (Pyodide/WebAssembly/Worker); it cannot run
// under jsdom. The shipped tier:"py" Reps are enumerated in ./py-reps (the
// e2e-coverage manifest) and each is graded for real, in-browser, by
// web/e2e/py-reps.e2e.ts. The grader's own solve / wrong / fresh-namespace and
// watchdog semantics are proven by web/e2e/challenge-py-grader.e2e.ts and
// web/e2e/py-grader-timeout.e2e.ts against the fixture page at
// /e2e-fixtures/py-challenge — keep those specs in lockstep when changing
// grading semantics here.

import { simulate, statesApproxEqual, type Complex } from "@/components/quantum/math";
import { parseProgram, opsFor, MAX_QUBITS } from "@/components/quantum/qsim-dsl";
import { getPyodide, runSerialized, PythonTimeoutError, type Pyodide } from "./pyodide-runtime";
import type { ChallengeSpec } from "./challenge-schema";
import type { GradeResult } from "./challenge-grade";

// The grading harness, invariant to learner input. It imports json/numpy and
// binds the readout callables as default-argument LOCALS (evaluated at def time,
// before any learner code runs), then execs the learner source in a throwaway
// dict and reads `circuit` back out of THAT dict. Because the learner never
// shares a scope with the extraction, it cannot shadow `float`, swap in a fake
// json/numpy, or pre-seed the result; and because the callables are locals, a
// circuit that monkeypatches numpy while being built cannot reach them either.
// The learner source is appended exactly once, as a JSON string literal passed
// to __grader_extract — the only thing that varies between grades.
const GRADER_HEAD =
  "import json as __grader_json\n" +
  "import numpy as __grader_np\n" +
  "\n" +
  "def __grader_extract(\n" +
  "    __grader_src,\n" +
  "    __grader_dumps=__grader_json.dumps,\n" +
  "    __grader_real=__grader_np.real,\n" +
  "    __grader_imag=__grader_np.imag,\n" +
  "    __grader_as_float=float,\n" +
  "):\n" +
  "    __grader_ns = {}\n" +
  "    exec(__grader_src, __grader_ns)\n" +
  "    __grader_circuit = __grader_ns.get('circuit')\n" +
  "    if __grader_circuit is None:\n" +
  "        raise NameError(\"name 'circuit' is not defined\")\n" +
  "    __grader_sv = __grader_circuit.state_vector()\n" +
  "    return __grader_dumps(\n" +
  "        [[__grader_as_float(__grader_real(z)), __grader_as_float(__grader_imag(z))]\n" +
  "         for z in __grader_sv]\n" +
  "    )\n" +
  "\n";

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
  // The learner source is executed in an ISOLATED dict (see the header) — it
  // enters only as the JSON-encoded literal below, never as sibling code — and
  // the readout is done through callables captured as default-argument locals
  // BEFORE the learner runs, so no shadowing or monkeypatch can bend it.
  const program = `${GRADER_HEAD}__grader_extract(${JSON.stringify(learnerSource)})\n`;

  // Run in a fresh, serialized namespace so a `circuit` left over from an earlier
  // editor/grader run can never stand in for one the submission failed to define.
  let learnerState: Complex[];
  try {
    learnerState = JSON.parse((await runSerialized(py, program)) as string) as Complex[];
  } catch (e) {
    // A watchdog kill is not a Python exception: its message is already
    // learner-facing and complete (what happened, that the environment was
    // reset, check for an infinite loop) -- show it verbatim, unprefixed.
    if (e instanceof PythonTimeoutError) {
      return { status: "error", message: e.message };
    }
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
