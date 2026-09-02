import { test, expect } from "@playwright/test";
import manifest from "../src/lib/content-manifest.json";
import { logPageDiagnostics } from "./_support/instrument";

/**
 * The /workspace Lab launcher, end-to-end against the static export. In a build with no
 * Cognito env the page renders its unconfigured bench — the cockpit and the Lab are pure
 * localStorage + build-time manifest, so they are fully present without an account. This
 * smoke asserts a Lab "Open ↗" href resolves to a REAL browser-runnable notebook: the
 * href must be one the manifest (the single source of truth) allows, AND the notebook it
 * names must actually be served out of the staged lab tree. It is deliberately
 * Pyodide-free and fast — the heavy kernel path is covered by lab-pyodide.e2e.ts.
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
  request,
}) => {
  // Diagnostics only. This spec makes no network claim of its own — the Lab is a
  // build-time manifest render, and the same-origin guarantee is asserted by the
  // specs that actually load the runtime — but a hydration error here should
  // still land in the test output rather than only as a locator timeout.
  logPageDiagnostics(page, "workspace");

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

  // …and the notebook must actually BE THERE. The check above compares the
  // launcher's href to the manifest the launcher renders from, so on its own it
  // can only catch a URL-construction bug in NotebookLink — which Jest already
  // covers (__tests__/components/notebook-link.test.tsx). The real risk is
  // downstream of the manifest: build.sh stages notebooks with a glob and the
  // Python guard checks the manifest against the repo SOURCE tree, so a section
  // dropped by `jupyter lite build` or by the Next export would leave this spec
  // green and the learner with a 404. One HEAD against the served tree closes
  // that, with no Pyodide boot — this spec stays deliberately fast.
  const notebookPath = new URL(href!, "http://localhost").searchParams.get("path");
  expect(notebookPath).toBeTruthy();
  const served = `/lab/files/${notebookPath!.split("/").map(encodeURIComponent).join("/")}`;
  const head = await request.head(served);
  expect(head.ok(), `${served} is not served (${head.status()})`).toBe(true);

  // And the header count is the honest total of runnable notebooks.
  const runnableTotal = manifest.sections.reduce(
    (n, s) => n + s.notebooks.filter((nb) => nb.runnable).length,
    0,
  );
  // Post-hydrate like the two assertions above, so it carries the same explicit
  // headroom rather than inheriting the small expect default.
  await expect(lab).toContainText(`${runnableTotal} notebooks run in-browser`, {
    timeout: 30_000,
  });
});
