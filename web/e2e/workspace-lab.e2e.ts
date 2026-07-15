import { test, expect } from "@playwright/test";
import manifest from "../src/lib/content-manifest.json";

/**
 * The /workspace Lab launcher, end-to-end against the static export. In a build with no
 * Cognito env the page renders its unconfigured bench — the cockpit and the Lab are pure
 * localStorage + build-time manifest, so they are fully present without an account. This
 * smoke asserts a Lab "Open ↗" href resolves to a REAL browser-runnable notebook path
 * from the manifest (the single source of truth), guarding against the launcher ever
 * pointing at a non-existent or non-runnable notebook. It is deliberately Pyodide-free
 * and fast — the heavy kernel path is covered by lab-pyodide.e2e.ts.
 */

// Every href the Lab is allowed to emit: /lab/lab/index.html?path=<dir>/notebooks/<file>
// for the runnable notebooks only, path-encoded exactly as NotebookLink builds it.
const validHrefs = new Set(
  manifest.sections.flatMap((s) =>
    s.notebooks
      .filter((n) => n.runnable)
      .map(
        (n) =>
          "/lab/lab/index.html?path=" + encodeURIComponent(`${s.dirName}/notebooks/${n.filename}`),
      ),
  ),
);

test("a Lab launcher href resolves to a real runnable notebook path from the manifest", async ({
  page,
}) => {
  // The static export emits /workspace.html (serve.json has cleanUrls:false, no SPA
  // fallback), the same verbatim-path convention the lab smokes use. The cockpit and
  // Lab hydrate from localStorage + the manifest after load.
  await page.goto("/workspace.html");

  // The Lab region hydrates from the manifest; its first module's notebooks list "Open ↗".
  const lab = page.getByRole("region", { name: /the lab/i });
  await expect(lab).toBeVisible({ timeout: 30_000 });

  const openLink = lab.getByRole("link", { name: /open/i }).first();
  await expect(openLink).toBeVisible({ timeout: 30_000 });

  const href = await openLink.getAttribute("href");
  expect(href).toBeTruthy();
  // The launcher must point at a real, browser-runnable notebook from the manifest.
  expect(validHrefs.has(href!)).toBe(true);

  // And the header count is the honest total of runnable notebooks.
  const runnableTotal = manifest.sections.reduce(
    (n, s) => n + s.notebooks.filter((nb) => nb.runnable).length,
    0,
  );
  await expect(lab).toContainText(`${runnableTotal} notebooks run in-browser`);
});
