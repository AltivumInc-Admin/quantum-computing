import { test, expect } from "@playwright/test";

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

// Static export + serve.json cleanUrls:false → the page is served at its literal
// exported filename, not the clean URL (same gotcha as /lab/lab/index.html).
const FIXTURE = "/e2e-fixtures/py-challenge.html";

const SOLUTION =
  "from braket.circuits import Circuit\ncircuit = Circuit().h(0).cnot(0, 1)";
const WRONG_BUT_VALID = "from braket.circuits import Circuit\ncircuit = Circuit().x(0)";
const NO_CIRCUIT_BOUND = "answer = 42";

test("tier:py challenge: real Pyodide grades solve/wrong/error, fully same-origin", async ({
  page,
  baseURL,
}) => {
  // Exact-origin compare, NOT a loopback-prefix regex: "same-origin" means the
  // served site's origin (http://127.0.0.1:4173) — a prefix pattern would
  // exempt localhost-on-any-port (a stray dev server) and hosts merely
  // prefixed with "localhost"/"127.0.0.1", green-lighting a build that in
  // production falls back to the CDN.
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  // Every fetch of the Pyodide wasm marks an interpreter BOOT; the runtime
  // must boot exactly once across all three checks or step 3's fresh-namespace
  // proof goes vacuous (a virgin interpreter raises NameError with or without
  // the namespace guard).
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

  // The py-tier caption proves the spec parsed as tier:"py" BEFORE we click —
  // otherwise a schema regression could silently reroute this test to gradeTs
  // and it would "pass" without ever booting Pyodide.
  await expect(
    page.getByText("graded with real qcsim in your browser")
  ).toBeVisible();

  const editor = page.getByLabel("Your circuit");
  const check = page.getByRole("button", { name: "Check" });
  // The widget's outcome region is ONE always-mounted role="status" holding the
  // verdict, the interim boot notice and the schedule note (a live region has to
  // persist to be announced reliably). .first() pins it against the page shell.
  const verdict = page.getByRole("status").first();

  // 1) Correct free-form Braket Python → the grader's exact solved literal.
  await editor.fill(SOLUTION);
  await check.click();
  // The interim notice renders synchronously on click; the WASM boot that
  // follows takes seconds at minimum, so this cannot race past us. It is driven
  // by the `busy` flag in a NEUTRAL tone — never published as a verdict, which
  // is why nothing here asserts a wrong-answer skin around it.
  await expect(verdict).toContainText("Booting Python", { timeout: 15_000 });
  await expect(verdict).toContainText(
    "Correct — verified against the reference state vector.",
    { timeout: 150_000 }
  );

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
  expect(
    bootFetches,
    `Pyodide booted ${bootFetches.length}x — the interpreter must be cached across all three checks:\n${bootFetches.join("\n")}`
  ).toHaveLength(1);

  // The entire boot + three grades made zero third-party requests: Pyodide came
  // from the self-hosted /pyodide/, the qcsim wheel from /lab/files/wheels/.
  expect(
    external,
    `grader made third-party requests:\n${external.join("\n")}`
  ).toEqual([]);
});
