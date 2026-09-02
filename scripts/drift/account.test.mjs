/**
 * The identity gate, exercised offline.
 *
 * The account ids below are FICTIONAL twelve-digit strings, present only to
 * exercise string equality. Real account numbers do not appear in this repo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { accountCheck, targetLabel } from "./account.mjs";

test("a matching account verifies, and says nothing more", () => {
  const c = accountCheck("000000000001", "000000000001");
  assert.deepEqual(c, { verified: true, refuse: false, lines: [] });
});

test("a different account REFUSES before any function is read", () => {
  const c = accountCheck("000000000001", "000000000002");
  assert.equal(c.verified, false);
  assert.equal(c.refuse, true);
  assert.match(c.lines.join("\n"), /REFUSING/);
});

test("no id from either side is ever printed", () => {
  for (const c of [
    accountCheck("000000000001", "000000000002"),
    accountCheck("", "000000000002"),
    accountCheck("000000000001", "000000000001"),
  ]) {
    assert.doesNotMatch(c.lines.join("\n"), /\d{6,}/);
  }
});

test("an unset expectation is not a failure — the run continues, unverified", () => {
  for (const unset of [undefined, "", "   "]) {
    const c = accountCheck(unset, "000000000002");
    assert.equal(c.verified, false);
    assert.equal(c.refuse, false);
    assert.match(c.lines.join("\n"), /DRIFT_EXPECT_ACCOUNT is unset/);
  }
});

test("surrounding whitespace does not make a matching account look wrong", () => {
  assert.equal(accountCheck(" 000000000001 ", "000000000001\n").verified, true);
});

test("the header states which claim the run is making", () => {
  assert.equal(
    targetLabel({ region: "us-east-2", accountVerified: true }),
    "region us-east-2, account verified",
  );
  assert.equal(
    targetLabel({ region: "us-east-2", accountVerified: false }),
    "region us-east-2, account unverified",
  );
});
