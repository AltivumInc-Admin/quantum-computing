// Shared Pyodide bootstrap for the LESSON runtime. Boots the interpreter
// exactly once per session -- inside a DEDICATED WEB WORKER -- and installs the
// qcsim wheel (single-sourced via the content manifest) so that
// `from braket.circuits import Circuit` resolves to qcsim, identically to the
// in-browser lab. Both the Tier-B challenge grader and the runnable code editor
// share this one runtime instance, so Python only boots a single time.
//
// WORKER ISOLATION: learner Python executes OFF the main thread (the worker is
// the plain static asset /pyodide.worker.js -- see its header for the message
// protocol). The page stays responsive during a run, and a runaway submission
// (`while True:`) no longer hard-locks the tab: each run carries a hard
// timeout (RUN_TIMEOUT_MS), after which the worker is TERMINATED and the cached
// runtime discarded so the next run boots a fresh interpreter. terminate() is
// the interrupt mechanism because the site is not cross-origin isolated (no
// COOP/COEP -- deliberately), so SharedArrayBuffer/setInterruptBuffer is
// unavailable. This module stays the single owner of that lifecycle; consumers
// (pyodide-run.ts, pyodide-grader.ts) keep the getPyodide()/runSerialized() API
// they always had.
//
// The runtime assets are self-hosted SAME-ORIGIN under /pyodide/ (staged by
// jupyterlite-build/build.sh: the pinned Pyodide core + the {micropip, numpy}
// wheel closure) so a blocked, owned, or down third-party CDN can never brick
// every runnable cell and the grader. The jsdelivr CDN is kept only as an
// automatic fallback whose bootstrap script the worker verifies against the
// SRI pin below (importScripts has no native SRI, so it digests by hand); if
// both origins fail, callers surface an actionable remediation message.
//
// Browser-only: requires WebAssembly + Worker + same-origin (or CDN) assets, so
// it cannot run under jsdom. Callers mock this module in unit tests; the module
// itself is unit-tested against a fake Worker, and proven end-to-end on real
// Pyodide by web/e2e/challenge-py-grader.e2e.ts + web/e2e/py-grader-timeout.e2e.ts.

import { getWheelName } from "./manifest";

// 0.29.0 deliberately matches the LAB kernel's own Pyodide pin (read from
// jupyterlite-pyodide-kernel by build.sh): its pyodide.asm.wasm is ~8.6 MB --
// safely under CloudFront's 10,000,000-byte compression ceiling, so it ships
// brotli'd (~2.8 MB on the wire). The previous 0.27.7 wasm was 10,105,545 bytes,
// 105,545 bytes OVER the ceiling, and was served raw. build.sh asserts every
// staged wasm stays under the ceiling.
const PYODIDE_VERSION = "0.29.0";
// Primary: same-origin self-hosted distribution. No SRI needed -- the assets are
// ours and same-origin, served from the deploy we control.
const PYODIDE_LOCAL_BASE = "/pyodide/";
// Fallback only: the public CDN, with an integrity pin on the BOOTSTRAP script
// (verified by the worker via crypto.subtle before executing it). Note this
// guards only pyodide.js; the wasm/stdlib it then fetches carry no SRI (Pyodide
// verifies downloaded package wheels against the lockfile's hashes, but not the
// core runtime blobs). Acceptable because same-origin is primary, so this
// weaker-integrity path is exercised only when same-origin is unreachable.
// Recompute the hash on a version bump with:
//   curl -fsSL <cdn>/pyodide.js | openssl dgst -sha384 -binary | openssl base64 -A
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_CDN_SRI =
  "sha384-l95tshxQlbjf4kdyWZf10uUL5Dw8/iN9q16SQ+ttOEWA8SN0cLG6BGDGY17GxToh";
// The worker script itself (a static asset; NOT bundled -- see its header).
const WORKER_URL = "/pyodide.worker.js";

// Hard per-run wall-clock budget. Generous for real lesson workloads (state
// vectors here are <= 2^7 amplitudes; runs complete in milliseconds) while
// still bounding a runaway loop to something a learner will wait out.
const DEFAULT_RUN_TIMEOUT_MS = 30_000;
let runTimeoutMs = DEFAULT_RUN_TIMEOUT_MS;

// Hard per-BOOT wall-clock budget. The worker's boot phase (importScripts of
// the bootstrap, the ~3 MB brotli'd wasm fetch, micropip's wheel installs) is
// all network I/O with no reply until it finishes -- a stalled fetch would
// otherwise neither resolve nor reject bootFrom(), so the CDN fallback would
// never be attempted and every runnable cell would hang until a page reload.
// Generous for a slow link; the common same-origin case completes in seconds.
const DEFAULT_BOOT_TIMEOUT_MS = 75_000;
let bootTimeoutMs = DEFAULT_BOOT_TIMEOUT_MS;

/**
 * Test-only override for the run timeout (the timeout e2e would otherwise wait
 * the full default before it can assert the kill/reboot path). Production code
 * must never call this; the only caller is the e2e fixture's TimeoutOverride.
 */
export function __setRunTimeoutMsForTests(ms: number): void {
  runTimeoutMs = ms;
}

/**
 * Test-only override for the boot timeout, mirroring the run-timeout override
 * above. Production code must never call this.
 */
export function __setBootTimeoutMsForTests(ms: number): void {
  bootTimeoutMs = ms;
}

/**
 * The rejection type for a run that exceeded the timeout and forced a runtime
 * reset. Its message is learner-facing and complete -- consumers should show it
 * verbatim (NOT wrapped in "Your code raised:", which would misattribute a
 * watchdog kill to a Python exception).
 */
export class PythonTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PythonTimeoutError";
  }
}

function timeoutMessage(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return (
    `Execution stopped after ${seconds} second${seconds === 1 ? "" : "s"}, ` +
    "so the Python environment was shut down and reset. " +
    "Check your code for an infinite loop (like `while True:`), then run it again."
  );
}

const RESET_MESSAGE =
  "The Python environment was reset because an earlier run timed out. Run again to restart it.";

// ---------------------------------------------------------------------------
// Worker protocol (keep in lockstep with public/pyodide.worker.js)

interface BootMessage {
  type: "boot";
  pyodideJsUrl: string;
  indexURL: string;
  wheelUrl: string;
  integrity?: string;
}

type WorkerReply =
  | { type: "ready" }
  | { type: "boot-error"; message: string }
  | { type: "output"; id: number; text: string }
  | { type: "result"; id: number; value: unknown }
  | { type: "error"; id: number; message: string };

interface PendingRun {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  onOutput?: (text: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Handle to the booted worker-hosted interpreter. Exported under the historic
 * name `Pyodide` so consumers' `getPyodide(): Promise<Pyodide>` +
 * `runSerialized(py, ...)` call shape is unchanged from the main-thread era.
 */
export class Pyodide {
  private nextRunId = 1;
  private readonly pending = new Map<number, PendingRun>();
  private dead = false;

  constructor(private readonly worker: Worker) {
    worker.onmessage = (ev: MessageEvent) => this.dispatch(ev.data as WorkerReply);
    // A post-boot crash of the worker itself (not a Python exception -- those
    // arrive as "error" replies) poisons the runtime: kill it so in-flight runs
    // reject and the next run boots fresh.
    worker.onerror = () => {
      this.kill(new Error("The Python runtime crashed. Run again to restart it."));
    };
  }

  /** Execute one (already-serialized) run; resolves with the last expression's value. */
  run(code: string, onOutput?: (text: string) => void): Promise<unknown> {
    if (this.dead) return Promise.reject(new Error(RESET_MESSAGE));
    return new Promise<unknown>((resolve, reject) => {
      const id = this.nextRunId++;
      // The client serializes runs (see runSerialized), so this run starts
      // executing as soon as it is posted -- the timer measures actual
      // execution, not queue wait.
      const timer = setTimeout(() => {
        this.kill(new PythonTimeoutError(timeoutMessage(runTimeoutMs)));
      }, runTimeoutMs);
      this.pending.set(id, { resolve, reject, onOutput, timer });
      this.worker.postMessage({ type: "run", id, code });
    });
  }

  private dispatch(msg: WorkerReply): void {
    if (!msg || typeof msg !== "object" || !("id" in msg)) return;
    const p = this.pending.get(msg.id);
    if (!p) return; // stale reply from a run that already timed out
    if (msg.type === "output") {
      p.onOutput?.(msg.text);
    } else if (msg.type === "result") {
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      p.resolve(msg.value);
    } else if (msg.type === "error") {
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      p.reject(new Error(msg.message));
    }
  }

  /**
   * Terminate the worker (the only way to interrupt Python without
   * SharedArrayBuffer) and discard the module-level cache so the NEXT run
   * boots a fresh interpreter. Every in-flight/queued run rejects with
   * `reason` -- for a timeout that is the learner-facing PythonTimeoutError.
   */
  private kill(reason: Error): void {
    if (this.dead) return;
    this.dead = true;
    this.worker.terminate();
    invalidate(this);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(reason);
    }
    this.pending.clear();
  }
}

// ---------------------------------------------------------------------------
// Boot: same-origin first, CDN fallback, actionable error

let pyodidePromise: Promise<Pyodide> | null = null;
let currentHandle: Pyodide | null = null;

/** Drop the cached runtime iff `handle` is still the cached one. */
function invalidate(handle: Pyodide): void {
  if (currentHandle === handle) {
    currentHandle = null;
    pyodidePromise = null;
  }
}

/**
 * Boot Pyodide from a single origin atomically: spawn a worker, have it load
 * that origin's bootstrap script, start the interpreter against that origin's
 * package index, and install the qcsim wheel (plus its numpy dep, which
 * resolves from the same index). If any step fails the worker is terminated
 * and the attempt rejects so the caller can fall back to the next origin with
 * a completely fresh worker. A watchdog bounds the whole attempt: a STALLED
 * fetch inside the worker's boot never replies at all (no "boot-error", no
 * worker 'error' event), so without the timer this promise would simply never
 * settle -- the fallback chain in getPyodide() only runs from a rejection.
 */
function bootFrom(base: string, integrity?: string): Promise<Pyodide> {
  return new Promise<Pyodide>((resolve, reject) => {
    const worker = new Worker(WORKER_URL);
    const fail = (message: string) => {
      clearTimeout(watchdog);
      worker.terminate();
      reject(new Error(message));
    };
    const watchdog = setTimeout(() => {
      const source = base === PYODIDE_LOCAL_BASE ? "this site" : "the CDN";
      fail(
        `booting the Python runtime from ${source} timed out after ` +
          `${Math.round(bootTimeoutMs / 1000)} seconds`
      );
    }, bootTimeoutMs);
    // Fires when the worker script itself fails to load/parse.
    worker.onerror = (e: ErrorEvent) => fail(e.message || `failed to load ${WORKER_URL}`);
    worker.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as WorkerReply;
      if (msg?.type === "ready") {
        clearTimeout(watchdog);
        resolve(new Pyodide(worker));
      } else if (msg?.type === "boot-error") fail(msg.message);
    };
    const boot: BootMessage = {
      type: "boot",
      // Absolute URLs: the worker resolves relative URLs against ITS OWN
      // script location, so pin everything to the page origin explicitly.
      pyodideJsUrl: new URL(`${base}pyodide.js`, window.location.origin).href,
      indexURL: new URL(base, window.location.origin).href,
      wheelUrl: new URL(`/lab/files/wheels/${getWheelName()}`, window.location.origin).href,
      integrity,
    };
    worker.postMessage(boot);
  });
}

export async function getPyodide(): Promise<Pyodide> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    // Same-origin first (no third-party request in the common case); fall back to
    // the integrity-pinned CDN; if BOTH fail, throw an actionable remediation hint.
    let handle: Pyodide;
    try {
      handle = await bootFrom(PYODIDE_LOCAL_BASE);
    } catch {
      try {
        handle = await bootFrom(PYODIDE_CDN_BASE, PYODIDE_CDN_SRI);
      } catch {
        throw new Error(
          "couldn't load the Python runtime from this site or the CDN. " +
            "A network block, proxy, or ad-blocker may be preventing it — " +
            "check your connection and reload."
        );
      }
    }
    currentHandle = handle;
    return handle;
  })();
  // If the boot rejects (both origins down, qcsim wheel 404, etc.), clear the
  // cache so the next call re-boots instead of returning the same rejected
  // promise forever and permanently bricking every runnable cell.
  pyodidePromise.catch(() => {
    pyodidePromise = null;
  });
  return pyodidePromise;
}

// ---------------------------------------------------------------------------
// Serialized execution

// One interpreter is shared by every runnable editor and the grader, and its
// stdout sink is global interpreter state, so concurrent runs would race the
// output; this queue makes each run's execute -> capture atomic.
let runQueue: Promise<unknown> = Promise.resolve();

/**
 * Execute `code` on the shared worker-hosted interpreter inside a serialized
 * critical section and a FRESH global namespace (the worker allocates and
 * destroys one per run). The lock prevents two runs from clobbering each
 * other's stdout; the fresh namespace stops names defined in one run from
 * leaking into the next run (or into the grader), keeping every Run / grade
 * deterministic. Returns the value of the last expression; stdout/stderr
 * stream to `onOutput`. Rejects with PythonTimeoutError when the run exceeds
 * the timeout (the worker is killed and the next run boots a fresh runtime).
 */
export function runSerialized(
  py: Pyodide,
  code: string,
  onOutput?: (text: string) => void
): Promise<unknown> {
  const task = runQueue.then(() => py.run(code, onOutput));
  // Keep the chain alive even if this run rejects, so a failed run never wedges
  // the queue for subsequent runs.
  runQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}
