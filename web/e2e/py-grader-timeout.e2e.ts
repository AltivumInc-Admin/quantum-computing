import { test, expect } from "@playwright/test";
import {
  assertBoots,
  assertSameOrigin,
  BELL_SOLUTION,
  FIXTURE_PY_CHALLENGE,
  instrument,
  PY_TIER_CAPTION,
  SOLVED,
} from "./_support/instrument";

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

// The shared fixture path plus the query string that feeds TimeoutOverride.
const FIXTURE = `${FIXTURE_PY_CHALLENGE}?timeoutMs=2000`;

const INFINITE_LOOP = "while True:\n    pass";

test("watchdog: an infinite loop is killed with a reset message, and a fresh runtime still grades", async ({
  page,
  baseURL,
}) => {
  // Two full Pyodide boots on a cold CI runner can exceed the config default.
  test.setTimeout(360_000);

  const { external, bootFetches } = instrument(page, baseURL, "fixture");

  await page.goto(FIXTURE);
  await expect(page.getByText(PY_TIER_CAPTION)).toBeVisible();

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
  await editor.fill(BELL_SOLUTION);
  await check.click();
  await expect(verdict).toContainText(SOLVED, { timeout: 150_000 });

  // 3) Exactly two boots: the kill discarded the first interpreter, the
  // regrade booted (and used) a fresh one.
  assertBoots(bootFetches, 2, "kill + fresh reboot");

  // 4) Boot, kill, reboot, grade — all fully same-origin.
  assertSameOrigin(external, "the timeout flow");
});
