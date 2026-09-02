import { test, expect, type Page } from "@playwright/test";
import { assertSameOrigin, instrument } from "./_support/instrument";

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
 * Open a notebook and Run All Cells. Does only that — the caller installs the
 * request watcher first (e2e/_support/instrument.ts) and holds the logs, so the
 * name says exactly what the function does and the same-origin rationale lives
 * in one place for the whole suite.
 */
async function runAllCells(page: Page, notebookPath: string): Promise<void> {
  await page.goto(nbUrl(notebookPath));
  await page.locator(".jp-Notebook").first().waitFor({ state: "visible", timeout: 120_000 });
  // Running cells auto-starts the single Pyodide kernel (no kernel-select dialog); the
  // injected bootstrap cell installs qcsim from the local wheel before the notebook's
  // own cells import braket.*. "^Run$" so it doesn't match the "Run All Cells" submenu
  // hover; "^Run All Cells$" so it doesn't match "Restart Kernel and Run All Cells…".
  await page.locator(".lm-MenuBar-itemLabel", { hasText: /^Run$/ }).click();
  await page.locator(".lm-Menu-itemLabel", { hasText: /^Run All Cells$/ }).click();
}

const outputs = (page: Page) => page.locator(".jp-OutputArea-output");

test("01-first-circuit: real Pyodide, deterministic stdout, fully same-origin", async ({
  page,
  baseURL,
}) => {
  // The waits below sum to more than the config's per-test cap (120s for the lab
  // shell, then 150 + 30 + 90 for the outputs). Without this the last one to go
  // wrong surfaces as "Test timeout exceeded" instead of the named expectation.
  test.setTimeout(420_000);

  const { external } = instrument(page, baseURL, "lab");
  await runAllCells(page, "01-foundations/notebooks/01-first-circuit.ipynb");

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

  assertSameOrigin(external, "lab");
});

test("06-bloch-playground: matplotlib renders + ipywidgets degrades gracefully, fully same-origin", async ({
  page,
  baseURL,
}) => {
  // Same budget as the sibling test, for the same reason — and this is the
  // heavier of the two.
  test.setTimeout(420_000);

  // The heaviest browser path: loads numpy + the full matplotlib wheel closure
  // (pillow/fonttools/kiwisolver/contourpy/…) same-origin and renders inline plots.
  const { external } = instrument(page, baseURL, "lab");
  await runAllCells(page, "00-prereqs/notebooks/06-bloch-sphere-playground.ipynb");

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

  assertSameOrigin(external, "lab");
});
