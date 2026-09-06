import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * failover.sh must never be able to act on the wrong AWS account.
 *
 * The script flips main's merge gate between GitHub Actions and the CodeBuild
 * standby, and builds on the standby. Until 2026-09-06 it used whatever
 * credentials were ambient — and on the founder's machine those are ALTIVUM, a
 * different org that held a stale copy of the same stack. `engage` would have
 * created the webhook on the wrong project and re-pointed the gate at it.
 *
 * The fix is two guards in the script (an explicit profile on every aws call,
 * and the caller's identity proven BY NAME against the organization before any
 * mutating subcommand). This file makes those guards a checked property of the
 * source rather than a remembered one: the shim-based scenario suite that first
 * proved them was never committed, so a later edit that adds a bare `aws` call,
 * or moves require_account inside one subcommand function, would otherwise be
 * caught by nobody until the next outage.
 *
 * Assertions are on the SHELL SOURCE, not on running the script — running it
 * needs credentials and an organization, and a unit guard that needs prod
 * access is one nobody runs.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SCRIPT = join(HERE, "..", "..", "infra", "ci-standby", "failover.sh");
const src = readFileSync(SCRIPT, "utf8");
const lines = src.split("\n");

/**
 * Non-comment source lines, with their 1-based line numbers — and NOT the bodies
 * of heredocs. The refusal messages are `cat >&2 <<EOF` blocks that tell the
 * operator what to run next, and one of those lines is literally
 * `aws sso login --profile $ORG_PROFILE`: text, not a call. Matching it as an
 * invocation was this guard's first false positive. Tracking the terminator is
 * cheap and is the correct reading of the shell.
 */
const code = [];
let heredocEnd = null;
lines.forEach((text, i) => {
  if (heredocEnd !== null) {
    if (text.trim() === heredocEnd) heredocEnd = null;
    return;
  }
  const open = /<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/.exec(text);
  if (open) heredocEnd = open[1];
  const t = text.trim();
  if (t !== "" && !t.startsWith("#")) code.push({ n: i + 1, text });
});

test("the file is the one this guard was written for", () => {
  // Vacuity: if the script were renamed or emptied, every assertion below
  // about "no bare aws call" would pass over nothing.
  assert.ok(code.length > 100, `expected a substantial script, got ${code.length} code lines`);
  assert.ok(src.includes("require_account()"), "require_account is gone — the guard this file checks no longer exists");
  assert.ok(src.includes("aws_ql()"), "aws_ql is gone — the profile-bearing wrapper no longer exists");
});

test("every aws invocation names its profile on the command line", () => {
  // The ambient-credentials path. An `aws` call without --profile resolves to
  // whatever the shell carries; here that is a different org. aws_ql() carries
  // --profile "$PROFILE"; the two identity calls in require_account carry theirs
  // directly (one deliberately uses ORG_PROFILE). Anything else is a regression.
  const bare = code.filter(({ text }) => {
    const t = text.trim();
    // A call is a line that RUNS aws (start of line or after a pipe/subshell/
    // assignment), not a line that merely mentions it in a string or an echo.
    const runs = /(^|[|(;&]\s*|=\$\(\s*|!\s*[a-z_]+=\$\(\s*)aws\s/.test(t) && !/^echo\b|^printf\b|^cat\b/.test(t);
    if (!runs) return false;
    return !/--profile\s+"\$(PROFILE|ORG_PROFILE)"/.test(t) && !/^aws_ql\(\)/.test(t);
  });
  assert.deepEqual(
    bare.map(({ n, text }) => `${n}: ${text.trim()}`),
    [],
    "aws invoked without an explicit --profile (use aws_ql, or name the profile on the line)",
  );
});

test("aws_ql itself passes the profile and region explicitly", () => {
  const def = code.find(({ text }) => /^aws_ql\(\)/.test(text.trim()));
  assert.ok(def, "aws_ql() definition not found");
  assert.match(def.text, /--profile "\$PROFILE"/);
  assert.match(def.text, /--region "\$REGION"/);
});

test("the identity guard runs in the dispatcher, before ANY mutating subcommand", () => {
  // A guard inside each function is one forgotten call from acting on ambient
  // credentials again. It must sit in the outer case arm that covers every
  // subcommand touching AWS, and before the inner dispatch.
  const armIdx = lines.findIndex((l) => /^\s*status\|engage\|stand-down\|drill\)/.test(l));
  assert.ok(armIdx >= 0, "dispatcher arm `status|engage|stand-down|drill)` not found — the shared guard has no home");
  const guardIdx = lines.findIndex((l, i) => i > armIdx && /require_account \|\| exit 1/.test(l));
  const innerCaseIdx = lines.findIndex((l, i) => i > armIdx && /^\s*case "\$SUBCOMMAND" in/.test(l));
  assert.ok(guardIdx > armIdx, "require_account || exit 1 missing from the shared arm");
  assert.ok(innerCaseIdx > guardIdx, "the inner dispatch runs BEFORE require_account — a subcommand can act unguarded");
  // And no subcommand that touches AWS is reachable outside that arm.
  for (const sub of ["engage", "stand-down", "drill", "status"]) {
    const outside = lines.findIndex((l, i) => i < armIdx && new RegExp(`^\\s*${sub}\\)`).test(l));
    assert.equal(outside, -1, `'${sub})' is dispatched at line ${outside + 1}, before the guard arm`);
  }
});

test("a missing profile is a refusal, not a fallback", () => {
  // The refusal must fire on an EMPTY profile, not only on a wrong one.
  assert.match(src, /if \[ -z "\$PROFILE" \]; then[\s\S]*?REFUSING: no AWS profile named/);
});

test("the account is resolved by NAME from the organization, and exactly one match is required", () => {
  // Two orgs each hold a "Quantum Learner" account, and names can repeat inside
  // one org. Picking the first of two would silently choose an account.
  assert.match(src, /organizations list-accounts[\s\S]*?--query "Accounts\[\?Name=='\$EXPECT_ACCOUNT_NAME'\]\.Id"/);
  assert.match(src, /if \[ "\$n" != "1" \]/, "the exactly-one check is gone");
  assert.match(src, /if \[ "\$actual" != "\$expected" \]/, "the identity comparison is gone");
});

test("no account id is written in the file, and CLI error text is scrubbed before it is echoed", () => {
  // Public repo. The number must not be here, and the AWS CLI's own error text
  // (which names ARNs) must not be echoed unscrubbed — that is the path a number
  // takes into a pasted transcript.
  assert.doesNotMatch(src, /(?<!\d)\d{12}(?!\d)/, "a 12-digit literal is in failover.sh");
  assert.ok(src.includes("scrub_ids()"), "scrub_ids is gone");
  // Every place the captured stderr file is echoed goes through the scrubber.
  const rawEchoes = code.filter(({ text }) => /<"\$err"/.test(text) && !/scrub_ids/.test(text));
  assert.deepEqual(rawEchoes.map(({ n, text }) => `${n}: ${text.trim()}`), [], "captured CLI stderr echoed without scrub_ids");
  // And the identity calls capture stderr SEPARATELY (2>"$err"), never folded
  // into the compared value (2>&1), where a benign notice breaks the comparison.
  const folded = code.filter(({ text }) => /(list-accounts|get-caller-identity)/.test(text) || /^\s*--query (Account|"Accounts)/.test(text)).filter(({ text }) => /2>&1/.test(text));
  assert.deepEqual(folded.map(({ n }) => n), [], "an identity call folds stderr into its value with 2>&1");
});

test("--profile given anywhere but first is rejected, not dropped", () => {
  assert.match(src, /if \[ \$# -gt 1 \]; then[\s\S]*?--profile must come FIRST/);
});
