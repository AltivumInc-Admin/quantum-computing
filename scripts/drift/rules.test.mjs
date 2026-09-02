/**
 * The drift check's rules, exercised with no AWS, no network and no node_modules.
 *
 * These are the cases a live run cannot rehearse on demand — a declared hold, a
 * hold that stopped holding, a function that could not be reached at all — and
 * the ones that decide whether a red morning is a deploy someone owes or an
 * expired token. The whole HELD mechanism shipped verified only by a manual
 * probe against a real function; this is that verification, repeatable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { failureReason, heldFor, isVacuous, redact, render, sourceFiles, staleHolds, verdict } from "./rules.mjs";

const TARGET = { region: "us-east-2", accountVerified: true };

const HOLD = [
  { fn: /^quantum-review-email-/, reason: "a stated reason", clearsWhen: "a stated condition" },
];

const clean = (fn, dir = "lambda/x") => ({ fn, dir, ok: true, compared: 3, drifted: [], missing: [], lastModified: "2026-09-01T00:00:00.000+0000" });
const drifting = (fn, dir = "lambda/x") => ({ fn, dir, ok: false, compared: 3, drifted: ["index.mjs"], missing: [], lastModified: "2026-09-01T00:00:00.000+0000" });
// ok:false because the shell requires compared > 0 to call a row a match.
const vacuous = (fn, dir = "lambda/x") => ({ fn, dir, ok: false, compared: 0, drifted: [], missing: [], lastModified: "2026-09-01T00:00:00.000+0000" });
const errored = (fn, dir = "lambda/x") => ({ fn, dir, ok: false, error: "aws lambda get-function failed" });

test("hand-written source is .mjs/.js at the top level, minus tests and probes", () => {
  assert.deepEqual(
    sourceFiles([
      "index.mjs",
      "qpu-core.mjs",
      "index.test.mjs",
      "probe-tokens.mjs",
      "verify-deploy.mjs",
      "template.yaml",
      "README.md",
      "helper.js",
    ]),
    ["index.mjs", "qpu-core.mjs", "helper.js"],
  );
});

test("undeclared drift fails the run", () => {
  const v = verdict([clean("quantum-tutor"), drifting("quantum-stripe")], HOLD);
  assert.equal(v.exitCode, 1);
  assert.deepEqual(v.bad.map((r) => r.fn), ["quantum-stripe"]);
  assert.equal(v.held.length, 0);
});

test("declared drift prints as HELD and does NOT fail the run", () => {
  const results = [clean("quantum-tutor"), drifting("quantum-review-email-sender", "lambda/review-email")];
  const v = verdict(results, HOLD);
  assert.equal(v.exitCode, 0);
  assert.equal(v.bad.length, 0);
  assert.deepEqual(v.held.map((r) => r.fn), ["quantum-review-email-sender"]);

  const out = render(results, HOLD, TARGET).join("\n");
  assert.match(out, /HELD {4}quantum-review-email-sender/);
  assert.match(out, /HELD ON PURPOSE/);
  assert.match(out, /why: {3}a stated reason/);
  assert.match(out, /until: a stated condition/);
  assert.match(out, /All 1 unheld functions match git\. 1 held on purpose/);
});

test("a hold matching nothing that drifts reports itself stale", () => {
  const results = [clean("quantum-tutor"), clean("quantum-review-email-sender")];
  assert.deepEqual(staleHolds(HOLD, results), HOLD);
  const out = render(results, HOLD, TARGET).join("\n");
  assert.match(out, /no longer matches any drifting function/);
  assert.match(out, /delete it from scripts\/check-lambda-drift\.mjs/);
});

test("a live hold is not reported stale", () => {
  assert.deepEqual(staleHolds(HOLD, [drifting("quantum-review-email-prefs")]), []);
});

test("heldFor names the entry covering a function, and nothing else", () => {
  assert.equal(heldFor(HOLD, "quantum-review-email-prefs"), HOLD[0]);
  assert.equal(heldFor(HOLD, "quantum-tutor"), undefined);
});

test("a row that could not be checked prints as ?? and exits 2", () => {
  const results = [clean("quantum-tutor"), errored("quantum-stripe")];
  assert.equal(verdict(results, HOLD).exitCode, 2);
  const out = render(results, HOLD, TARGET).join("\n");
  assert.match(out, /\?\? {2}quantum-stripe\s+could not check — aws lambda get-function failed/);
});

test("a drifted row alongside an errored row still exits 1, and the error is not drift", () => {
  const results = [drifting("quantum-stripe"), errored("quantum-tutor")];
  const v = verdict(results, HOLD);
  // The errored row is neither a match nor a mismatch: it was never read.
  assert.deepEqual(v.bad.map((r) => r.fn), ["quantum-stripe"]);
  assert.deepEqual(v.unchecked.map((r) => r.fn), ["quantum-tutor"]);
  // Drift must not hide behind an infrastructure excuse.
  assert.equal(v.exitCode, 1);
  const out = render(results, HOLD, TARGET).join("\n");
  assert.match(out, /DIFFERS from git: lambda\/x\/index\.mjs/);
  assert.match(out, /1 of 2 functions do NOT match git/);
  assert.match(out, /1 of 2 functions could NOT be checked/);
});

test("an unreachable HELD function is not reported as held", () => {
  // A hold says the drift is deliberate. An outage is not drift, and printing
  // "3 held on purpose" while exiting 2 claimed a decision nobody made.
  const results = [clean("quantum-tutor"), errored("quantum-review-email-sender")];
  const v = verdict(results, HOLD);
  assert.equal(v.held.length, 0);
  assert.equal(v.exitCode, 2);
  const out = render(results, HOLD, TARGET).join("\n");
  assert.doesNotMatch(out, /held on purpose/);
  assert.doesNotMatch(out, /All \d+ unheld functions match git/);
  assert.match(out, /says\n  NOTHING about them/);
});

test("an outage cannot make a stale hold look live", () => {
  assert.deepEqual(staleHolds(HOLD, [errored("quantum-review-email-prefs")]), HOLD);
});

test("everything failing reads as could-not-check, not as eleven undeployed functions", () => {
  const results = ["quantum-tutor", "quantum-stripe"].map((fn) => errored(fn));
  const v = verdict(results, HOLD);
  assert.equal(v.exitCode, 2);
  assert.equal(v.bad.length, 0);
  const out = render(results, HOLD, TARGET).join("\n");
  assert.doesNotMatch(out, /do NOT match git/);
  assert.match(out, /2 of 2 functions could NOT be checked/);
});

test("a clean run says so, with no hold noise", () => {
  const out = render([clean("quantum-tutor")], [], TARGET).join("\n");
  assert.match(out, /All 1 unheld functions match git\./);
  assert.doesNotMatch(out, /held on purpose/);
  assert.equal(verdict([clean("quantum-tutor")], []).exitCode, 0);
});

test("files git has but the package lacks are informational, not drift", () => {
  const row = { fn: "quantum-qpu-submit", dir: "lambda/qpu", ok: true, compared: 2, drifted: [], missing: ["deploy-check.mjs"], lastModified: "x" };
  assert.equal(verdict([row], []).exitCode, 0);
  assert.match(render([row], [], TARGET).join("\n"), /not packaged, assumed ops-only: deploy-check\.mjs/);
});

test("a row that compared nothing is VACUOUS, fails the run, and says so", () => {
  const results = [clean("quantum-tutor"), vacuous("quantum-stripe")];
  assert.equal(isVacuous(results[1]), true);
  const v = verdict(results, HOLD);
  assert.equal(v.exitCode, 1);
  assert.deepEqual(v.vacuous.map((r) => r.fn), ["quantum-stripe"]);

  const out = render(results, HOLD, TARGET).join("\n");
  assert.match(out, /VACUOUS quantum-stripe/);
  assert.match(out, /NOTHING WAS COMPARED/);
  assert.match(out, /1 of 2 functions compared NOTHING/);
  // The claim this whole finding exists to prevent.
  assert.doesNotMatch(out, /All \d+ unheld functions match git/);
});

test("every file landing in missing is vacuous too, not a clean row", () => {
  const row = { fn: "quantum-analytics", dir: "lambda/analytics", ok: false, compared: 0, drifted: [], missing: ["index.mjs"], lastModified: "x" };
  assert.equal(verdict([row], []).exitCode, 1);
  assert.match(render([row], [], TARGET).join("\n"), /VACUOUS quantum-analytics/);
});

test("a HELD entry cannot excuse a vacuous row", () => {
  // A hold declares that DRIFT is deliberate. Nothing here was compared closely
  // enough to have drifted, so the hold has nothing to say about it.
  const results = [vacuous("quantum-review-email-sender", "lambda/review-email")];
  const v = verdict(results, HOLD);
  assert.equal(v.exitCode, 1);
  assert.equal(v.held.length, 0);
  assert.match(render(results, HOLD, TARGET).join("\n"), /VACUOUS quantum-review-email-sender/);
});

test("a vacuous held row does not make a stale hold look live", () => {
  assert.deepEqual(staleHolds(HOLD, [vacuous("quantum-review-email-prefs")]), HOLD);
});

test("the compared count prints on every row, so a shrinking one is visible", () => {
  const out = render([clean("quantum-tutor")], [], TARGET).join("\n");
  assert.match(out, /3 compared/);
});

test("a presigned URL never reaches the report", () => {
  // execFileSync's message is the whole argv, and the download step's argv used
  // to carry the presigned package URL — signature and session token included —
  // straight into a public Actions log.
  const message =
    "Command failed: curl -sS -o /tmp/fn.zip https://prod-iad-c1-lambda.s3.amazonaws.com/pkg.zip?X-Amz-Signature=deadbeef&X-Amz-Security-Token=AAA";
  assert.doesNotMatch(redact(message), /X-Amz-Signature|https?:\/\//);
  assert.match(redact(message), /<url redacted>/);
  assert.equal(redact(undefined), "");
});

test("the row reports the child's stderr, so a deleted function reads as one", () => {
  const err = {
    message: "Command failed: aws lambda get-function --function-name quantum-tutor",
    stderr:
      "\nAn error occurred (ResourceNotFoundException) when calling the GetFunction operation: Function not found\n",
  };
  assert.equal(
    failureReason(err, "aws lambda get-function failed"),
    "An error occurred (ResourceNotFoundException) when calling the GetFunction operation: Function not found",
  );
});

test("a child that said nothing falls back to the stage, never to the argv", () => {
  assert.equal(failureReason({ message: "Command failed: curl --config -" }, "download failed"), "download failed");
  assert.equal(failureReason({ stderr: "   \n\n" }, "unzip failed"), "unzip failed");
});

test("even a URL on stderr is redacted before it is reported", () => {
  const reason = failureReason({ stderr: "curl: (22) https://example.com/pkg.zip?X-Amz-Signature=x returned 403" }, "download failed");
  assert.doesNotMatch(reason, /https?:\/\//);
});
