// Shared Pyodide bootstrap. Loads the runtime exactly once per session and
// installs the qcsim wheel (single-sourced via the content manifest) so that
// `from braket.circuits import Circuit` resolves to qcsim, identically to the
// in-browser lab. Both the Tier-B challenge grader and the runnable code editor
// share this one runtime instance, so Python only boots a single time.
//
// The runtime is self-hosted SAME-ORIGIN under /pyodide/ (staged by
// jupyterlite-build/build.sh: the pinned Pyodide core + the {micropip, numpy}
// wheel closure) so a blocked, owned, or down third-party CDN can never brick
// every runnable cell and the grader. The jsdelivr CDN is kept only as an
// automatic, SRI-protected fallback; if both fail, callers surface an actionable
// remediation message.
//
// Browser-only: requires WebAssembly + same-origin (or CDN) assets, so it cannot
// run under jsdom. Callers mock this module in unit tests.

import { getWheelName } from "./manifest";

const PYODIDE_VERSION = "0.27.7";
// Primary: same-origin self-hosted distribution. No SRI needed — the assets are
// ours and same-origin, served from the deploy we control.
const PYODIDE_LOCAL_BASE = "/pyodide/";
// Fallback only: the public CDN, with Subresource Integrity on the BOOTSTRAP
// script. Note this guards only pyodide.js; the wasm/stdlib it then fetches carry
// no SRI (Pyodide verifies downloaded package wheels against the lockfile's
// hashes, but not the core runtime blobs). Acceptable because same-origin is
// primary, so this weaker-integrity path is exercised only when same-origin is
// unreachable. Recompute the hash on a version bump with:
//   curl -fsSL <cdn>/pyodide.js | openssl dgst -sha384 -binary | openssl base64 -A
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_CDN_SRI =
  "sha384-90so5tCKvl0xs9agU29IMKlAVzhfzFX7QO//YxQkRhJG58bBZrFN+2ZTRB026X5X";

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

function loadScript(src: string, integrity?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    if (integrity) {
      // SRI requires CORS; same-origin loads pass no integrity (the asset is ours).
      s.integrity = integrity;
      s.crossOrigin = "anonymous";
    }
    s.onload = () => resolve();
    s.onerror = () => {
      // Remove the dead tag before rejecting. Otherwise the querySelector
      // short-circuit above would find this never-executed <script> on a retry
      // and resolve WITHOUT re-fetching — wedging the boot for the rest of the
      // session even after the network recovers (the "...reload" message would
      // be unachievable by an in-session Run retry).
      s.remove();
      reject(new Error(`failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
}

// Boot Pyodide from a single origin atomically: load its bootstrap script, start
// the interpreter pointed at that origin's index, then install the qcsim wheel
// (and its numpy dep, which resolves from the same index). If any step throws,
// the whole attempt rejects so the caller can fall back to the next origin.
async function bootFrom(base: string, integrity?: string): Promise<Pyodide> {
  await loadScript(`${base}pyodide.js`, integrity);
  if (!window.loadPyodide) throw new Error("Pyodide runtime did not load");
  const py = await window.loadPyodide({ indexURL: base });
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
}

export async function getPyodide(): Promise<Pyodide> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    // Same-origin first (no third-party request in the common case); fall back to
    // the SRI-protected CDN; if BOTH fail, throw an actionable remediation hint.
    try {
      return await bootFrom(PYODIDE_LOCAL_BASE);
    } catch {
      try {
        return await bootFrom(PYODIDE_CDN_BASE, PYODIDE_CDN_SRI);
      } catch {
        throw new Error(
          "couldn't load the Python runtime from this site or the CDN. " +
            "A network block, proxy, or ad-blocker may be preventing it — " +
            "check your connection and reload."
        );
      }
    }
  })();
  // If the boot rejects (both origins down, qcsim wheel 404, etc.), clear the
  // cache so the next call re-boots instead of returning the same rejected
  // promise forever and permanently bricking every runnable cell.
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
