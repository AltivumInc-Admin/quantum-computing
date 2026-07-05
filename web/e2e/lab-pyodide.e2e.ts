import { test, expect, type Page } from "@playwright/test";

/**
 * Real in-browser Pyodide smokes. Each test loads the JupyterLite lab from the
 * static export at the exact URL the site links to (NotebookLink's runHref), runs a
 * browser-runnable notebook under real Pyodide + the real qcsim wheel, and asserts
 * deterministic output. This covers what the jsdom-mocked pyodide-runtime test and
 * the CPython notebook-contract test cannot: the actual browser kernel path, the
 * local-wheel install contract, and in-browser matplotlib rendering.
 *
 * Every test ALSO asserts the lab is fully same-origin: the kernel's Pyodide
 * distribution is self-hosted under /lab/static/pyodide/ and the comm wheel is bundled
 * into the local piplite index (with disablePyPIFallback), so a run makes ZERO
 * third-party requests. Before this, the kernel booted Pyodide from cdn.jsdelivr.net
 * and fetched comm from pypi.org on every start — two runtime SPOFs that bricked the
 * whole lab when a CDN was blocked/down. The external-request assertion is the guard.
 */

const nbUrl = (path: string) =>
  "/lab/lab/index.html?path=" + encodeURIComponent(path);

/**
 * Open a notebook, Run All Cells, and record every cross-origin request. Returns the
 * external-request log so the caller can assert the run is fully same-origin (it must
 * stay empty — Pyodide, its wheels, and comm are all self-hosted). chrome-extension://
 * and data: URLs are ignored; only http(s) outside the served origin counts — an
 * EXACT-origin compare, not a loopback prefix, so a stray dev server on another
 * port (or a "localhost.evil.example" host) can never be silently exempted.
 */
async function runAllCells(page: Page, origin: string, notebookPath: string): Promise<string[]> {
  const external: string[] = [];
  page.on("request", (req) => {
    const u = req.url();
    if (/^https?:/.test(u) && new URL(u).origin !== origin) {
      external.push(`${req.method()} ${u}`);
    }
  });
  // Surface lab console/page errors to the test output for debugging.
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[lab console error]", m.text());
  });
  page.on("pageerror", (e) => console.log("[lab page error]", e.message));

  await page.goto(nbUrl(notebookPath));
  await page.locator(".jp-Notebook").first().waitFor({ state: "visible", timeout: 120_000 });
  // Running cells auto-starts the single Pyodide kernel (no kernel-select dialog); the
  // injected bootstrap cell installs qcsim from the local wheel before the notebook's
  // own cells import braket.*. "^Run$" so it doesn't match the "Run All Cells" submenu
  // hover; "^Run All Cells$" so it doesn't match "Restart Kernel and Run All Cells…".
  await page.locator(".lm-MenuBar-itemLabel", { hasText: /^Run$/ }).click();
  await page.locator(".lm-Menu-itemLabel", { hasText: /^Run All Cells$/ }).click();
  return external;
}

const outputs = (page: Page) => page.locator(".jp-OutputArea-output");

const assertSameOrigin = (external: string[]) =>
  expect(external, `lab made third-party requests:\n${external.join("\n")}`).toEqual([]);

test("01-first-circuit: real Pyodide, deterministic stdout, fully same-origin", async ({
  page,
  baseURL,
}) => {
  const external = await runAllCells(
    page,
    new URL(baseURL!).origin,
    "01-foundations/notebooks/01-first-circuit.ipynb"
  );

  // Deterministic output of the H-circuit cell (output TEXT, not a cell index, not
  // shot-dependent counts) — proves Pyodide booted and the qcsim wheel installed.
  await expect(
    outputs(page).filter({ hasText: "Qubit count: 1" }).first()
  ).toBeVisible({ timeout: 150_000 });
  await expect(
    outputs(page).filter({ hasText: "Circuit depth: 1" }).first()
  ).toBeVisible({ timeout: 30_000 });
  // A LATE cell using ghz_state (imported `from lib.circuits`) — only appears if the
  // shared lib/ package is importable in the kernel; its lateness also confirms the
  // whole notebook executed. Guards against jupyterlite re-dropping lib/.
  await expect(
    outputs(page).filter({ hasText: "all qubits agree" }).first()
  ).toBeVisible({ timeout: 90_000 });
  await expect(outputs(page).filter({ hasText: "Traceback" })).toHaveCount(0);

  assertSameOrigin(external);
});

test("06-bloch-playground: matplotlib renders + ipywidgets degrades gracefully, fully same-origin", async ({
  page,
  baseURL,
}) => {
  // The heaviest browser path: loads numpy + the full matplotlib wheel closure
  // (pillow/fonttools/kiwisolver/contourpy/…) same-origin and renders inline plots.
  const external = await runAllCells(
    page,
    new URL(baseURL!).origin,
    "00-prereqs/notebooks/06-bloch-sphere-playground.ipynb"
  );

  // Deterministic stdout from the famous-states table (f-string formatting, so it is
  // robust to numpy print options). Confirms numpy loaded and the notebook executed.
  await expect(
    outputs(page).filter({ hasText: /theta=0\.000\s+phi=0\.000/ }).first()
  ).toBeVisible({ timeout: 150_000 });
  // matplotlib actually rendered an inline PNG in the browser — proves the matplotlib
  // closure (incl. matplotlib-inline) loaded and executed same-origin. The CPython
  // notebook-contract test cannot observe in-browser rendering.
  await expect(outputs(page).locator("img").first()).toBeVisible({ timeout: 90_000 });
  // disablePyPIFallback degrades gracefully: `from ipywidgets import …` fails CLOSED to
  // the static grid (ipywidgets is not bundled and PyPI is disabled) instead of hanging
  // or reaching pypi.org. This is the exact graceful-degradation path the change adds.
  await expect(
    outputs(page).filter({ hasText: "ipywidgets not installed" }).first()
  ).toBeVisible({ timeout: 30_000 });
  await expect(outputs(page).filter({ hasText: "Traceback" })).toHaveCount(0);

  assertSameOrigin(external);
});
