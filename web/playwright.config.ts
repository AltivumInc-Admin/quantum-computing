import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the in-browser Pyodide smoke. It serves the already-built static
 * export (web/out) and drives a real Chromium against the JupyterLite lab.
 *
 * `serve` is used (not `next start`, which is unavailable with output: "export"),
 * with NO SPA fallback (`-s`): the export emits a per-route index.html and the lab
 * is plain static files with deep asset paths, so SPA fallback would mask a missing
 * asset by returning 200-HTML for it. `serve.json` (cleanUrls:false) is required so
 * `/lab/lab/index.html` is served verbatim — serve's default cleanUrls 301-redirects
 * it to `/lab/lab/index`, which breaks JupyterLite's base-URL computation. The `-c`
 * path is resolved relative to the served dir (out/), hence `../serve.json`.
 *
 * Specs are named *.e2e.ts and live under e2e/ so Jest (which globs *.test.ts and
 * __tests__/) never collects them and Playwright never collects Jest specs.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 180_000,
  // A SMALL default on purpose. Every assertion that legitimately has to outlast
  // a WASM boot carries its own explicit timeout, so this default only ever
  // applies to assertions that resolve instantly when they pass — the negative
  // guards (no "Traceback", no "Couldn't load the editor", no "Your code
  // raised:"). Left at the old 150s those burned two and a half minutes each on
  // the way to a red build, paid twice under `retries: 1`. Anything that needs
  // more says so at the call site; `timeout` above is the per-test cap, which
  // each long spec raises with `test.setTimeout` to exceed its own waits.
  expect: { timeout: 15_000 },
  // The lab is now fully same-origin (Pyodide + wheels self-hosted, comm bundled), so
  // the run is deterministic with no network dependency. The single CI retry is kept
  // only as insurance against CPU-contention timeouts on shared runners, not flaky
  // CDN fetches; the spec also asserts zero third-party requests.
  retries: process.env.CI ? 1 : 0,
  // Two files at a time in CI. The suite is now six specs — two JupyterLite
  // kernel boots (the second pulling the whole matplotlib wheel closure), three
  // more Pyodide boots for the grader/watchdog/py-Reps specs, plus Monaco — so
  // strict serialization made the wall clock the sum of every heavy boot,
  // including the two specs that need no kernel at all.
  //
  // The parallelism unit is the FILE and no spec shares state: each drives its
  // own fixture page and its own request log, so the per-page boot-count
  // assertions stay valid however many workers run. Two is deliberately modest
  // for a 2-core runner, and `retries: 1` above already covers a contention
  // timeout. Locally, 1 keeps the output readable.
  workers: process.env.CI ? 2 : 1,
  // `list` alone replaces the DEFAULT reporter set, so no playwright-report/ was
  // ever written and a red CI run left nothing but stdout — while the trace that
  // `retries: 1` + `trace: "on-first-retry"` exist to capture died with the
  // runner. In CI both reporters run and ci.yml uploads the two directories on
  // failure; locally `list` is still the whole story.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx serve out -l 4173 -c ../serve.json --no-clipboard",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
