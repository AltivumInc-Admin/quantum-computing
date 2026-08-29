// Tests for the sub-remap operator script. Fixtures use placeholder AWS
// account ids (000000000000-style, never a real 12-digit account — see
// lambda/qpu/braket-credentials.test.mjs) and placeholder subs/emails.
import test from "node:test";
import assert from "node:assert/strict";
import {
  remapItems,
  foldPending,
  assertAccounts,
  runMigration,
  runFold,
  parseTableMap,
  parseArgs,
} from "./remap-subs.mjs";
import { emailHash } from "../lib/email-hash.mjs";

const OLD_SUB = "11111111-1111-1111-1111-111111111111";
const NEW_SUB = "22222222-2222-2222-2222-222222222222";
const OTHER_OLD_SUB = "33333333-3333-3333-3333-333333333333";
const EMAIL = "learner@example.com";
const HASH = emailHash(EMAIL);

// ---------------------------------------------------------------------------
// remapItems — the pure core
// ---------------------------------------------------------------------------

test("rewrites WALLET#/USER#/CRED# pks through the map and preserves every attribute", () => {
  const items = [
    { pk: { S: `WALLET#${OLD_SUB}` }, credits: { N: "500" }, updatedAt: { N: "1000" } },
    {
      pk: { S: `USER#${OLD_SUB}` },
      completedRuns: { N: "3" },
      completedShots: { N: "450" },
      spentMicros: { N: "1200000" },
    },
    { pk: { S: `CRED#${OLD_SUB}` }, costEstimate: { BOOL: true } },
  ];
  const { writes, pending, unmapped } = remapItems(items, { [OLD_SUB]: NEW_SUB }, {});
  assert.equal(pending.length, 0);
  assert.equal(unmapped.length, 0);
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[0], { ...items[0], pk: { S: `WALLET#${NEW_SUB}` } });
  assert.deepEqual(writes[1], { ...items[1], pk: { S: `USER#${NEW_SUB}` } });
  assert.deepEqual(writes[2], { ...items[2], pk: { S: `CRED#${NEW_SUB}` } });
});

test("sync rows rewrite the bare userId key", () => {
  // quantum-workspace-progress: the WHOLE key is a bare `userId` attribute,
  // no pk prefix at all.
  const item = {
    userId: { S: OLD_SUB },
    completedExercises: { N: "12" },
    lastSyncedAt: { N: "999" },
  };
  const { writes, pending, unmapped } = remapItems([item], { [OLD_SUB]: NEW_SUB }, {});
  assert.equal(pending.length, 0);
  assert.equal(unmapped.length, 0);
  assert.deepEqual(writes, [{ ...item, userId: { S: NEW_SUB } }]);
});

test("quantum-qpu-tasks rewrites the bare userId attribute but leaves idempotencyKey untouched", () => {
  // Verified live (lambda/qpu/template.yaml): the table's REAL primary key is
  // idempotencyKey; sub lives only in a bare `userId` attribute (also a GSI
  // hash key). idempotencyKey is a client-supplied opaque token, never
  // sub-derived, so it must never be rewritten.
  const item = {
    idempotencyKey: { S: "task-abc-123" },
    userId: { S: OLD_SUB },
    status: { S: "COMPLETED" },
    createdAt: { N: "555" },
  };
  const { writes, pending, unmapped } = remapItems([item], { [OLD_SUB]: NEW_SUB }, {});
  assert.equal(pending.length, 0);
  assert.equal(unmapped.length, 0);
  assert.deepEqual(writes, [{ ...item, userId: { S: NEW_SUB } }]);
});

test("a row whose sub is NOT in the map goes to PENDING#<emailHash> when email is known, else to the unmapped report", () => {
  const known = { pk: { S: `WALLET#${OLD_SUB}` }, credits: { N: "100" } };
  const unknown = { pk: { S: `WALLET#${OTHER_OLD_SUB}` }, credits: { N: "50" } };
  const { writes, pending, unmapped } = remapItems(
    [known, unknown],
    {}, // nothing mapped yet — both subs are federated-owned, not native-created
    { [OLD_SUB]: EMAIL }, // only the first sub's email is known
  );
  assert.equal(writes.length, 0);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].pk.S.startsWith(`PENDING#${HASH}`), true);
  assert.equal(pending[0].credits.N, "100");
  assert.equal(unmapped.length, 1);
  assert.equal(unmapped[0].sub, OTHER_OLD_SUB);
  assert.equal(unmapped[0].item, unknown);
});

test("DAY#/KILL/EVENT#/aggregate rows pass through unchanged", () => {
  const items = [
    { pk: { S: "KILL" }, disabled: { BOOL: true }, trippedAt: { N: "42" } },
    { pk: { S: "DAY#2026-08-20" }, dayMicros: { N: "7500000" } },
    { pk: { S: "EVENT#evt_123" }, expiresAt: { N: "999999" } },
    // RECEIPT# is another live non-sub-keyed prefix on quantum-stripe-wallet
    // (lambda/stripe/index.mjs's receiptKey) — same treatment.
    { pk: { S: "RECEIPT#pi_abc" }, credits: { N: "500" } },
  ];
  const { writes, pending, unmapped } = remapItems(items, { [OLD_SUB]: NEW_SUB }, {});
  assert.equal(pending.length, 0);
  assert.equal(unmapped.length, 0);
  assert.deepEqual(writes, items);
});

test("the founder's grandfathered capMicros row survives byte-identical apart from its pk", () => {
  // lambda/qpu/qpu-core.mjs reads capMicros off the USER#<sub> row so a
  // grandfathered allowance is honored across the migration. Nothing else on
  // this row may change shape.
  const item = {
    pk: { S: `USER#${OLD_SUB}` },
    capMicros: { N: "2500000" },
    spentMicros: { N: "1200000" },
    completedRuns: { N: "3" },
    completedShots: { N: "450" },
  };
  const { writes } = remapItems([item], { [OLD_SUB]: NEW_SUB }, {});
  assert.equal(writes.length, 1);
  const { pk, ...restOfWrite } = writes[0];
  const { pk: oldPk, ...restOfItem } = item;
  assert.deepEqual(restOfWrite, restOfItem);
  assert.equal(pk.S, `USER#${NEW_SUB}`);
});

test("multiple pending rows for the same person in one table do not collide (USER# and CRED#)", () => {
  // quantum-qpu-ledger can carry BOTH a USER# and a CRED# row for the same
  // sub. If both are unmapped-but-email-known, they must stage to DISTINCT
  // pks — a naive PENDING#<hash> alone would silently overwrite one.
  const userRow = { pk: { S: `USER#${OLD_SUB}` }, completedRuns: { N: "1" } };
  const credRow = { pk: { S: `CRED#${OLD_SUB}` }, costEstimate: { BOOL: true } };
  const { pending, unmapped } = remapItems([userRow, credRow], {}, { [OLD_SUB]: EMAIL });
  assert.equal(unmapped.length, 0);
  assert.equal(pending.length, 2);
  const pks = pending.map((p) => p.pk.S);
  assert.equal(new Set(pks).size, 2, `pending pks collided: ${pks.join(", ")}`);
  assert.ok(pks.every((pk) => pk.startsWith(`PENDING#${HASH}#`)));
});

test("an unrecognized pk prefix refuses rather than guesses", () => {
  const item = { pk: { S: `SOMETHING#${OLD_SUB}` }, foo: { S: "bar" } };
  assert.throws(() => remapItems([item], { [OLD_SUB]: NEW_SUB }, {}), /unrecognized/i);
});

test("an item shaped like no known table (no pk, no userId, no idempotencyKey) refuses", () => {
  // e.g. a quantum-analytics-daily row, keyed on a bare `day` attribute —
  // this script never remaps that table (it copies verbatim, outside this
  // tool), so seeing one here means the wrong table was fed in.
  const item = { day: { S: "2026-08-20" }, visitors: { N: "12" } };
  assert.throws(() => remapItems([item], {}, {}), /unrecognized/i);
});

// ---------------------------------------------------------------------------
// foldPending — resolving staged rows once a new sub is known
// ---------------------------------------------------------------------------

test("foldPending resolves a pk-prefixed pending row onto its final key", () => {
  const staged = { pk: { S: `PENDING#${HASH}#WALLET` }, credits: { N: "100" } };
  const { writes, deletes, stillPending } = foldPending([staged], { [HASH]: NEW_SUB });
  assert.equal(stillPending.length, 0);
  assert.deepEqual(writes, [{ ...staged, pk: { S: `WALLET#${NEW_SUB}` } }]);
  assert.deepEqual(deletes, [{ pk: { S: `PENDING#${HASH}#WALLET` } }]);
});

test("foldPending resolves a bare-userId pending row and rekeys it", () => {
  const staged = { userId: { S: `PENDING#${HASH}` }, completedExercises: { N: "12" } };
  const { writes, deletes, stillPending } = foldPending([staged], { [HASH]: NEW_SUB });
  assert.equal(stillPending.length, 0);
  assert.deepEqual(writes, [{ ...staged, userId: { S: NEW_SUB } }]);
  assert.deepEqual(deletes, [{ userId: { S: `PENDING#${HASH}` } }]);
});

test("foldPending resolves a tasks-shape pending row without touching idempotencyKey and without a delete", () => {
  const staged = {
    idempotencyKey: { S: "task-abc-123" },
    userId: { S: `PENDING#${HASH}` },
    status: { S: "COMPLETED" },
  };
  const { writes, deletes, stillPending } = foldPending([staged], { [HASH]: NEW_SUB });
  assert.equal(stillPending.length, 0);
  assert.equal(deletes.length, 0);
  assert.deepEqual(writes, [{ ...staged, userId: { S: NEW_SUB } }]);
});

test("foldPending leaves a row staged when its emailHash has no resolution yet", () => {
  const staged = { pk: { S: `PENDING#${HASH}#WALLET` }, credits: { N: "100" } };
  const { writes, deletes, stillPending } = foldPending([staged], {});
  assert.equal(writes.length, 0);
  assert.equal(deletes.length, 0);
  assert.deepEqual(stillPending, [staged]);
});

// ---------------------------------------------------------------------------
// assertAccounts / runMigration — the account guard, and its ordering
// ---------------------------------------------------------------------------

test("assertAccounts resolves when both accounts match", async () => {
  const sourceClient = { getCallerIdentity: async () => "000000000000" };
  const destClient = { getCallerIdentity: async () => "111111111111" };
  const out = await assertAccounts({
    sourceClient,
    destClient,
    expectSourceAccount: "000000000000",
    expectDestAccount: "111111111111",
  });
  assert.deepEqual(out, { sourceAccount: "000000000000", destAccount: "111111111111" });
});

test("refuses to run when --expect-source-account or --expect-dest-account mismatches", async () => {
  const sourceClient = { getCallerIdentity: async () => "000000000000" };
  const destClient = { getCallerIdentity: async () => "111111111111" };
  await assert.rejects(
    () =>
      assertAccounts({
        sourceClient,
        destClient,
        expectSourceAccount: "999999999999", // wrong
        expectDestAccount: "111111111111",
      }),
    /REFUSING.*source account/i,
  );
  await assert.rejects(
    () =>
      assertAccounts({
        sourceClient,
        destClient,
        expectSourceAccount: "000000000000",
        expectDestAccount: "999999999999", // wrong
      }),
    /REFUSING.*dest account/i,
  );
});

test("runMigration refuses on account mismatch BEFORE any scan or write is attempted", async () => {
  let scanned = false;
  let wrote = false;
  const sourceClient = {
    getCallerIdentity: async () => "000000000000",
    scan: async () => {
      scanned = true;
      return [];
    },
  };
  const destClient = {
    getCallerIdentity: async () => "WRONG-ACCOUNT",
    putItems: async () => {
      wrote = true;
    },
  };
  await assert.rejects(
    () =>
      runMigration({
        sourceClient,
        destClient,
        expectSourceAccount: "000000000000",
        expectDestAccount: "111111111111",
        tables: [{ source: "quantum-stripe-wallet", dest: "quantum-stripe-wallet" }],
        subMap: {},
        emailBySub: {},
        execute: true,
      }),
    /REFUSING/,
  );
  assert.equal(scanned, false, "scan must never run before the account guard passes");
  assert.equal(wrote, false, "write must never run before the account guard passes");
});

test("runMigration scans, remaps, and writes only under --execute", async () => {
  const item = { pk: { S: `WALLET#${OLD_SUB}` }, credits: { N: "500" } };
  const putCalls = [];
  const sourceClient = {
    getCallerIdentity: async () => "000000000000",
    scan: async (table) => (table === "quantum-stripe-wallet" ? [item] : []),
  };
  const destClient = {
    getCallerIdentity: async () => "111111111111",
    putItems: async (table, items) => putCalls.push({ table, items }),
  };
  const base = {
    sourceClient,
    destClient,
    expectSourceAccount: "000000000000",
    expectDestAccount: "111111111111",
    tables: [{ source: "quantum-stripe-wallet", dest: "quantum-stripe-wallet" }],
    subMap: { [OLD_SUB]: NEW_SUB },
    emailBySub: {},
  };

  const dryRun = await runMigration({ ...base, execute: false });
  assert.equal(putCalls.length, 0, "dry-run must never write");
  assert.deepEqual(dryRun, [
    { table: "quantum-stripe-wallet", destTable: "quantum-stripe-wallet", writes: 1, pending: 0, unmapped: [] },
  ]);

  const executed = await runMigration({ ...base, execute: true });
  assert.equal(putCalls.length, 1);
  assert.equal(putCalls[0].table, "quantum-stripe-wallet");
  assert.deepEqual(putCalls[0].items, [{ ...item, pk: { S: `WALLET#${NEW_SUB}` } }]);
  assert.equal(executed[0].writes, 1);
});

test("runFold refuses on dest account mismatch before any scan", async () => {
  let scanned = false;
  const destClient = {
    getCallerIdentity: async () => "WRONG",
    scan: async () => {
      scanned = true;
      return [];
    },
  };
  await assert.rejects(
    () =>
      runFold({
        destClient,
        expectDestAccount: "111111111111",
        tables: ["quantum-stripe-wallet"],
        emailHashToSub: {},
        execute: true,
      }),
    /REFUSING/,
  );
  assert.equal(scanned, false);
});

test("runFold folds staged rows and only writes/deletes under --execute", async () => {
  const staged = { pk: { S: `PENDING#${HASH}#WALLET` }, credits: { N: "100" } };
  const puts = [];
  const dels = [];
  const destClient = {
    getCallerIdentity: async () => "111111111111",
    scan: async () => [staged],
    putItems: async (table, items) => puts.push({ table, items }),
    deleteItems: async (table, keys) => dels.push({ table, keys }),
  };
  const result = await runFold({
    destClient,
    expectDestAccount: "111111111111",
    tables: ["quantum-stripe-wallet"],
    emailHashToSub: { [HASH]: NEW_SUB },
    execute: true,
  });
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].items, [{ ...staged, pk: { S: `WALLET#${NEW_SUB}` } }]);
  assert.equal(dels.length, 1);
  assert.deepEqual(dels[0].keys, [{ pk: { S: `PENDING#${HASH}#WALLET` } }]);
  assert.deepEqual(result, [{ table: "quantum-stripe-wallet", folded: 1, stillPending: 0 }]);
});

// ---------------------------------------------------------------------------
// CLI arg parsing — pure, offline
// ---------------------------------------------------------------------------

test("parseTableMap turns old=new pairs into {source,dest}", () => {
  assert.deepEqual(parseTableMap(["quantum-stripe-wallet=quantum-stripe-wallet", "a=b"]), [
    { source: "quantum-stripe-wallet", dest: "quantum-stripe-wallet" },
    { source: "a", dest: "b" },
  ]);
  assert.deepEqual(parseTableMap(undefined), []);
});

test("parseTableMap refuses a malformed pair", () => {
  assert.throws(() => parseTableMap(["no-equals-sign"]), /old=new/);
  assert.throws(() => parseTableMap(["=b"]), /old=new/);
  assert.throws(() => parseTableMap(["a="]), /old=new/);
});

test("parseArgs defaults to dry-run (execute is OFF by default)", () => {
  const args = parseArgs([
    "--source-profile", "altivum",
    "--dest-profile", "ql-prod",
    "--expect-source-account", "000000000000",
    "--expect-dest-account", "111111111111",
    "--table-map", "quantum-stripe-wallet=quantum-stripe-wallet",
    "--sub-map", "/tmp/sub-map.json",
    "--email-by-sub", "/tmp/email-by-sub.json",
  ]);
  assert.equal(args.execute, false);
  assert.equal(args.foldPending, false);
  assert.equal(args.sourceProfile, "altivum");
  assert.equal(args.destProfile, "ql-prod");
  assert.deepEqual(args.tableMap, [{ source: "quantum-stripe-wallet", dest: "quantum-stripe-wallet" }]);
});

test("parseArgs: --execute flips execute on; --fold-pending switches mode", () => {
  const args = parseArgs(["--execute", "--fold-pending", "--fold-map", "/tmp/fold.json"]);
  assert.equal(args.execute, true);
  assert.equal(args.foldPending, true);
  assert.equal(args.foldMapPath, "/tmp/fold.json");
});

test("parseArgs refuses an unrecognized flag", () => {
  assert.throws(() => parseArgs(["--not-a-real-flag"]), /unrecognized/i);
});
