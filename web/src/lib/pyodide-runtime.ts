// Shared Pyodide bootstrap. Loads the CDN runtime exactly once per session and
// installs the qcsim wheel (single-sourced via the content manifest) so that
// `from braket.circuits import Circuit` resolves to qcsim, identically to the
// in-browser lab. Both the Tier-B challenge grader and the runnable code editor
// share this one runtime instance, so Python only boots a single time.
//
// Browser-only: requires WebAssembly + network for the CDN runtime, so it cannot
// run under jsdom. Callers mock this module in unit tests.

import { getWheelName } from "./manifest";

const PYODIDE_VERSION = "0.27.7";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export interface PyNamespace {
  destroy?(): void;
}

export interface Pyodide {
  loadPackage(names: string | string[]): Promise<void>;
  runPythonAsync(code: string, options?: { globals?: unknown }): Promise<unknown>;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
  toPy(obj: unknown): PyNamespace;
}

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<Pyodide>;
  }
}

let pyodidePromise: Promise<Pyodide> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export async function getPyodide(): Promise<Pyodide> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    await loadScript(`${PYODIDE_BASE}pyodide.js`);
    if (!window.loadPyodide) throw new Error("Pyodide runtime did not load");
    const py = await window.loadPyodide({ indexURL: PYODIDE_BASE });
    await py.loadPackage("micropip");
    const wheelUrl = new URL(
      `/lab/files/wheels/${getWheelName()}`,
      window.location.origin
    ).href;
    await py.runPythonAsync(
      `import micropip\n` +
        `await micropip.install(${JSON.stringify(wheelUrl)})\n` +
        `import qcsim  # registers the braket.* aliases\n`
    );
    return py;
  })();
  // If the boot rejects (CDN blip loading pyodide.js, qcsim wheel 404, etc.),
  // clear the cache so the next call re-boots instead of returning the same
  // rejected promise forever and permanently bricking every runnable cell.
  pyodidePromise.catch(() => {
    pyodidePromise = null;
  });
  return pyodidePromise;
}

// One interpreter is shared by every runnable editor and the grader. setStdout is
// global state on that interpreter, so concurrent runs would race the output
// sink; this queue makes each run's setup → execute → capture atomic.
let runQueue: Promise<unknown> = Promise.resolve();

/**
 * Execute `code` on the shared interpreter inside a serialized critical section
 * and a FRESH global namespace. The lock prevents two runs from clobbering each
 * other's stdout; the fresh namespace stops names defined in one run from leaking
 * into the next run (or into the grader), keeping every Run / grade deterministic.
 * Returns the value of the last expression; stdout/stderr stream to `onOutput`.
 */
export function runSerialized(
  py: Pyodide,
  code: string,
  onOutput?: (text: string) => void
): Promise<unknown> {
  const task = runQueue.then(async () => {
    if (onOutput) {
      py.setStdout({ batched: onOutput });
      py.setStderr({ batched: onOutput });
    }
    const namespace = py.toPy({});
    try {
      return await py.runPythonAsync(code, { globals: namespace });
    } finally {
      namespace.destroy?.();
    }
  });
  // Keep the chain alive even if this run rejects, so a failed run never wedges
  // the queue for subsequent runs.
  runQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}
