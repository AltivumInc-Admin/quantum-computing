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
 * End-to-end proof of the Tier-B (Pyodide) grader — the verification
 * pyodide-grader.ts's own header asks for, and the evidence rep-schema.ts's
 * tier:"py" contribution ban is predicated on. Drives the real path a learner
 * would hit: Challenge (tier:"py") → runPy → dynamic import of pyodide-grader →
 * getPyodide boots the SAME-ORIGIN Pyodide distribution (/pyodide/) + installs
 * the real qcsim wheel (/lab/files/wheels/) → the learner's free-form Braket
 * Python executes → its state vector is compared to the TS-simulated reference
 * up to global phase.
 *
 * One test, three verdicts on one booted runtime (boot is the expensive part):
 *   1. correct solution   → the exact solved literal from pyodide-grader.ts
 *   2. wrong-but-valid    → the spec's hint, and NOT an error
 *   3. no `circuit` bound → an error, proving runSerialized's fresh-namespace
 *      guard: the solved run's `circuit` may never stand in for a submission
 *      that failed to define one (the exact regression its comment warns about).
 *
 * Also asserts the whole flow is fully same-origin (zero third-party requests):
 * the grader must boot from the self-hosted /pyodide/, never the CDN fallback.
 *
 * The fixture page (src/app/e2e-fixtures/py-challenge/page.tsx) is the only
 * mount of a tier:"py" challenge; its spec and this test move in lockstep.
 */

const WRONG_BUT_VALID = "from braket.circuits import Circuit\ncircuit = Circuit().x(0)";
const NO_CIRCUIT_BOUND = "answer = 42";

test("tier:py challenge: real Pyodide grades solve/wrong/error, fully same-origin", async ({
  page,
  baseURL,
}) => {
  // Three sequential grades on one boot declare more waiting (15 + 150 + 60 +
  // 60) than the config's per-test cap allows, so a late failure would surface
  // as "Test timeout exceeded" rather than as the expectation that broke.
  test.setTimeout(300_000);

  // Every fetch of the Pyodide wasm marks an interpreter BOOT; the runtime must
  // boot exactly once across all three checks or step 3's fresh-namespace proof
  // goes vacuous (a virgin interpreter raises NameError with or without the
  // namespace guard).
  const { external, bootFetches } = instrument(page, baseURL, "fixture");

  await page.goto(FIXTURE_PY_CHALLENGE);

  // The py-tier caption proves the spec parsed as tier:"py" BEFORE we click —
  // otherwise a schema regression could silently reroute this test to gradeTs
  // and it would "pass" without ever booting Pyodide.
  // Explicit, because this is a post-hydrate assertion: the small expect default
  // is sized for the negative guards, not for a cold runner's first paint.
  await expect(page.getByText(PY_TIER_CAPTION)).toBeVisible({ timeout: 30_000 });

  const editor = page.getByLabel("Your circuit");
  const check = page.getByRole("button", { name: "Check" });
  // The widget's outcome region is ONE always-mounted role="status" holding the
  // verdict, the interim boot notice and the schedule note (a live region has to
  // persist to be announced reliably). .first() pins it against the page shell.
  const verdict = page.getByRole("status").first();

  // 1) Correct free-form Braket Python → the grader's exact solved literal.
  await editor.fill(BELL_SOLUTION);
  await check.click();
  // The interim notice renders synchronously on click; the WASM boot that
  // follows takes seconds at minimum, so this cannot race past us. It is driven
  // by the `busy` flag in a NEUTRAL tone — never published as a verdict, which
  // is why nothing here asserts a wrong-answer skin around it.
  await expect(verdict).toContainText("Booting Python", { timeout: 15_000 });
  await expect(verdict).toContainText(SOLVED, { timeout: 150_000 });

  // 2) Wrong-but-valid Python → the spec's hint (a "wrong" verdict, not an
  // "error"). Reuses the already-booted runtime (enforced by the single-boot
  // assertion at the end — a 60s timeout alone would admit a warm re-boot).
  await editor.fill(WRONG_BUT_VALID);
  await check.click();
  await expect(verdict).toContainText("Start from Circuit().h(0)", {
    timeout: 60_000,
  });

  // 3) Fresh-namespace guard: after a SOLVED run, a submission that never
  // defines `circuit` must error — the previous run's binding may not leak in.
  await editor.fill(NO_CIRCUIT_BOUND);
  await check.click();
  // The verdict embeds a multi-line Python traceback, so assert the two
  // substrings separately rather than with a (newline-blind) `.*` regex.
  await expect(verdict).toContainText("Your code raised:", { timeout: 60_000 });
  await expect(verdict).toContainText("name 'circuit' is not defined");

  // Exactly ONE interpreter boot across all three checks — the premise that
  // makes step 3 a real fresh-namespace proof rather than a virgin-boot alias.
  assertBoots(bootFetches, 1, "the interpreter must be cached across all three checks");

  // The entire boot + three grades made zero third-party requests: Pyodide came
  // from the self-hosted /pyodide/, the qcsim wheel from /lab/files/wheels/.
  assertSameOrigin(external, "grader");
});
