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
  expect: { timeout: 150_000 },
  // The lab is now fully same-origin (Pyodide + wheels self-hosted, comm bundled), so
  // the run is deterministic with no network dependency. The single CI retry is kept
  // only as insurance against CPU-contention timeouts on shared runners, not flaky
  // CDN fetches; the spec also asserts zero third-party requests.
  retries: process.env.CI ? 1 : 0,
  // Serial: each test boots its own Pyodide kernel; running them concurrently would
  // pit two heavy WASM boots against each other on a 2-core CI runner and risk
  // timeouts. Wall-clock is a few notebook runs, still well under the build-smoke job.
  workers: 1,
  reporter: "list",
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
