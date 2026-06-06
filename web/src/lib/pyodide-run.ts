// Run free-form Python in the browser and capture its console output. Built on
// the shared Pyodide runtime (CDN + qcsim wheel), so a learner's `print(...)`,
// `from braket.circuits import Circuit`, etc. all work the same as in the lab.
// Used by the runnable code editor embedded in lessons.

import { getPyodide, runSerialized } from "./pyodide-runtime";

export interface RunResult {
  ok: boolean;
  /** Combined stdout + stderr produced by the run. */
  output: string;
  /** Present when the code raised; the exception message. */
  error?: string;
}

export async function runPython(code: string): Promise<RunResult> {
  let py;
  try {
    py = await getPyodide();
  } catch (e) {
    return { ok: false, output: "", error: `Couldn't start Python: ${(e as Error).message}` };
  }

  // Each run executes in a fresh namespace under the shared interpreter lock, so
  // output never races another run and variables don't leak between snippets.
  const chunks: string[] = [];
  try {
    await runSerialized(py, code, (text) => chunks.push(text));
    return { ok: true, output: chunks.join("") };
  } catch (e) {
    return { ok: false, output: chunks.join(""), error: (e as Error).message };
  }
}
