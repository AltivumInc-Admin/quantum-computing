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
import { heldFor, render, sourceFiles, staleHolds, verdict } from "./rules.mjs";

const TARGET = { region: "us-east-2", accountVerified: true };

const HOLD = [
  { fn: /^quantum-review-email-/, reason: "a stated reason", clearsWhen: "a stated condition" },
];

const clean = (fn, dir = "lambda/x") => ({ fn, dir, ok: true, drifted: [], missing: [], lastModified: "2026-09-01T00:00:00.000+0000" });
const drifting = (fn, dir = "lambda/x") => ({ fn, dir, ok: false, drifted: ["index.mjs"], missing: [], lastModified: "2026-09-01T00:00:00.000+0000" });
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
  assert.match(out, /HELD {3}quantum-review-email-sender/);
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

test("a drifted row alongside an errored row is still reported as drift", () => {
  const results = [drifting("quantum-stripe"), errored("quantum-tutor")];
  const v = verdict(results, HOLD);
  assert.deepEqual(v.bad.map((r) => r.fn), ["quantum-stripe", "quantum-tutor"]);
  const out = render(results, HOLD, TARGET).join("\n");
  assert.match(out, /DIFFERS from git: lambda\/x\/index\.mjs/);
});

test("a clean run says so, with no hold noise", () => {
  const out = render([clean("quantum-tutor")], [], TARGET).join("\n");
  assert.match(out, /All 1 unheld functions match git\./);
  assert.doesNotMatch(out, /held on purpose/);
  assert.equal(verdict([clean("quantum-tutor")], []).exitCode, 0);
});

test("files git has but the package lacks are informational, not drift", () => {
  const row = { fn: "quantum-qpu-submit", dir: "lambda/qpu", ok: true, drifted: [], missing: ["deploy-check.mjs"], lastModified: "x" };
  assert.equal(verdict([row], []).exitCode, 0);
  assert.match(render([row], [], TARGET).join("\n"), /not packaged, assumed ops-only: deploy-check\.mjs/);
});
