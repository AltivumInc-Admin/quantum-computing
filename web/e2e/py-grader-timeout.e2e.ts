import { test, expect } from "@playwright/test";

/**
 * End-to-end proof of the worker watchdog — the guarantee that a learner's
 * `while True:` can no longer hard-lock the tab (pre-worker, learner Python ran
 * on the MAIN THREAD and the only recovery was the browser's kill dialog).
 *
 * Drives the same fixture page as challenge-py-grader.e2e.ts, but with
 * `?timeoutMs=2000` (see the fixture's TimeoutOverride) so the spec does not
 * have to wait out the 30s production default. Kept SEPARATE from that spec
 * because this one deliberately boots Pyodide twice — folding it in would
 * destroy that spec's single-boot premise for its fresh-namespace proof.
 *
 * Asserts, in one page session:
 *   1. an infinite-loop submission is KILLED: the exact learner-facing message
 *      (what happened + the environment was reset + check for an infinite loop)
 *      lands in the verdict — unprefixed, not "Your code raised:";
 *   2. the killed-then-rebooted runtime still grades correctly: the next Check
 *      boots a fresh interpreter and produces the grader's exact solved literal;
 *   3. exactly TWO interpreter boots (wasm fetches) — the kill really discarded
 *      the runtime (one boot would mean a poisoned interpreter survived; three
 *      would mean the cache thrashes);
 *   4. the whole flow stays fully same-origin (zero third-party requests),
 *      reboot included.
 */

// Static export + serve.json cleanUrls:false → served at the literal exported
// filename; the query string only feeds TimeoutOverride.
const FIXTURE = "/e2e-fixtures/py-challenge.html?timeoutMs=2000";

const INFINITE_LOOP = "while True:\n    pass";
const SOLUTION =
  "from braket.circuits import Circuit\ncircuit = Circuit().h(0).cnot(0, 1)";

test("watchdog: an infinite loop is killed with a reset message, and a fresh runtime still grades", async ({
  page,
  baseURL,
}) => {
  // Two full Pyodide boots on a cold CI runner can exceed the config default.
  test.setTimeout(360_000);

  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const bootFetches: string[] = [];
  page.on("request", (req) => {
    const u = req.url();
    if (/^https?:/.test(u) && new URL(u).origin !== origin) {
      external.push(`${req.method()} ${u}`);
    }
    if (u.includes("pyodide.asm.wasm")) bootFetches.push(u);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[fixture console error]", m.text());
  });
  page.on("pageerror", (e) => console.log("[fixture page error]", e.message));

  await page.goto(FIXTURE);
  await expect(
    page.getByText("graded with real qcsim in your browser")
  ).toBeVisible();

  const editor = page.getByLabel("Your circuit");
  const check = page.getByRole("button", { name: "Check" });
  const verdict = page.getByRole("status").first();

  // 1) Infinite loop → the watchdog terminates the worker and the learner sees
  // the full in-register message (per the 2000ms override: "2 seconds").
  await editor.fill(INFINITE_LOOP);
  await check.click();
  await expect(verdict).toContainText("Booting Python", { timeout: 15_000 });
  await expect(verdict).toContainText("Execution stopped after 2 seconds", {
    timeout: 150_000,
  });
  await expect(verdict).toContainText(
    "the Python environment was shut down and reset"
  );
  await expect(verdict).toContainText("infinite loop");
  // A watchdog kill is not a Python exception — it must not be misattributed.
  await expect(verdict).not.toContainText("Your code raised:");

  // 2) The page never froze and the runtime rebooted cleanly: a correct
  // solution submitted right after the kill grades to the exact solved literal.
  await editor.fill(SOLUTION);
  await check.click();
  await expect(verdict).toContainText(
    "Correct — verified against the reference state vector.",
    { timeout: 150_000 }
  );

  // 3) Exactly two boots: the kill discarded the first interpreter, the
  // regrade booted (and used) a fresh one.
  expect(
    bootFetches,
    `expected exactly 2 Pyodide boots (kill + fresh reboot), saw ${bootFetches.length}:\n${bootFetches.join("\n")}`
  ).toHaveLength(2);

  // 4) Boot, kill, reboot, grade — all fully same-origin.
  expect(
    external,
    `timeout flow made third-party requests:\n${external.join("\n")}`
  ).toEqual([]);
});
