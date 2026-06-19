import { test, expect } from "@playwright/test";

/**
 * Real in-browser Pyodide smoke. Loads the JupyterLite lab from the static export
 * at the exact URL the site links to (NotebookLink's runHref), runs a
 * browser-runnable notebook under real Pyodide + the real qcsim wheel, and asserts
 * the deterministic stdout. This covers what the jsdom-mocked pyodide-runtime test
 * and the CPython notebook-contract test cannot: the actual browser kernel path and
 * the local-wheel install contract.
 *
 * Slow by nature (Pyodide core boots from the jsDelivr CDN, then installs the local
 * qcsim wheel), so timeouts are generous and it lives in CI's build-smoke job.
 */
const NOTEBOOK_URL =
  "/lab/lab/index.html?path=" +
  encodeURIComponent("01-foundations/notebooks/01-first-circuit.ipynb");

test("runs a browser-runnable notebook under real Pyodide and prints deterministic output", async ({
  page,
}) => {
  // Surface lab console errors to the test output for debugging.
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[lab console error]", msg.text());
  });
  page.on("pageerror", (err) => console.log("[lab page error]", err.message));

  await page.goto(NOTEBOOK_URL);

  // The notebook UI mounts.
  await page.locator(".jp-Notebook").first().waitFor({ state: "visible", timeout: 120_000 });

  // JupyterLite exposes no app global, so drive the UI: Run menu -> Run All Cells.
  // Running cells auto-starts the single Pyodide kernel (no kernel-select dialog);
  // the injected bootstrap cell installs qcsim from the local wheel before the
  // notebook's own cells import braket.*. The label is anchored with ^...$ so it
  // does not also match "Restart Kernel and Run All Cells…".
  await page.locator(".lm-MenuBar-itemLabel", { hasText: /^Run$/ }).click();
  await page.locator(".lm-Menu-itemLabel", { hasText: /^Run All Cells$/ }).click();

  // The deterministic output of the H-circuit cell. Asserting on output TEXT (not a
  // cell index, not shot-dependent counts, not ASCII art) keeps it robust.
  await expect(
    page.locator(".jp-OutputArea-output").filter({ hasText: "Qubit count: 1" }).first()
  ).toBeVisible({ timeout: 150_000 });
  await expect(
    page.locator(".jp-OutputArea-output").filter({ hasText: "Circuit depth: 1" }).first()
  ).toBeVisible({ timeout: 30_000 });
});
