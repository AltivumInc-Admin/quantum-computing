// Run free-form Python in the browser and capture its console output. Built on
// the shared worker-hosted Pyodide runtime (same-origin assets + qcsim wheel),
// so a learner's `print(...)`, `from braket.circuits import Circuit`, etc. all
// work the same as in the lab -- without ever blocking the main thread. Used by
// the runnable code editor embedded in lessons. A run that exceeds the runtime's
// watchdog timeout surfaces its learner-facing reset message via `error`.

import { getPyodide, runSerialized, PY_BOOT_FAILURE_PREFIX } from "./pyodide-runtime";

/**
 * The outcome of one run. `error` is the ONLY success discriminant: it is
 * present iff the run failed (the code raised, the watchdog killed it, or the
 * interpreter never booted). There used to be a sibling `ok: boolean` that no
 * consumer ever read -- two sources of truth for the same fact, which would
 * have rendered an `{ ok: false }` with no `error` as a successful run with
 * "(no output)".
 */
export interface RunResult {
  /** Combined stdout + stderr produced by the run. */
  output: string;
  /** Present when the run failed; the learner-facing message. */
  error?: string;
}

export async function runPython(code: string): Promise<RunResult> {
  let py;
  try {
    py = await getPyodide();
  } catch (e) {
    return { output: "", error: `${PY_BOOT_FAILURE_PREFIX}${(e as Error).message}` };
  }

  // Each run executes in a fresh namespace under the shared interpreter lock, so
  // output never races another run and variables don't leak between snippets.
  const chunks: string[] = [];
  try {
    await runSerialized(py, code, (text) => chunks.push(text));
    return { output: chunks.join("") };
  } catch (e) {
    return { output: chunks.join(""), error: (e as Error).message };
  }
}
