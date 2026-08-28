// The seam for the account split: BraketClient credentials come from this one
// function. Unset env = same-account (today's behaviour, and the rollback).
import { test } from "node:test";
import assert from "node:assert/strict";
import { braketCredentials } from "./braket-credentials.mjs";

test("unset role ARN -> undefined (same-account; the Lambda's own role)", () => {
  assert.equal(braketCredentials({}), undefined);
  assert.equal(braketCredentials({ BRAKET_ROLE_ARN: "" }), undefined);
});

test("set role ARN -> temporary credentials for exactly that role + external id", () => {
  const calls = [];
  const fake = (opts) => { calls.push(opts); return "PROVIDER"; };
  const out = braketCredentials(
    { BRAKET_ROLE_ARN: "arn:aws:iam::000000000000:role/X", BRAKET_EXTERNAL_ID: "eid-123" },
    fake,
  );
  assert.equal(out, "PROVIDER");
  assert.deepEqual(calls, [{
    params: {
      RoleArn: "arn:aws:iam::000000000000:role/X",
      ExternalId: "eid-123",
      RoleSessionName: "quantum-qpu-braket",
      DurationSeconds: 900,
    },
  }]);
});

test("role ARN without external id throws — a trust policy with a missing condition value must never be attempted", () => {
  assert.throws(
    () => braketCredentials({ BRAKET_ROLE_ARN: "arn:aws:iam::000000000000:role/X" }),
    /BRAKET_EXTERNAL_ID/,
  );
});
