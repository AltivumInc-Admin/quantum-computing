// Tests for the sub-remap operator script. Fixtures use placeholder AWS
// account ids (000000000000-style, never a real 12-digit account — see
// lambda/qpu/braket-credentials.test.mjs) and placeholder subs/emails.
import test from "node:test";
import assert from "node:assert/strict";
import {
  remapItems,
  foldPending,
  validateSubMap,
  validateEmailBySub,
  validateEmailHashToSub,
  assertAccounts,
  runMigration,
  runFold,
  buildVerifyRows,
  parseTableMap,
  parseArgs,
  resolveEffectiveConfig,
} from "./remap-subs.mjs";
import { emailHash } from "../lib/email-hash.mjs";

const OLD_SUB = "11111111-1111-1111-1111-111111111111";
const NEW_SUB = "22222222-2222-2222-2222-222222222222";
const OTHER_OLD_SUB = "33333333-3333-3333-3333-333333333333";
const OTHER_NEW_SUB = "44444444-4444-4444-4444-444444444444";
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

test("RECEIPT# rows rewrite their embedded sub attribute; the pk (keyed by PaymentIntent id) never moves", () => {
  // lambda/stripe/index.mjs receiptRowLeg: pk is RECEIPT#<paymentIntentId>,
  // and a bare `sub` attribute is what reclaim() later reads to debit the
  // wallet on a refund/dispute. Passing this through unchanged would orphan
  // every clawback's target sub after the migration.
  const item = {
    pk: { S: "RECEIPT#pi_abc123" },
    sub: { S: OLD_SUB },
    purchasedCredits: { N: "500" },
    refundedCredits: { N: "0" },
    disputedCredits: { N: "0" },
  };
  const { writes, pending, unmapped } = remapItems([item], { [OLD_SUB]: NEW_SUB }, {});
  assert.equal(pending.length, 0);
  assert.equal(unmapped.length, 0);
  assert.deepEqual(writes, [{ ...item, sub: { S: NEW_SUB } }]);
  assert.equal(writes[0].pk.S, "RECEIPT#pi_abc123", "the PaymentIntent-keyed pk must never move");
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

test("unrecognized-shape rows are COLLECTED and reported together, not thrown on the first one", () => {
  const items = [
    { pk: { S: `SOMETHING#${OLD_SUB}` } },
    { day: { S: "2026-08-20" } },
    { pk: { S: `WALLET#${OLD_SUB}` }, credits: { N: "1" } }, // a perfectly fine row, mixed in
  ];
  let thrown;
  try {
    remapItems(items, { [OLD_SUB]: NEW_SUB }, {});
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, "expected remapItems to throw");
  assert.match(thrown.message, /2 row\(s\)/);
  assert.match(thrown.message, /SOMETHING#/);
  assert.match(thrown.message, /unrecognized table shape/);
});

test("remapItems returns a per-row before->after descriptor for dry-run printing", () => {
  const items = [
    { pk: { S: `WALLET#${OLD_SUB}` }, credits: { N: "1" } },
    { pk: { S: "KILL" }, disabled: { BOOL: true } },
    { pk: { S: `WALLET#${OTHER_OLD_SUB}` }, credits: { N: "1" } },
  ];
  const { rows } = remapItems(items, { [OLD_SUB]: NEW_SUB }, {});
  assert.deepEqual(rows[0], { before: `pk=WALLET#${OLD_SUB}`, after: `pk=WALLET#${NEW_SUB}`, bucket: "write" });
  assert.deepEqual(rows[1], { before: "pk=KILL", after: "pk=KILL", bucket: "passthrough" });
  assert.equal(rows[2].bucket, "unmapped");
  assert.equal(rows[2].after, null);
});

test("re-running remapItems over the same source snapshot with the same subMap is deterministic (safe to re-run / upsert)", () => {
  const items = [
    { pk: { S: `WALLET#${OLD_SUB}` }, credits: { N: "500" } },
    { pk: { S: `USER#${OTHER_OLD_SUB}` }, completedRuns: { N: "2" } },
    { pk: { S: "DAY#2026-08-20" }, dayMicros: { N: "1" } },
  ];
  const subMap = { [OLD_SUB]: NEW_SUB, [OTHER_OLD_SUB]: OTHER_NEW_SUB };
  const first = remapItems(items, subMap, {});
  const second = remapItems(items, subMap, {});
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// validateSubMap / validateEmailBySub / validateEmailHashToSub — CRITICAL 1
// ---------------------------------------------------------------------------

test("validateSubMap accepts a clean map", () => {
  assert.deepEqual(validateSubMap({ [OLD_SUB]: NEW_SUB, [OTHER_OLD_SUB]: OTHER_NEW_SUB }), []);
});

test("validateSubMap refuses null, object, and empty-string values", () => {
  const problems = validateSubMap({
    a: null,
    b: { nested: true },
    c: "",
  });
  assert.equal(problems.length, 3);
  assert.ok(problems.some((p) => p.includes('subMap["a"]')));
  assert.ok(problems.some((p) => p.includes('subMap["b"]')));
  assert.ok(problems.some((p) => p.includes('subMap["c"]')));
});

test("validateSubMap refuses duplicate target subs (two olds mapping to one new)", () => {
  const problems = validateSubMap({ [OLD_SUB]: NEW_SUB, [OTHER_OLD_SUB]: NEW_SUB });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /duplicate target/);
  assert.match(problems[0], new RegExp(NEW_SUB));
});

test("validateSubMap refuses a non-object map outright", () => {
  assert.deepEqual(validateSubMap(null), ["subMap must be an object"]);
  assert.deepEqual(validateSubMap("nope"), ["subMap must be an object"]);
  assert.deepEqual(validateSubMap([1, 2]), ["subMap must be an object"]);
});

test("validateEmailBySub refuses malformed values but allows repeated emails (no duplicate-target rule)", () => {
  assert.deepEqual(validateEmailBySub({ [OLD_SUB]: EMAIL, [OTHER_OLD_SUB]: EMAIL }), []);
  assert.deepEqual(validateEmailBySub({ a: null }), ['emailBySub["a"] must be a non-empty string, got null']);
});

test("validateEmailHashToSub refuses duplicate target subs, same as validateSubMap", () => {
  const problems = validateEmailHashToSub({ [HASH]: NEW_SUB, [emailHash("other@example.com")]: NEW_SUB });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /duplicate target/);
});

test("a null subMap value would otherwise write pk WALLET#null — proven caught before any write", async () => {
  const sourceClient = { getCallerIdentity: async () => "000000000000", scan: async () => { throw new Error("must not scan"); } };
  const destClient = { getCallerIdentity: async () => "111111111111", putItem: async () => { throw new Error("must not write"); } };
  await assert.rejects(
    () =>
      runMigration({
        sourceClient,
        destClient,
        expectSourceAccount: "000000000000",
        expectDestAccount: "111111111111",
        tables: [{ source: "quantum-stripe-wallet", dest: "quantum-stripe-wallet" }],
        subMap: { [OLD_SUB]: null },
        emailBySub: {},
        execute: true,
      }),
    /REFUSING.*invalid subMap/i,
  );
});

// ---------------------------------------------------------------------------
// foldPending — resolving staged rows once a new sub is known
// ---------------------------------------------------------------------------

test("foldPending resolves a pk-prefixed pending row onto its final key", () => {
  const staged = { pk: { S: `PENDING#${HASH}#WALLET` }, credits: { N: "100" } };
  const { writes, deletes, stillPending, skipped } = foldPending([staged], { [HASH]: NEW_SUB });
  assert.equal(stillPending.length, 0);
  assert.equal(skipped.length, 0);
  assert.deepEqual(writes, [{ ...staged, pk: { S: `WALLET#${NEW_SUB}` } }]);
  assert.deepEqual(deletes, [{ pk: { S: `PENDING#${HASH}#WALLET` } }]);
});

test("foldPending resolves a bare-userId pending row and rekeys it", () => {
  const staged = { userId: { S: `PENDING#${HASH}` }, completedExercises: { N: "12" } };
  const { writes, deletes, stillPending, skipped } = foldPending([staged], { [HASH]: NEW_SUB });
  assert.equal(stillPending.length, 0);
  assert.equal(skipped.length, 0);
  assert.deepEqual(writes, [{ ...staged, userId: { S: NEW_SUB } }]);
  assert.deepEqual(deletes, [{ userId: { S: `PENDING#${HASH}` } }]);
});

test("foldPending resolves a tasks-shape pending row without touching idempotencyKey and without a delete", () => {
  const staged = {
    idempotencyKey: { S: "task-abc-123" },
    userId: { S: `PENDING#${HASH}` },
    status: { S: "COMPLETED" },
  };
  const { writes, deletes, stillPending, skipped } = foldPending([staged], { [HASH]: NEW_SUB });
  assert.equal(stillPending.length, 0);
  assert.equal(skipped.length, 0);
  assert.equal(deletes.length, 0);
  assert.deepEqual(writes, [{ ...staged, userId: { S: NEW_SUB } }]);
});

test("foldPending resolves a RECEIPT#-shape pending row (embedded sub) without a delete", () => {
  const staged = { pk: { S: "RECEIPT#pi_abc123" }, sub: { S: `PENDING#${HASH}` }, purchasedCredits: { N: "500" } };
  const { writes, deletes, stillPending, skipped } = foldPending([staged], { [HASH]: NEW_SUB });
  assert.equal(stillPending.length, 0);
  assert.equal(skipped.length, 0);
  assert.equal(deletes.length, 0);
  assert.deepEqual(writes, [{ ...staged, sub: { S: NEW_SUB } }]);
});

test("foldPending leaves a row staged when its emailHash has no resolution yet (stillPending, not skipped)", () => {
  const staged = { pk: { S: `PENDING#${HASH}#WALLET` }, credits: { N: "100" } };
  const { writes, deletes, stillPending, skipped } = foldPending([staged], {});
  assert.equal(writes.length, 0);
  assert.equal(deletes.length, 0);
  assert.equal(skipped.length, 0);
  assert.deepEqual(stillPending, [staged]);
});

test("foldPending treats an already-final (non-PENDING) row as skipped, never stillPending", () => {
  const finalRows = [
    { pk: { S: `WALLET#${NEW_SUB}` }, credits: { N: "500" } },
    { userId: { S: NEW_SUB }, completedExercises: { N: "1" } },
    { idempotencyKey: { S: "task-1" }, userId: { S: NEW_SUB } },
    { pk: { S: "RECEIPT#pi_x" }, sub: { S: NEW_SUB } },
    { pk: { S: "KILL" }, disabled: { BOOL: true } },
  ];
  const { writes, deletes, stillPending, skipped } = foldPending(finalRows, { [HASH]: NEW_SUB });
  assert.equal(writes.length, 0);
  assert.equal(deletes.length, 0);
  assert.equal(stillPending.length, 0);
  assert.equal(skipped.length, finalRows.length);
});

test("foldPending throws on a malformed pending marker rather than silently skipping it", () => {
  const malformed = { pk: { S: "PENDING#not-a-real-hash" }, credits: { N: "1" } };
  assert.throws(() => foldPending([malformed], { [HASH]: NEW_SUB }), /malformed pending/);
});

// ---------------------------------------------------------------------------
// Composed round trip: stage via remapItems, resolve via foldPending
// ---------------------------------------------------------------------------

test("composed round trip: remapItems stages a pending row and foldPending resolves it to the exact same final row remapItems would have produced directly", () => {
  const item = { pk: { S: `USER#${OLD_SUB}` }, completedRuns: { N: "3" }, capMicros: { N: "2500000" } };

  // First pass: sub not yet mapped, only email known — stages as pending.
  const staged = remapItems([item], {}, { [OLD_SUB]: EMAIL });
  assert.equal(staged.pending.length, 1);
  assert.equal(staged.writes.length, 0);

  // Later: Step 3 mints the native user; fold resolves the staged row.
  const folded = foldPending(staged.pending, { [HASH]: NEW_SUB });
  assert.equal(folded.stillPending.length, 0);
  assert.equal(folded.writes.length, 1);
  assert.deepEqual(folded.deletes, [{ pk: { S: staged.pending[0].pk.S } }]);

  // The folded row must match what a direct (subMap-known-up-front) remap
  // would have produced — same final key, same attributes.
  const direct = remapItems([item], { [OLD_SUB]: NEW_SUB }, {});
  assert.deepEqual(folded.writes[0], direct.writes[0]);
});

// ---------------------------------------------------------------------------
// assertAccounts / runMigration — the account guard, and its ordering
// ---------------------------------------------------------------------------

test("assertAccounts resolves when both accounts match and differ from each other", async () => {
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

test("assertAccounts refuses when source and dest resolve to the SAME account", async () => {
  const sourceClient = { getCallerIdentity: async () => "000000000000" };
  const destClient = { getCallerIdentity: async () => "000000000000" };
  await assert.rejects(
    () =>
      assertAccounts({
        sourceClient,
        destClient,
        expectSourceAccount: "000000000000",
        expectDestAccount: "000000000000",
      }),
    /REFUSING.*SAME account/i,
  );
});

test("runMigration refuses on account mismatch BEFORE any scan or write is attempted", async () => {
  let scanned = false;
  const sourceClient = {
    getCallerIdentity: async () => "000000000000",
    scan: async () => {
      scanned = true;
      return [];
    },
  };
  let wrote = false;
  const destClient = {
    getCallerIdentity: async () => "WRONG-ACCOUNT",
    putItem: async () => {
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
    putItem: async (table, writtenItem) => putCalls.push({ table, item: writtenItem }),
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
  assert.equal(dryRun.length, 1);
  assert.equal(dryRun[0].table, "quantum-stripe-wallet");
  assert.equal(dryRun[0].destTable, "quantum-stripe-wallet");
  assert.equal(dryRun[0].writes, 1);
  assert.equal(dryRun[0].pending, 0);
  assert.deepEqual(dryRun[0].unmapped, []);
  assert.equal(dryRun[0].toWrite, 1);
  assert.equal(dryRun[0].rows.length, 1);
  assert.equal(dryRun[0].rows[0].bucket, "write");

  const executed = await runMigration({ ...base, execute: true });
  assert.equal(putCalls.length, 1);
  assert.equal(putCalls[0].table, "quantum-stripe-wallet");
  assert.deepEqual(putCalls[0].item, { ...item, pk: { S: `WALLET#${NEW_SUB}` } });
  assert.equal(executed[0].toWrite, 1);
});

test("'wrote' accounting (toWrite) includes pending writes, not just mapped writes", async () => {
  const item = { pk: { S: `WALLET#${OLD_SUB}` }, credits: { N: "500" } };
  const putCalls = [];
  const sourceClient = {
    getCallerIdentity: async () => "000000000000",
    scan: async () => [item],
  };
  const destClient = {
    getCallerIdentity: async () => "111111111111",
    putItem: async (table, writtenItem) => putCalls.push(writtenItem),
  };
  const results = await runMigration({
    sourceClient,
    destClient,
    expectSourceAccount: "000000000000",
    expectDestAccount: "111111111111",
    tables: [{ source: "quantum-stripe-wallet", dest: "quantum-stripe-wallet" }],
    subMap: {},
    emailBySub: { [OLD_SUB]: EMAIL }, // stages as pending, not a mapped write
    execute: true,
    allowUnmapped: true, // irrelevant here — nothing is unmapped, just pending
  });
  assert.equal(results[0].writes, 0);
  assert.equal(results[0].pending, 1);
  assert.equal(results[0].toWrite, 1, "toWrite must count the pending row too");
  assert.equal(putCalls.length, 1);
});

// ---------------------------------------------------------------------------
// CRITICAL 2 — --execute with unmapped rows must fail loudly
// ---------------------------------------------------------------------------

test("--execute with unmapped rows refuses BEFORE any write, listing the unmapped pks, unless --allow-unmapped", async () => {
  const walletItem = { pk: { S: `WALLET#${OLD_SUB}` }, credits: { N: "500" } }; // mapped, would write fine
  const orphanItem = { pk: { S: `USER#${OTHER_OLD_SUB}` }, capMicros: { N: "2500000" } }; // unmapped — the grandfathered row!
  const putCalls = [];
  const sourceClient = {
    getCallerIdentity: async () => "000000000000",
    scan: async (table) => (table === "quantum-stripe-wallet" ? [walletItem] : [orphanItem]),
  };
  const destClient = {
    getCallerIdentity: async () => "111111111111",
    putItem: async (table, item) => putCalls.push({ table, item }),
  };
  const base = {
    sourceClient,
    destClient,
    expectSourceAccount: "000000000000",
    expectDestAccount: "111111111111",
    tables: [
      { source: "quantum-stripe-wallet", dest: "quantum-stripe-wallet" },
      { source: "quantum-qpu-ledger", dest: "quantum-qpu-ledger" },
    ],
    subMap: { [OLD_SUB]: NEW_SUB }, // OTHER_OLD_SUB deliberately absent
    emailBySub: {},
    execute: true,
  };

  await assert.rejects(() => runMigration(base), (err) => {
    assert.match(err.message, /REFUSING/);
    assert.match(err.message, /unmapped/i);
    assert.match(err.message, new RegExp(`USER#${OTHER_OLD_SUB}`));
    return true;
  });
  assert.equal(putCalls.length, 0, "a clean exit that silently drops the unmapped row must never happen");

  const withAllow = await runMigration({ ...base, allowUnmapped: true });
  assert.equal(putCalls.length, 1, "only the mapped wallet row is written; the unmapped row is skipped, not written");
  assert.equal(putCalls[0].table, "quantum-stripe-wallet");
  assert.equal(withAllow.find((r) => r.table === "quantum-qpu-ledger").unmapped.length, 1);
});

test("--dry-run with unmapped rows does NOT refuse (the whole point of dry-run is to see the report)", async () => {
  const orphanItem = { pk: { S: `USER#${OTHER_OLD_SUB}` }, capMicros: { N: "2500000" } };
  const sourceClient = { getCallerIdentity: async () => "000000000000", scan: async () => [orphanItem] };
  const destClient = { getCallerIdentity: async () => "111111111111" };
  const results = await runMigration({
    sourceClient,
    destClient,
    expectSourceAccount: "000000000000",
    expectDestAccount: "111111111111",
    tables: [{ source: "quantum-qpu-ledger", dest: "quantum-qpu-ledger" }],
    subMap: {},
    emailBySub: {},
    execute: false,
  });
  assert.equal(results[0].unmapped.length, 1);
});

// ---------------------------------------------------------------------------
// Error wording — REFUSING (guard) vs ABORTED MID-RUN (partial write failure)
// ---------------------------------------------------------------------------

test("a failure mid-putItems prints ABORTED MID-RUN with an accurate N of M and the failing pk, never REFUSING", async () => {
  const items = [
    { pk: { S: `WALLET#${OLD_SUB}` }, credits: { N: "1" } },
    { pk: { S: `WALLET#${OTHER_OLD_SUB}` }, credits: { N: "1" } },
  ];
  const sourceClient = { getCallerIdentity: async () => "000000000000", scan: async () => items };
  let calls = 0;
  const destClient = {
    getCallerIdentity: async () => "111111111111",
    putItem: async () => {
      calls += 1;
      if (calls === 2) throw new Error("ProvisionedThroughputExceededException");
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
        subMap: { [OLD_SUB]: NEW_SUB, [OTHER_OLD_SUB]: OTHER_NEW_SUB },
        emailBySub: {},
        execute: true,
      }),
    (err) => {
      assert.doesNotMatch(err.message, /^REFUSING/);
      assert.match(err.message, /ABORTED MID-RUN/);
      assert.match(err.message, /wrote 1 of 2 items to quantum-stripe-wallet/);
      assert.match(err.message, /re-run is safe \(upsert by key\)/);
      assert.match(err.message, new RegExp(`WALLET#${OTHER_NEW_SUB}`)); // the failing (already-remapped) pk
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// runFold — reuses assertAccounts (both modes get the cross-account guard)
// ---------------------------------------------------------------------------

test("runFold refuses on dest account mismatch before any scan (reuses assertAccounts)", async () => {
  let scanned = false;
  const sourceClient = { getCallerIdentity: async () => "000000000000" };
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
        sourceClient,
        destClient,
        expectSourceAccount: "000000000000",
        expectDestAccount: "111111111111",
        tables: ["quantum-stripe-wallet"],
        emailHashToSub: {},
        execute: true,
      }),
    /REFUSING/,
  );
  assert.equal(scanned, false);
});

test("runFold also refuses when source and dest resolve to the same account", async () => {
  const sourceClient = { getCallerIdentity: async () => "000000000000" };
  const destClient = { getCallerIdentity: async () => "000000000000" };
  await assert.rejects(
    () =>
      runFold({
        sourceClient,
        destClient,
        expectSourceAccount: "000000000000",
        expectDestAccount: "000000000000",
        tables: ["quantum-stripe-wallet"],
        emailHashToSub: {},
        execute: true,
      }),
    /REFUSING.*SAME account/i,
  );
});

test("runFold refuses an invalid emailHashToSub before any scan", async () => {
  let scanned = false;
  const sourceClient = { getCallerIdentity: async () => "000000000000" };
  const destClient = { getCallerIdentity: async () => "111111111111", scan: async () => { scanned = true; return []; } };
  await assert.rejects(
    () =>
      runFold({
        sourceClient,
        destClient,
        expectSourceAccount: "000000000000",
        expectDestAccount: "111111111111",
        tables: ["quantum-stripe-wallet"],
        emailHashToSub: { [HASH]: null },
        execute: true,
      }),
    /REFUSING.*invalid emailHashToSub/i,
  );
  assert.equal(scanned, false);
});

test("runFold folds staged rows and only writes/deletes under --execute; the operator summary distinguishes skipped from stillPending", async () => {
  const staged = { pk: { S: `PENDING#${HASH}#WALLET` }, credits: { N: "100" } };
  const finalRow = { pk: { S: `WALLET#${OTHER_NEW_SUB}` }, credits: { N: "1" } }; // already final -> skipped
  const puts = [];
  const dels = [];
  const sourceClient = { getCallerIdentity: async () => "000000000000" };
  const destClient = {
    getCallerIdentity: async () => "111111111111",
    scan: async () => [staged, finalRow],
    putItem: async (table, item) => puts.push({ table, item }),
    deleteItem: async (table, key) => dels.push({ table, key }),
  };
  const result = await runFold({
    sourceClient,
    destClient,
    expectSourceAccount: "000000000000",
    expectDestAccount: "111111111111",
    tables: ["quantum-stripe-wallet"],
    emailHashToSub: { [HASH]: NEW_SUB },
    execute: true,
  });
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].item, { ...staged, pk: { S: `WALLET#${NEW_SUB}` } });
  assert.equal(dels.length, 1);
  assert.deepEqual(dels[0].key, { pk: { S: `PENDING#${HASH}#WALLET` } });
  assert.deepEqual(result, [{ table: "quantum-stripe-wallet", folded: 1, stillPending: 0, skipped: 1 }]);
});

test("runFold ABORTED MID-RUN on a delete failure names the delete verb and the failing key", async () => {
  const staged1 = { pk: { S: `PENDING#${HASH}#WALLET` }, credits: { N: "1" } };
  const staged2 = { pk: { S: `PENDING#${emailHash("second@example.com")}#WALLET` }, credits: { N: "1" } };
  const sourceClient = { getCallerIdentity: async () => "000000000000" };
  const destClient = {
    getCallerIdentity: async () => "111111111111",
    scan: async () => [staged1, staged2],
    putItem: async () => {},
    deleteItem: async (table, key) => {
      if (key.pk.S === staged2.pk.S) throw new Error("ConditionalCheckFailed");
    },
  };
  await assert.rejects(
    () =>
      runFold({
        sourceClient,
        destClient,
        expectSourceAccount: "000000000000",
        expectDestAccount: "111111111111",
        tables: ["quantum-stripe-wallet"],
        emailHashToSub: { [HASH]: NEW_SUB, [emailHash("second@example.com")]: OTHER_NEW_SUB },
        execute: true,
      }),
    (err) => {
      assert.match(err.message, /ABORTED MID-RUN — deleted 1 of 2 items/);
      assert.match(err.message, new RegExp(staged2.pk.S.replace(/[#]/g, "\\#")));
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// buildVerifyRows — --verify mode's core
// ---------------------------------------------------------------------------

test("buildVerifyRows compares capMicros/spentMicros between source and mapped dest row, with subs redacted", () => {
  const sourceItems = [
    { pk: { S: `USER#${OLD_SUB}` }, capMicros: { N: "2500000" }, spentMicros: { N: "900000" } },
  ];
  const destItems = [{ pk: { S: `USER#${NEW_SUB}` }, capMicros: { N: "2500000" }, spentMicros: { N: "900000" } }];
  const rows = buildVerifyRows(sourceItems, destItems, { [OLD_SUB]: NEW_SUB });
  const capRow = rows.find((r) => r.attribute === "capMicros");
  assert.equal(capRow.sourceValue, "2500000");
  assert.equal(capRow.destValue, "2500000");
  assert.equal(capRow.match, true);
  assert.ok(!capRow.sub.includes(OLD_SUB), "sub must be redacted");
  assert.ok(capRow.sub.endsWith("…"));
});

test("buildVerifyRows flags a mismatch when dest value differs from source", () => {
  const sourceItems = [{ pk: { S: `USER#${OLD_SUB}` }, capMicros: { N: "2500000" } }];
  const destItems = [{ pk: { S: `USER#${NEW_SUB}` }, capMicros: { N: "1000000" } }];
  const rows = buildVerifyRows(sourceItems, destItems, { [OLD_SUB]: NEW_SUB });
  const capRow = rows.find((r) => r.attribute === "capMicros");
  assert.equal(capRow.match, false);
});

test("buildVerifyRows reports no dest row (destValue undefined, match false) when the sub isn't mapped yet", () => {
  const sourceItems = [{ pk: { S: `USER#${OLD_SUB}` }, capMicros: { N: "2500000" } }];
  const rows = buildVerifyRows(sourceItems, [], {});
  const capRow = rows.find((r) => r.attribute === "capMicros");
  assert.equal(capRow.destValue, undefined);
  assert.equal(capRow.match, false);
});

test("buildVerifyRows skips passthrough rows (KILL/DAY/EVENT) — nothing sub-owned to compare", () => {
  const rows = buildVerifyRows([{ pk: { S: "KILL" }, disabled: { BOOL: true } }], [], {});
  assert.deepEqual(rows, []);
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

test("parseArgs defaults to dry-run (execute is OFF by default) and --allow-unmapped/--verify default off", () => {
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
  assert.equal(args.allowUnmapped, false);
  assert.equal(args.verify, false);
  assert.equal(args.sourceProfile, "altivum");
  assert.equal(args.destProfile, "ql-prod");
  assert.deepEqual(args.tableMap, [{ source: "quantum-stripe-wallet", dest: "quantum-stripe-wallet" }]);
});

test("parseArgs: --execute flips execute on; --fold-pending switches mode; --allow-unmapped and --verify are booleans", () => {
  const args = parseArgs(["--execute", "--fold-pending", "--fold-map", "/tmp/fold.json", "--allow-unmapped"]);
  assert.equal(args.execute, true);
  assert.equal(args.foldPending, true);
  assert.equal(args.foldMapPath, "/tmp/fold.json");
  assert.equal(args.allowUnmapped, true);

  const verifyArgs = parseArgs(["--verify", "--pk", "pk=WALLET#a", "--pk", "pk=WALLET#b"]);
  assert.equal(verifyArgs.verify, true);
  assert.deepEqual(verifyArgs.pks, ["pk=WALLET#a", "pk=WALLET#b"]);
});

test("parseArgs refuses an unrecognized flag", () => {
  assert.throws(() => parseArgs(["--not-a-real-flag"]), /unrecognized/i);
});

// ---------------------------------------------------------------------------
// resolveEffectiveConfig — migration.json defaults, flags override
// ---------------------------------------------------------------------------

const FILE_CONFIG = {
  tableMap: [{ source: "quantum-stripe-wallet", dest: "quantum-stripe-wallet" }],
  sourceAccountResolution: { method: "sts-get-caller-identity", profile: "altivum-mgmt" },
  destAccountResolution: { method: "organizations-list-accounts", orgProfile: "org-admin", accountName: "QL-Prod" },
};

test("resolveEffectiveConfig uses migration.json's tableMap and account resolutions when no flags override", () => {
  const effective = resolveEffectiveConfig({ tableMap: [] }, FILE_CONFIG);
  assert.deepEqual(effective.tableMap, FILE_CONFIG.tableMap);
  assert.deepEqual(effective.sourceAccountResolution, FILE_CONFIG.sourceAccountResolution);
  assert.deepEqual(effective.destAccountResolution, FILE_CONFIG.destAccountResolution);
});

test("resolveEffectiveConfig lets explicit flags override migration.json entirely", () => {
  const args = {
    tableMap: [{ source: "x", dest: "y" }],
    expectSourceAccount: "000000000000",
    expectDestAccount: "111111111111",
  };
  const effective = resolveEffectiveConfig(args, FILE_CONFIG);
  assert.deepEqual(effective.tableMap, [{ source: "x", dest: "y" }]);
  assert.equal(effective.sourceAccountResolution, null);
  assert.equal(effective.destAccountResolution, null);
});

test("resolveEffectiveConfig refuses when neither flags nor migration.json provide a table map", () => {
  assert.throws(() => resolveEffectiveConfig({ tableMap: [] }, {}), /table-map/i);
});

test("resolveEffectiveConfig refuses when neither a flag nor migration.json can resolve an account", () => {
  assert.throws(
    () => resolveEffectiveConfig({ tableMap: [] }, { tableMap: FILE_CONFIG.tableMap }),
    /expect-source-account/i,
  );
});
