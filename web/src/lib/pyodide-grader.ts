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

import { statesApproxEqual, isFiniteState, type Complex } from "@/components/quantum/math";
import {
  getPyodide,
  runSerialized,
  PythonTimeoutError,
  PythonRuntimeError,
  type Pyodide,
} from "./pyodide-runtime";
import type { ChallengeSpec } from "./challenge-schema";
import { resolveTarget, type GradeResult } from "./challenge-grade";

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
  "import math as __grader_math\n" +
  "import numpy as __grader_np\n" +
  "\n" +
  "def __grader_extract(\n" +
  "    __grader_src,\n" +
  "    __grader_dumps=__grader_json.dumps,\n" +
  "    __grader_real=__grader_np.real,\n" +
  "    __grader_imag=__grader_np.imag,\n" +
  "    __grader_as_float=float,\n" +
  "    __grader_isfinite=__grader_math.isfinite,\n" +
  "):\n" +
  "    __grader_ns = {}\n" +
  "    exec(__grader_src, __grader_ns)\n" +
  "    __grader_circuit = __grader_ns.get('circuit')\n" +
  "    if __grader_circuit is None:\n" +
  "        raise NameError(\"name 'circuit' is not defined\")\n" +
  "    __grader_sv = __grader_circuit.state_vector()\n" +
  "    __grader_out = []\n" +
  "    for z in __grader_sv:\n" +
  "        __grader_re = __grader_as_float(__grader_real(z))\n" +
  "        __grader_im = __grader_as_float(__grader_imag(z))\n" +
  "        if not __grader_isfinite(__grader_re) or not __grader_isfinite(__grader_im):\n" +
  // A non-finite amplitude (an out-of-domain angle like asin(2) -> nan) cannot
  // be JSON: default json.dumps emits a bare `NaN` token, which is not valid
  // JSON, so the CLIENT's JSON.parse threw and the learner was told their code
  // raised a SyntaxError they never raised. Report it as a typed sentinel and
  // let the client word the verdict; allow_nan=False below is the backstop that
  // keeps an invalid-JSON payload structurally impossible.
  "            return __grader_dumps({'__grader_error': 'non-finite'})\n" +
  "        __grader_out.append([__grader_re, __grader_im])\n" +
  "    return __grader_dumps(__grader_out, allow_nan=False)\n" +
  "\n";

const NON_FINITE_STATE =
  "Your circuit produced a non-finite amplitude, so it can't be graded. " +
  "Check for an out-of-domain angle — np.arcsin or np.arccos of a value " +
  "outside [-1, 1] returns nan, which spreads through the whole state vector.";

const UNREADABLE_STATE =
  "The grader couldn't read your circuit's state vector. Run it again — if it " +
  "keeps happening, reload the page to restart the Python environment.";

/** The harness's typed sentinel for a state vector it refused to encode. */
function isNonFiniteSentinel(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as { __grader_error?: unknown }).__grader_error === "non-finite"
  );
}

/**
 * Every amplitude is a finite [real, imag] pair.
 *
 * This is load-bearing, not defensive decoration: statesApproxEqual compares
 * with `Math.abs(x - y) > eps`, and EVERY comparison against NaN is false, so an
 * all-NaN state vector compares EQUAL to any target — a silent false pass, the
 * worst verdict this grader can return. The harness now refuses to emit
 * non-finite amplitudes, and this is the client-side half of that guarantee.
 */

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
  //
  // The RUN and the DECODE are caught separately on purpose. Folding them into
  // one try made a grader-side JSON.parse failure indistinguishable from a
  // learner exception, so a payload the harness could not encode came back as
  // "Your code raised: Unexpected token 'N'..." — an error the learner's code
  // never raised. Only a rejection from the run itself is the learner's.
  let raw: unknown;
  try {
    raw = await runSerialized(py, program);
  } catch (e) {
    // A watchdog kill is not a Python exception: its message is already
    // learner-facing and complete (what happened, that the environment was
    // reset, check for an infinite loop) -- show it verbatim, unprefixed.
    if (e instanceof PythonTimeoutError || e instanceof PythonRuntimeError) {
      // Neither is the learner's exception: the watchdog killed an infinite
      // loop, or the worker crashed / was already dead from an earlier reset.
      // Both messages are already learner-facing and complete -- show them
      // verbatim. Prefixing them with "Your code raised:" would blame the
      // learner for an environment failure they cannot act on.
      return { status: "error", message: e.message };
    }
    return { status: "error", message: `Your code raised: ${(e as Error).message}` };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw as string);
  } catch {
    return { status: "error", message: UNREADABLE_STATE };
  }
  if (isNonFiniteSentinel(decoded)) {
    return { status: "error", message: NON_FINITE_STATE };
  }
  // Not reachable from the harness (it emits the sentinel above and dumps with
  // allow_nan=False), but JSON.parse still yields Infinity for an overflowing
  // literal like 1e400 — and an all-non-finite vector compares EQUAL to any
  // target, so this must never fall through to statesApproxEqual.
  if (!isFiniteState(decoded)) {
    return { status: "error", message: UNREADABLE_STATE };
  }
  const learnerState: Complex[] = decoded;

  // Reference circuit: validated + simulated by the shared kernel gate, so both
  // tiers can never disagree about whether the same authored fence is gradeable.
  const resolved = resolveTarget(
    spec,
    Math.round(Math.log2(learnerState.length)) || 1
  );
  if ("error" in resolved) {
    return { status: "error", message: resolved.error };
  }
  const targetState = resolved.state;

  if (statesApproxEqual(learnerState, targetState)) {
    return { status: "solved", message: "Correct — verified against the reference state vector." };
  }
  return {
    status: "wrong",
    message: spec.hint ?? "Your code ran, but its state doesn't match the target yet.",
  };
}
