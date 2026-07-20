import { test, expect } from "@playwright/test";
import { MONACO_VERSION } from "../src/lib/monaco-path";

/**
 * End-to-end proof of the ```runnable fence — the inline Python sandbox on
 * 01-foundations, which until now was the only executable surface in the repo
 * with no browser coverage at all. The Jest suites cannot reach it:
 * code-editor.test.tsx mocks `@monaco-editor/react` wholesale (its assertion
 * passes whether or not /monaco/<version>/vs exists or is complete) and
 * runnable-editor.test.tsx substitutes a plain <textarea> for CodeEditor. The
 * other four e2e specs assert zero third-party requests but never mount Monaco.
 *
 * This drives the real learner path on the fixture page
 * (src/app/e2e-fixtures/runnable-editor/page.tsx):
 *   1. Monaco boots from the self-hosted, VERSION-STAMPED /monaco/<version>/vs
 *      and becomes editable (the a11y-labelled textarea `onMount` depends on).
 *   2. Run executes the fence verbatim on the shared worker-hosted Pyodide
 *      runtime + the real qcsim wheel — the Bell amplitudes must come back.
 *   3. An EDIT reaches Python, proving the editor's model (not the seeded
 *      source) is what runs.
 *   4. Reset restores the fence source.
 *
 * Two regression guards ride along:
 *   - zero third-party requests, the same exact-origin filter the sibling specs
 *     use — Monaco must never regress to @monaco-editor/loader's jsdelivr
 *     default, and Pyodide must never fall back to the CDN.
 *   - no failed same-origin response, which is what makes stage-monaco.mjs's
 *     unreachable-asset filter (ts/css/html/json workers, locale bundles) safe:
 *     if the Python editor ever did reach for one of the dropped files, it would
 *     surface here as a 404 rather than as a silent feature loss.
 */

// Static export + serve.json cleanUrls:false → the page is served at its literal
// exported filename, not the clean URL (same gotcha as /lab/lab/index.html).
const FIXTURE = "/e2e-fixtures/runnable-editor.html";

// The Bell amplitudes qcsim prints for the fence's circuit: numpy renders
// 1/sqrt(2) as 0.70710678 on |00> and |11>, zero elsewhere.
const BELL_AMPLITUDE = "0.70710678";

test("runnable fence: self-hosted Monaco boots, edits reach real Pyodide, fully same-origin", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const failed: string[] = [];
  page.on("request", (req) => {
    const u = req.url();
    if (/^https?:/.test(u) && new URL(u).origin !== origin) {
      external.push(`${req.method()} ${u}`);
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[fixture console error]", m.text());
  });
  page.on("pageerror", (e) => console.log("[fixture page error]", e.message));

  await page.goto(FIXTURE);

  // 1) Monaco actually mounted. `.monaco-editor` only exists once the AMD graph
  // (loader.js → editor.main.js → the hashed editor.api/workers chunks)
  // resolved, and the aria-label is set in CodeEditor's `options`, so its
  // presence proves the real editor rendered rather than the "Loading editor…"
  // placeholder or the "Couldn't load the editor" timeout notice.
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 60_000 });
  const input = page.getByLabel("Editable Python code");
  await expect(input).toBeAttached();
  await expect(page.getByText("Couldn't load the editor")).toHaveCount(0);
  // The version-stamped path is the premise of the immutable cache grant, so
  // assert the browser really fetched from it rather than from a bare /monaco/.
  const editorRequests = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((n) => n.includes("/monaco/"))
  );
  expect(editorRequests.length).toBeGreaterThan(0);
  for (const url of editorRequests) {
    expect(url).toContain(`/monaco/${MONACO_VERSION}/vs/`);
  }

  const runButton = page.getByRole("button", { name: "Run" });
  const output = page.getByRole("status").first();

  // 2) The fence source runs on real Pyodide + the real qcsim wheel. The boot
  // notice renders synchronously on click; the wasm boot behind it takes
  // seconds at minimum, so this cannot race past us.
  await runButton.click();
  await expect(output).toContainText("Booting Python", { timeout: 15_000 });
  await expect(output).toContainText(BELL_AMPLITUDE, { timeout: 150_000 });

  // 3) An edit reaches Python. Monaco owns its own model, so drive it with real
  // keystrokes rather than setting the textarea's value — this is the only check
  // that proves the learner's typing (not the seeded `source` prop) is what
  // executes. Append rather than replace: select-all is bound differently across
  // platforms in Monaco, and appending keeps the assertion deterministic (both
  // the original print and the new one must appear).
  await page.locator(".view-line").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type("\nprint(6 * 7)");
  await expect(page.locator(".monaco-editor").first()).toContainText("print(6 * 7)");
  await runButton.click();
  // Runs 2..N reuse the cached interpreter, so this one never boots.
  await expect(output).toContainText("42", { timeout: 60_000 });
  await expect(output).toContainText(BELL_AMPLITUDE);

  // 4) Reset restores the fence source in the editor's model (and drops the edit).
  await page.getByRole("button", { name: "Reset" }).click();
  const editorPane = page.locator(".monaco-editor").first();
  await expect(editorPane).toContainText("Circuit().h(0).cnot(0, 1)");
  await expect(editorPane).not.toContainText("print(6 * 7)");

  // Monaco's boot + two real Python runs made zero third-party requests: the
  // editor came from /monaco/<version>/vs, Pyodide from /pyodide/, the wheel
  // from /lab/files/wheels/.
  expect(
    external,
    `the runnable editor made third-party requests:\n${external.join("\n")}`
  ).toEqual([]);

  // Nothing the editor or the runtime asked for is missing from the staged
  // trees — the guard on stage-monaco.mjs's filtered copy.
  expect(
    failed,
    `same-origin requests failed:\n${failed.join("\n")}`
  ).toEqual([]);
});
