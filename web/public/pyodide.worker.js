/*
 * Dedicated Web Worker that owns the LESSON runtime's Pyodide interpreter.
 *
 * Why a worker: learner Python used to run on the MAIN THREAD, so a single
 * `while True:` hard-locked the tab (recovery = the browser's kill dialog).
 * Off the main thread, the page stays responsive and the client can enforce a
 * hard timeout by terminating this worker and booting a fresh one. The site is
 * NOT cross-origin isolated (no COOP/COEP -- deliberately, other embeds depend
 * on it), so SharedArrayBuffer/setInterruptBuffer is unavailable; terminate()
 * is the only interrupt, which is why the timeout lives in the CLIENT
 * (src/lib/pyodide-runtime.ts), not here.
 *
 * This file is a PLAIN-JS STATIC ASSET (web/public/ -> served verbatim at
 * /pyodide.worker.js by the Next static export). It is intentionally NOT run
 * through the bundler so `output: "export"` can never relocate or rename it.
 * Keep its message protocol in lockstep with src/lib/pyodide-runtime.ts:
 *
 *   client -> worker
 *     { type: "boot", pyodideJsUrl, indexURL, wheelUrl, integrity? }
 *     { type: "run", id, code }
 *   worker -> client
 *     { type: "ready" } | { type: "boot-error", message }
 *     { type: "output", id, text }               (streamed stdout/stderr)
 *     { type: "result", id, value } | { type: "error", id, message }
 *
 * Boot mirrors the pre-worker bootFrom(): load pyodide.js (same-origin
 * /pyodide/ primarily; the CDN fallback is integrity-checked by hand because
 * importScripts has no SRI -- the client passes the same sha384 pin that the
 * old <script integrity> carried), start the interpreter, install the qcsim
 * wheel so `from braket.circuits import Circuit` resolves to qcsim.
 *
 * Each run executes in a FRESH global namespace under a client-side lock
 * (the client serializes runs, so at most one is in flight here): output never
 * races another run and names defined in one run cannot leak into the next
 * run or into the grader.
 */

"use strict";

/** The booted interpreter; null until a "boot" message succeeds. */
let pyodide = null;

/**
 * Fetch a script, verify it against an SRI-style "sha384-<base64>" pin, and
 * only then execute it via a blob URL. importScripts() cannot enforce
 * Subresource Integrity itself, so the CDN-fallback boot does the digest
 * comparison manually to preserve the integrity guarantee the main-thread
 * <script integrity> tag used to provide.
 */
async function importScriptWithIntegrity(url, integrity) {
  const dash = integrity.indexOf("-");
  const algo = integrity.slice(0, dash);
  const expected = integrity.slice(dash + 1);
  if (algo !== "sha384") throw new Error(`unsupported integrity algorithm: ${algo}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`failed to load ${url}: HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-384", buf);
  const actual = btoa(String.fromCharCode(...new Uint8Array(digest)));
  if (actual !== expected) throw new Error(`integrity check failed for ${url}`);
  const blobUrl = URL.createObjectURL(new Blob([buf], { type: "text/javascript" }));
  try {
    importScripts(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Boot Pyodide from one origin atomically: load its bootstrap script, start
 * the interpreter pointed at that origin's package index, then install the
 * qcsim wheel (and its numpy dep, which resolves from the same index). Any
 * throw is reported as "boot-error" so the client can terminate this worker
 * and retry from the next origin with a fresh one.
 */
async function boot(msg) {
  if (msg.integrity) {
    await importScriptWithIntegrity(msg.pyodideJsUrl, msg.integrity);
  } else {
    importScripts(msg.pyodideJsUrl);
  }
  if (typeof self.loadPyodide !== "function") {
    throw new Error("Pyodide runtime did not load");
  }
  const py = await self.loadPyodide({ indexURL: msg.indexURL });
  await py.loadPackage("micropip");
  await py.runPythonAsync(
    "import micropip\n" +
      `await micropip.install(${JSON.stringify(msg.wheelUrl)})\n` +
      "import qcsim  # registers the braket.* aliases\n"
  );
  pyodide = py;
}

/** Execute one run in a fresh namespace, streaming stdout/stderr as it goes. */
async function run(msg) {
  const id = msg.id;
  if (!pyodide) {
    self.postMessage({ type: "error", id, message: "Python runtime is not booted" });
    return;
  }
  const emit = (text) => self.postMessage({ type: "output", id, text });
  pyodide.setStdout({ batched: emit });
  pyodide.setStderr({ batched: emit });
  const namespace = pyodide.toPy({});
  try {
    let value = await pyodide.runPythonAsync(msg.code, { globals: namespace });
    if (value !== null && (typeof value === "object" || typeof value === "function")) {
      // A PyProxy (or other non-structured-cloneable) result cannot cross the
      // worker boundary. No consumer needs one -- the grader's last expression
      // is a JSON string, the editor ignores the value -- so free it and send
      // undefined rather than let postMessage throw DataCloneError.
      if (typeof value.destroy === "function") value.destroy();
      value = undefined;
    }
    self.postMessage({ type: "result", id, value });
  } catch (e) {
    self.postMessage({ type: "error", id, message: String((e && e.message) || e) });
  } finally {
    if (typeof namespace.destroy === "function") namespace.destroy();
  }
}

self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "boot") {
    boot(msg).then(
      () => self.postMessage({ type: "ready" }),
      (e) => self.postMessage({ type: "boot-error", message: String((e && e.message) || e) })
    );
  } else if (msg.type === "run") {
    void run(msg);
  }
};
