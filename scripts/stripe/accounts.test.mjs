// The retired Stripe account id must not come back.
//
// It is not a hypothetical: `acct_1TuFpH0a2DloOdGu` sat in the Makefile's
// sandbox example, in provision-sandbox.mjs's usage header and in CLAUDE.md's
// sandbox-first rule for weeks after `acct_1U5IQr0txWLZHlL3` became the account
// that was actually provisioned. Every script asserts --expect-account, so the
// documented commands failed closed — which meant the two Dashboard-parity
// guards were never run against the sandbox at all, and the sandbox/live drift
// they exist to observe stayed unobserved.
//
// Zero dependencies: a walk over source text plus the constants module, so
// `node --test` needs no node_modules and nothing to install.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import {
  LIVE_ACCOUNT,
  SANDBOX_ACCOUNT,
  RETIRED_ACCOUNTS,
  KEY_REFS,
  resolveAccount,
} from "./lib/accounts.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Where an operator reads a command from, plus the code that runs it. Bounded on
// purpose: a full-repo walk would spend its time in build output.
const SCANNED = ["Makefile", "CLAUDE.md", "scripts", "lambda", "docs"];
const SKIP_DIRS = new Set(["node_modules", ".git", ".aws-sam", "dist", "coverage"]);

function* files(path) {
  const st = statSync(path);
  if (st.isFile()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* files(join(path, entry.name));
    } else if (entry.isFile()) {
      yield join(path, entry.name);
    }
  }
}

test("the retired sandbox account id survives only where it is named as retired", () => {
  const offenders = [];
  for (const root of SCANNED) {
    for (const file of files(join(REPO, root))) {
      const rel = relative(REPO, file);
      // The constants module records it, and this test names it to look for it.
      if (rel === join("scripts", "stripe", "lib", "accounts.mjs")) continue;
      if (rel === join("scripts", "stripe", "accounts.test.mjs")) continue;
      let src;
      try {
        src = readFileSync(file, "utf8");
      } catch {
        continue; // unreadable or binary; nothing to match anyway
      }
      src.split("\n").forEach((line, i) => {
        for (const retired of RETIRED_ACCOUNTS) {
          if (!line.includes(retired)) continue;
          // CLAUDE.md keeps ONE mention: the sentence saying it is the older id
          // and not the provisioned one. That sentence is why a reader who finds
          // it in an old runbook can tell what it is.
          if (rel === "CLAUDE.md" && /\bolder\b/.test(line)) continue;
          offenders.push(`${rel}:${i + 1}`);
        }
      });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `retired Stripe account id in: ${offenders.join(", ")}. The sandbox is ${SANDBOX_ACCOUNT}.`
  );
});

test("live and sandbox are different accounts, and neither is retired", () => {
  assert.notEqual(LIVE_ACCOUNT, SANDBOX_ACCOUNT);
  for (const id of [LIVE_ACCOUNT, SANDBOX_ACCOUNT]) {
    assert.ok(/^acct_[A-Za-z0-9]+$/.test(id), `${id} is not an account id`);
    assert.ok(!RETIRED_ACCOUNTS.includes(id));
  }
});

test("aliases resolve to the recorded ids and an explicit id passes through", () => {
  assert.equal(resolveAccount("live"), LIVE_ACCOUNT);
  assert.equal(resolveAccount("sandbox"), SANDBOX_ACCOUNT);
  assert.equal(resolveAccount(LIVE_ACCOUNT), LIVE_ACCOUNT);
  assert.equal(resolveAccount(undefined), undefined);
});

test("a retired id is refused before it ever reaches Stripe", () => {
  // Sending it would produce a WRONG ACCOUNT refusal too, but this one says
  // which id to use instead — the difference between fixing the command and
  // weakening the guard.
  assert.throws(() => resolveAccount(RETIRED_ACCOUNTS[0]), /never provisioned/);
});

test("the sandbox key ref is not the live one", () => {
  assert.notEqual(KEY_REFS.live, KEY_REFS.sandbox);
  assert.match(KEY_REFS.sandbox, /Stripe Sandbox/);
});
