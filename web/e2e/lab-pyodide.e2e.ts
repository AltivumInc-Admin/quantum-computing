import { test, expect } from "@playwright/test";

/**
 * Real in-browser Pyodide smoke. Loads the JupyterLite lab from the static export
 * at the exact URL the site links to (NotebookLink's runHref), runs a
 * browser-runnable notebook under real Pyodide + the real qcsim wheel, and asserts
 * the deterministic stdout. This covers what the jsdom-mocked pyodide-runtime test
 * and the CPython notebook-contract test cannot: the actual browser kernel path and
 * the local-wheel install contract.
 *
 * It ALSO asserts the lab is fully same-origin: the kernel's Pyodide distribution is
 * self-hosted under /lab/static/pyodide/ and the comm wheel is bundled into the local
 * piplite index (with disablePyPIFallback), so a run makes ZERO third-party requests.
 * Before this, the kernel booted Pyodide from cdn.jsdelivr.net and fetched comm from
 * pypi.org on every start — two runtime SPOFs that bricked the whole lab when a CDN
 * was blocked/down. The external-request assertion below is the regression guard.
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

  // Record every cross-origin request so we can prove the run is fully same-origin
  // (asserted after the notebook executes). chrome-extension:// and data: are ignored.
  const external: string[] = [];
  page.on("request", (req) => {
    const u = req.url();
    if (/^https?:/.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) {
      external.push(`${req.method()} ${u}`);
    }
  });

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
  // cell index, not shot-dependent counts, not ASCII art) keeps it robust. This
  // proves Pyodide booted and the qcsim wheel installed (braket.* works).
  await expect(
    page.locator(".jp-OutputArea-output").filter({ hasText: "Qubit count: 1" }).first()
  ).toBeVisible({ timeout: 150_000 });
  await expect(
    page.locator(".jp-OutputArea-output").filter({ hasText: "Circuit depth: 1" }).first()
  ).toBeVisible({ timeout: 30_000 });

  // A LATE cell that depends on the curriculum's shared lib/ package: it uses
  // ghz_state (imported `from lib.circuits` in the prior cell), so this output only
  // appears if lib/ is importable in the kernel. Guards against jupyterlite's
  // default ignore_contents re-dropping lib/ (pre-fix this failed with
  // "ModuleNotFoundError: No module named 'lib'"). Its lateness also confirms
  // Run All Cells executed the whole notebook.
  await expect(
    page.locator(".jp-OutputArea-output").filter({ hasText: "all qubits agree" }).first()
  ).toBeVisible({ timeout: 90_000 });

  // With the notebook fully executed, no cell should have errored.
  await expect(
    page.locator(".jp-OutputArea-output").filter({ hasText: "Traceback" })
  ).toHaveCount(0);

  // Same-origin regression guard: a full kernel boot + qcsim install + run-all just
  // happened, so if anything still reached a third party it would be in `external`.
  // Pyodide (runtime + every wheel) is self-hosted and comm is in the local piplite
  // index, so this must be empty. The message dumps the offending URLs on failure.
  expect(external, `lab made third-party requests:\n${external.join("\n")}`).toEqual([]);
});
