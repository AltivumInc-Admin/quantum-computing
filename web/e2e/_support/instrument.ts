import { expect, type Page } from "@playwright/test";

/**
 * Shared instrumentation for the browser specs — the one authoritative copy of
 * the request/console/pageerror wiring every spec used to hand-copy, plus the
 * production literals more than one spec asserts on.
 *
 * Playwright's testMatch (playwright.config.ts) collects only files named
 * `*.e2e.ts`, so a module under e2e/_support/ is importable by the specs and
 * never collected as one itself — the same split the Jest suite uses for
 * __tests__/_support/.
 *
 * Everything here is per-`page`: the listeners are installed on the fixture page
 * the calling test owns, so the logs are per-context and stay correct however
 * many workers the run uses.
 */

// ---------------------------------------------------------------------------
// Literals the specs share with production
// ---------------------------------------------------------------------------

/**
 * Static export + serve.json `cleanUrls:false` → a fixture page is served at its
 * literal exported filename, not the clean URL (the same gotcha that forces
 * /lab/lab/index.html).
 */
export const FIXTURE_PY_CHALLENGE = "/e2e-fixtures/py-challenge.html";
export const FIXTURE_PY_REPS = "/e2e-fixtures/py-reps.html";
export const FIXTURE_RUNNABLE_EDITOR = "/e2e-fixtures/runnable-editor.html";

/** The grader's exact solved literal (src/lib/pyodide-grader.ts). */
export const SOLVED = "Correct — verified against the reference state vector.";

/**
 * The tier:"py" caption. Asserting it before any click proves the spec parsed as
 * tier:"py" — otherwise a schema regression could silently reroute a test to
 * gradeTs and it would "pass" without ever booting Pyodide.
 */
export const PY_TIER_CAPTION = "graded with real qcsim in your browser";

/** The Bell pair, the canonical correct answer for the py-challenge fixture. */
export const BELL_SOLUTION =
  "from braket.circuits import Circuit\ncircuit = Circuit().h(0).cnot(0, 1)";

// ---------------------------------------------------------------------------
// Instrumentation
// ---------------------------------------------------------------------------

/** The logs a spec asserts on once its browser work is done. */
export interface PageInstrumentation {
  /** Cross-origin requests. Must stay empty — the whole site is self-hosted. */
  external: string[];
  /** Same-origin responses with a >=400 status. */
  failed: string[];
  /** One entry per Pyodide wasm fetch, i.e. per interpreter BOOT. */
  bootFetches: string[];
}

/**
 * Mirror the page's console errors and uncaught exceptions into the test output.
 * Purely diagnostic: it asserts nothing, so a spec that only wants a readable
 * failure (no network claims of its own) can take this without the collectors.
 */
export function logPageDiagnostics(page: Page, label: string): void {
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[${label} console error]`, m.text());
  });
  page.on("pageerror", (e) => console.log(`[${label} page error]`, e.message));
}

/**
 * Install every listener the network assertions below need, plus the diagnostic
 * logging, and return the logs they fill.
 *
 * The cross-origin test is an EXACT-origin compare against the served site's
 * origin (http://127.0.0.1:4173), NOT a loopback-prefix regex: a prefix pattern
 * would exempt localhost-on-any-port (a stray dev server) and any host merely
 * prefixed with "localhost"/"127.0.0.1", green-lighting a build that in
 * production falls back to a CDN. chrome-extension:// and data: URLs are ignored;
 * only http(s) outside the served origin counts.
 */
export function instrument(page: Page, baseURL: string | undefined, label: string): PageInstrumentation {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const failed: string[] = [];
  const bootFetches: string[] = [];

  page.on("request", (req) => {
    const u = req.url();
    if (/^https?:/.test(u) && new URL(u).origin !== origin) {
      external.push(`${req.method()} ${u}`);
    }
    if (u.includes("pyodide.asm.wasm")) bootFetches.push(u);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });
  logPageDiagnostics(page, label);

  return { external, failed, bootFetches };
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/** Zero third-party requests: everything the page needed was self-hosted. */
export function assertSameOrigin(external: string[], what: string): void {
  expect(
    external,
    `${what} made third-party requests:\n${external.join("\n")}`
  ).toEqual([]);
}

/**
 * Nothing the page asked for is missing from the staged trees. This is what
 * makes an asset-filtering build step (scripts/stage-monaco.mjs) safe: a file
 * the runtime does reach for surfaces here as a 404 rather than a silent loss.
 */
export function assertNoFailedResponses(failed: string[]): void {
  expect(failed, `same-origin requests failed:\n${failed.join("\n")}`).toEqual([]);
}

/**
 * Exactly `expected` interpreter boots. The count is load-bearing in both
 * directions — too few means a poisoned runtime survived, too many means the
 * getPyodide() singleton stopped caching and a spec's premise went vacuous.
 */
export function assertBoots(bootFetches: string[], expected: number, why: string): void {
  expect(
    bootFetches,
    `expected exactly ${expected} Pyodide boot(s) (${why}), saw ${bootFetches.length}:\n${bootFetches.join("\n")}`
  ).toHaveLength(expected);
}
