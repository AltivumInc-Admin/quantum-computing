/**
 * Offline tests for the kill-switch handler. No live AWS. Run:
 * `cd lambda/qpu && npm ci && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createKillSwitchCore } from "./killswitch.mjs";

const NOW = Date.UTC(2026, 6, 7, 12, 0, 0);

function stubDdb() {
  const puts = [];
  return {
    puts,
    async send(cmd) {
      assert.equal(cmd.constructor.name, "PutItemCommand");
      puts.push(cmd.input);
      return {};
    },
  };
}

const core = (ddb) => createKillSwitchCore({ ddb, ledgerTable: "ledger", now: () => NOW });

test("an SNS budget notification flips the KILL row to disabled=true", async () => {
  const ddb = stubDdb();
  const res = await core(ddb)({
    Records: [{ Sns: { Subject: "AWS Budgets: quantum-qpu-monthly exceeded 100%" } }],
  });
  assert.deepEqual(res, { disabled: true });
  assert.equal(ddb.puts.length, 1);
  const item = ddb.puts[0].Item;
  assert.equal(ddb.puts[0].TableName, "ledger");
  assert.equal(item.pk.S, "KILL");
  assert.equal(item.disabled.BOOL, true);
  assert.equal(item.trippedAt.N, String(NOW));
  assert.match(item.reason.S, /exceeded 100%/);
});

test("it is robust to a message with no Subject", async () => {
  const ddb = stubDdb();
  await core(ddb)({ Records: [{ Sns: {} }] });
  assert.equal(ddb.puts[0].Item.reason.S, "budget-threshold");
  // And to a malformed event.
  await core(ddb)({});
  assert.equal(ddb.puts[1].Item.disabled.BOOL, true);
});
