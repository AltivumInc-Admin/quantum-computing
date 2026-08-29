#!/usr/bin/env node
/**
 * Sub-remap operator script — rewrites the ~19 QL-Prod learner-data rows from
 * their OLD Cognito sub (Altivum pool) onto their NEW sub (QL-Prod pool),
 * across the four tables that key data by sub. Run by hand, once, per the
 * migration runbook (docs/superpowers/plans/2026-08-28-platform-migration-qlprod.md).
 *
 * Zero dependencies, on scripts/founding-credit's pattern: a pure DI core
 * (this file's exported functions) that unit-tests offline under
 * `node --test`, plus a thin CLI that shells out to the `aws` CLI. Core and
 * CLI live in one file (unlike founding-credit's issue.mjs/run.mjs split) —
 * this script has no separate roster file to keep pure logic apart from.
 *
 * ============================ CUTOVER ORDER ================================
 * At cutover, `--execute` (remap) ALWAYS runs before `--fold-pending`, never
 * interleaved. Folding first, then re-running remap with a subMap that hasn't
 * caught up yet, would RESURRECT a PENDING row fold just resolved: remap has
 * no memory of what fold already did, so a sub still absent from the (stale)
 * subMap it was given gets staged again, sitting alongside the row fold
 * already wrote under its final key. Running remap first with the freshest
 * subMap available, then folding last, means nothing downstream of a fold can
 * ever re-stage what it just resolved.
 *
 * ============================ TABLE SHAPES (verified live) ================
 * Confirmed against the deployed CloudFormation (each lambda's template.yaml)
 * and the handlers that write these rows — not guessed from the brief alone:
 *
 *  - quantum-stripe-wallet / quantum-qpu-ledger: single attribute `pk` (S) is
 *    the whole key. Sub-owned prefixes: WALLET#<sub>, USER#<sub>, CRED#<sub>.
 *    Passthrough (not sub-derived, copy unchanged): DAY#<date>, KILL,
 *    EVENT#<stripeEventId>.
 *
 *  - RECEIPT#<paymentIntentId> (quantum-stripe-wallet, lambda/stripe/index.mjs
 *    receiptRowLeg) is NOT sub-free — it carries an embedded `sub` (S)
 *    attribute that reclaim() reads on a refund/dispute to know whose wallet
 *    to debit. Its `pk` is keyed by PaymentIntent id and must never move, but
 *    the embedded `sub` attribute IS sub-owned and is rewritten (or staged)
 *    exactly like any other sub-owned value — an earlier draft of this file
 *    passed RECEIPT# through verbatim, which would have silently orphaned
 *    every clawback's target sub.
 *
 *  - quantum-qpu-tasks: the REAL primary key is a bare `idempotencyKey` (S) —
 *    a client-supplied opaque token, never sub-derived, and NEVER rewritten.
 *    The sub lives only in a bare `userId` (S) attribute (also the GSI hash
 *    key `userId-index`), which IS rewritten.
 *
 *  - quantum-workspace-progress: a bare `userId` (S) attribute IS the whole
 *    key (HASH-only table, no `pk`, no prefix). Rewritten directly.
 *
 *  - quantum-analytics-daily: keyed on a bare `day` (S) attribute, carries no
 *    sub anywhere. This script never sees rows from that table — it is copied
 *    verbatim by a plain scan+restore outside this tool (nothing to remap).
 *    If an item of this shape ever reaches remapItems, it refuses rather
 *    than guessing (see classifyItem below).
 *
 * ============================ PENDING staging ==============================
 * A row whose OLD sub has no entry in subMap (a federated learner not yet
 * re-created in the new pool) stages under a PENDING#<sha256(email)> key
 * instead of being dropped, using scripts/lib/email-hash.mjs — the SAME
 * identity hash the founding-credit issuer uses, so one human's federated AND
 * native rows collide the same way there. Three things make plain
 * `PENDING#<hash>` alone unsafe as a whole pk:
 *
 *  1. quantum-qpu-ledger can carry BOTH a USER# and a CRED# row for one sub.
 *     If both are pending for the same person, a bare PENDING#<hash> pk would
 *     let the second PutItem silently overwrite the first. The staged pk
 *     therefore carries the original prefix too: PENDING#<hash>#WALLET,
 *     PENDING#<hash>#USER, PENDING#<hash>#CRED — still begins_with-matchable
 *     on PENDING#<hash> for foldPending, but collision-free.
 *  2. quantum-qpu-tasks rows are already uniquely keyed by their own
 *     idempotencyKey, so staging there is just an attribute update
 *     (userId -> PENDING#<hash>), not a rekey — no collision risk, no delete
 *     needed when folding.
 *  3. RECEIPT# rows are likewise already uniquely keyed by PaymentIntent id;
 *     staging is an attribute update (sub -> PENDING#<hash>) on an unmoved pk.
 *
 * `--fold-pending` (foldPending / runFold below) resolves staged rows once
 * Step 3 creates the native user and its new sub is known, consuming
 * emailHash -> newSub pairs.
 *
 * ============================ migration.json ================================
 * `scripts/migration/migration.json` is committed and carries the table map
 * plus HOW to resolve each side's expected account id — never a literal id
 * (this repo is public). Verified live (2026-08-28, `aws organizations
 * list-accounts --profile org-admin`): the org contains Delta Centric Org,
 * Christian Perez - Personal, QL-Dev, Quantum Learner - HQ, Braket Workloads,
 * and QL-Prod. Altivum (the migration SOURCE) is NOT a member of this
 * organization — it is a separate, unrelated AWS account — so its id cannot
 * be resolved by org name lookup the way QL-Prod's can. The two sides
 * therefore resolve differently:
 *   - source: `aws sts get-caller-identity` against a profile independently
 *     known to BE Altivum (`altivum-mgmt` — see
 *     docs/superpowers/plans/2026-08-28-platform-migration-qlprod.md).
 *   - dest: `aws organizations list-accounts --profile org-admin` filtered to
 *     the account named "QL-Prod".
 * `--expect-source-account` / `--expect-dest-account` on the CLI override the
 * file's resolution entirely (a literal id passed by hand).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { emailHash } from "../lib/email-hash.mjs";

// ---------------------------------------------------------------------------
// Table shape registry
// ---------------------------------------------------------------------------

// Sub-owned pk prefixes on quantum-stripe-wallet / quantum-qpu-ledger.
const SUB_PK_PREFIXES = ["WALLET#", "USER#", "CRED#"];
// Non-sub pk values/prefixes on the same two tables — copied unchanged.
const PASSTHROUGH_PK_EXACT = new Set(["KILL"]);
const PASSTHROUGH_PK_PREFIXES = ["DAY#", "EVENT#"];
const RECEIPT_PREFIX = "RECEIPT#";

const PENDING = "PENDING#";

/** A short, non-PII descriptor of an item's own key, for logs and errors. */
function describeItemKey(item) {
  if (item?.idempotencyKey?.S !== undefined) return `idempotencyKey=${item.idempotencyKey.S}`;
  if (item?.pk?.S !== undefined) return `pk=${item.pk.S}`;
  if (item?.userId?.S !== undefined) return `userId=${item.userId.S}`;
  return "key=unknown";
}

/**
 * Classify one raw DynamoDB item (AttributeValue-map JSON, exactly what
 * `aws dynamodb scan` returns) by its OWN shape — this script takes no
 * tableName parameter, so an item that matches none of the known shapes is a
 * table this script does not recognize, and it refuses rather than guessing.
 *
 * Returns either { type: "passthrough" } or
 * { type: "sub", sub, rewrite(newSub), stage(hash) }.
 */
function classifyItem(item) {
  if (item === null || typeof item !== "object") {
    throw new Error("item is not an object — refusing to guess its shape");
  }

  // --- quantum-qpu-tasks: real key is idempotencyKey; never touched. -------
  if (item.idempotencyKey?.S !== undefined) {
    const sub = item.userId?.S;
    if (typeof sub !== "string" || sub === "") {
      throw new Error(
        `unrecognized quantum-qpu-tasks row (idempotencyKey=${item.idempotencyKey.S}) — has idempotencyKey but no userId`,
      );
    }
    return {
      type: "sub",
      sub,
      rewrite: (newSub) => ({ ...item, userId: { S: newSub } }),
      stage: (hash) => ({ ...item, userId: { S: `${PENDING}${hash}` } }),
    };
  }

  // --- quantum-stripe-wallet / quantum-qpu-ledger: pk-prefixed rows. -------
  if (item.pk?.S !== undefined) {
    const pk = item.pk.S;

    // RECEIPT#: pk is keyed by PaymentIntent id and never moves. The embedded
    // `sub` attribute is what's sub-owned (see the header note above).
    if (pk.startsWith(RECEIPT_PREFIX)) {
      const sub = item.sub?.S;
      if (typeof sub !== "string" || sub === "") {
        throw new Error(`unrecognized RECEIPT row (pk=${pk}) — no embedded sub attribute`);
      }
      return {
        type: "sub",
        sub,
        rewrite: (newSub) => ({ ...item, sub: { S: newSub } }),
        stage: (hash) => ({ ...item, sub: { S: `${PENDING}${hash}` } }),
      };
    }

    if (PASSTHROUGH_PK_EXACT.has(pk) || PASSTHROUGH_PK_PREFIXES.some((p) => pk.startsWith(p))) {
      return { type: "passthrough" };
    }
    const prefix = SUB_PK_PREFIXES.find((p) => pk.startsWith(p));
    if (!prefix) {
      throw new Error(`unrecognized pk prefix "${pk}" — refusing to guess its shape`);
    }
    const sub = pk.slice(prefix.length);
    if (sub === "") {
      throw new Error(`pk "${pk}" has no sub after its prefix`);
    }
    const prefixName = prefix.slice(0, -1); // "WALLET#" -> "WALLET"
    return {
      type: "sub",
      sub,
      rewrite: (newSub) => ({ ...item, pk: { S: `${prefix}${newSub}` } }),
      stage: (hash) => ({ ...item, pk: { S: `${PENDING}${hash}#${prefixName}` } }),
    };
  }

  // --- quantum-workspace-progress: bare userId IS the whole key. -----------
  if (item.userId?.S !== undefined) {
    const sub = item.userId.S;
    if (sub === "") {
      throw new Error("workspace row has an empty userId");
    }
    return {
      type: "sub",
      sub,
      rewrite: (newSub) => ({ ...item, userId: { S: newSub } }),
      stage: (hash) => ({ ...item, userId: { S: `${PENDING}${hash}` } }),
    };
  }

  throw new Error("item has none of pk/userId/idempotencyKey — unrecognized table shape");
}

function resolveSub(sub, subMap, emailBySub) {
  if (Object.prototype.hasOwnProperty.call(subMap, sub)) {
    return { status: "mapped", newSub: subMap[sub] };
  }
  const email = emailBySub?.[sub];
  if (email) {
    return { status: "pending", hash: emailHash(email) };
  }
  return { status: "unmapped" };
}

/**
 * The pure core. Given raw scanned items, a map of OLD sub -> NEW sub, and a
 * map of OLD sub -> email (for the pending fallback), returns:
 *
 *  - writes: rows ready to PutItem into the dest table as-is (remapped or
 *    passthrough)
 *  - pending: rows staged under PENDING#<emailHash>[...] — still meant to be
 *    written (a caller normally writes writes+pending together), just
 *    reported separately because they need a later fold
 *  - unmapped: rows that could not be resolved at all ({ item, sub, reason })
 *    — never written; they need manual investigation
 *  - rows: one { before, after, bucket } descriptor per input item, in scan
 *    order, for operator-log / dry-run printing (bucket is one of
 *    "write" | "pending" | "unmapped" | "passthrough"; after is null for
 *    unmapped)
 *
 * A row whose shape this script does not recognize is COLLECTED, not thrown
 * on the spot — every unrecognized row in the batch is reported together in
 * one refusal, so an operator sees the whole picture instead of playing
 * whack-a-mole with one throw per `--dry-run`.
 */
export function remapItems(items, subMap, emailBySub) {
  const writes = [];
  const pending = [];
  const unmapped = [];
  const rows = [];
  const unrecognized = [];

  for (const item of items) {
    let classified;
    try {
      classified = classifyItem(item);
    } catch (err) {
      unrecognized.push(err.message);
      continue;
    }

    if (classified.type === "passthrough") {
      writes.push(item);
      const key = describeItemKey(item);
      rows.push({ before: key, after: key, bucket: "passthrough" });
      continue;
    }

    const before = describeItemKey(item);
    const resolved = resolveSub(classified.sub, subMap, emailBySub);
    if (resolved.status === "mapped") {
      const written = classified.rewrite(resolved.newSub);
      writes.push(written);
      rows.push({ before, after: describeItemKey(written), bucket: "write" });
    } else if (resolved.status === "pending") {
      const staged = classified.stage(resolved.hash);
      pending.push(staged);
      rows.push({ before, after: describeItemKey(staged), bucket: "pending" });
    } else {
      unmapped.push({
        item,
        sub: classified.sub,
        reason: "sub not in subMap and no known email — cannot map or stage",
      });
      rows.push({ before, after: null, bucket: "unmapped" });
    }
  }

  if (unrecognized.length) {
    throw new Error(
      `remap-subs: refusing — ${unrecognized.length} row(s) with unrecognized shape: ${unrecognized.join("; ")}`,
    );
  }

  return { writes, pending, unmapped, rows };
}

// ---------------------------------------------------------------------------
// foldPending — resolving staged rows once Step 3 mints the new sub
// ---------------------------------------------------------------------------

const PENDING_PK_RE = /^PENDING#([0-9a-f]{64})(?:#([A-Z]+))?$/;

function looksPending(value) {
  return typeof value === "string" && value.startsWith(PENDING);
}

function foldOne(item, emailHashToSub) {
  // tasks-shape: pending marker lives in the userId ATTRIBUTE only; the row's
  // real key (idempotencyKey) never changes, so folding is an update, not a
  // rekey — no delete.
  if (item.idempotencyKey?.S !== undefined) {
    const value = item.userId?.S ?? "";
    if (!looksPending(value)) return { kind: "skip" };
    const m = PENDING_PK_RE.exec(value);
    if (!m) throw new Error(`malformed pending userId "${value}" on idempotencyKey=${item.idempotencyKey.S}`);
    const newSub = emailHashToSub[m[1]];
    if (!newSub) return { kind: "still-pending" };
    return { kind: "write-only", write: { ...item, userId: { S: newSub } } };
  }

  if (item.pk?.S !== undefined) {
    const pk = item.pk.S;

    // RECEIPT#: pk never moves; the pending marker (if any) lives in `sub`.
    if (pk.startsWith(RECEIPT_PREFIX)) {
      const value = item.sub?.S ?? "";
      if (!looksPending(value)) return { kind: "skip" };
      const m = PENDING_PK_RE.exec(value);
      if (!m) throw new Error(`malformed pending sub "${value}" on RECEIPT row pk=${pk}`);
      const newSub = emailHashToSub[m[1]];
      if (!newSub) return { kind: "still-pending" };
      return { kind: "write-only", write: { ...item, sub: { S: newSub } } };
    }

    // pk-prefixed shape (wallet/ledger): PENDING#<hash>#<PREFIX>.
    if (!looksPending(pk)) return { kind: "skip" };
    const m = PENDING_PK_RE.exec(pk);
    if (!m) throw new Error(`malformed pending pk "${pk}"`);
    const [, hash, prefixName] = m;
    if (!prefixName) {
      throw new Error(`pending pk "${pk}" is missing its original prefix`);
    }
    const newSub = emailHashToSub[hash];
    if (!newSub) return { kind: "still-pending" };
    return {
      kind: "rekey",
      write: { ...item, pk: { S: `${prefixName}#${newSub}` } },
      deleteKey: { pk: { S: pk } },
    };
  }

  // bare-userId shape (workspace-progress): PENDING#<hash> IS the whole key.
  if (item.userId?.S !== undefined) {
    const value = item.userId.S;
    if (!looksPending(value)) return { kind: "skip" };
    const m = PENDING_PK_RE.exec(value);
    if (!m) throw new Error(`malformed pending userId "${value}"`);
    const [, hash] = m;
    const newSub = emailHashToSub[hash];
    if (!newSub) return { kind: "still-pending" };
    return {
      kind: "rekey",
      write: { ...item, userId: { S: newSub } },
      deleteKey: { userId: { S: value } },
    };
  }

  return { kind: "skip" };
}

/**
 * Given rows scanned from a dest table (a mix of already-final rows and
 * PENDING#<emailHash>[...] staged rows) and a map of emailHash -> newSub,
 * resolves whichever staged rows now have a known sub.
 *
 * Returns { writes, deletes, stillPending, skipped }.
 *  - writes: the row under its final key/attribute
 *  - deletes: the OLD staged key to remove (empty for the tasks/RECEIPT
 *    shapes, whose real key never moved — folding those is an attribute
 *    update, not a rekey)
 *  - stillPending: rows that ARE staged (PENDING#<hash>[...]) but whose hash
 *    has no resolution yet
 *  - skipped: rows that were never staged at all — an already-final row is
 *    "skipped", never "stillPending"; conflating the two would make the
 *    operator summary report N-many rows as "waiting on a fold" when most of
 *    them need no action
 */
export function foldPending(items, emailHashToSub) {
  const writes = [];
  const deletes = [];
  const stillPending = [];
  const skipped = [];

  for (const item of items) {
    const outcome = foldOne(item, emailHashToSub);
    if (outcome.kind === "skip") {
      skipped.push(item);
    } else if (outcome.kind === "still-pending") {
      stillPending.push(item);
    } else if (outcome.kind === "write-only") {
      writes.push(outcome.write);
    } else {
      writes.push(outcome.write);
      deletes.push(outcome.deleteKey);
    }
  }

  return { writes, deletes, stillPending, skipped };
}

// ---------------------------------------------------------------------------
// Input validation — CRITICAL: a malformed map must never reach a write.
// ---------------------------------------------------------------------------

function validateStringMap(map, { label, checkDuplicateValues = false }) {
  const problems = [];
  if (map === null || typeof map !== "object" || Array.isArray(map)) {
    return [`${label} must be an object`];
  }
  const targets = new Map(); // value -> [keys that claim it]
  for (const [key, value] of Object.entries(map)) {
    if (typeof value !== "string" || value === "") {
      problems.push(`${label}["${key}"] must be a non-empty string, got ${JSON.stringify(value)}`);
      continue;
    }
    if (checkDuplicateValues) {
      const claimants = targets.get(value) ?? [];
      claimants.push(key);
      targets.set(value, claimants);
    }
  }
  if (checkDuplicateValues) {
    for (const [value, keys] of targets) {
      if (keys.length > 1) {
        problems.push(`duplicate target "${value}" claimed by: ${keys.join(", ")}`);
      }
    }
  }
  return problems;
}

/**
 * A null, object, or empty-string value writes a pk like "WALLET#null" or
 * silently overwrites another row that also resolved to "" — this is the
 * exact failure this validator exists to catch before a single write.
 */
export function validateSubMap(subMap) {
  return validateStringMap(subMap, { label: "subMap", checkDuplicateValues: true });
}

export function validateEmailBySub(emailBySub) {
  return validateStringMap(emailBySub, { label: "emailBySub", checkDuplicateValues: false });
}

export function validateEmailHashToSub(emailHashToSub) {
  return validateStringMap(emailHashToSub, { label: "emailHashToSub", checkDuplicateValues: true });
}

// ---------------------------------------------------------------------------
// Account guard — refuse before any read or write
// ---------------------------------------------------------------------------

/**
 * Confirms both injected clients' OWN credentials resolve to the expected
 * accounts before this process is trusted to touch either table. Compared
 * per-client (never a single ambient `aws sts get-caller-identity`) because
 * source and dest are different AWS accounts reached through different
 * profiles — trusting one identity for both would let a misconfigured
 * profile read or write the wrong account silently.
 *
 * Also refuses if the two RESOLVED accounts are identical: this migration is
 * cross-account by construction (Altivum -> QL-Prod), so source and dest
 * resolving to the same account can only mean the wrong profile was used —
 * most dangerously, silently reading from and writing to the same table.
 */
export async function assertAccounts({ sourceClient, destClient, expectSourceAccount, expectDestAccount }) {
  const [sourceAccount, destAccount] = await Promise.all([
    sourceClient.getCallerIdentity(),
    destClient.getCallerIdentity(),
  ]);
  const problems = [];
  if (sourceAccount !== expectSourceAccount) {
    problems.push(`source account is ${sourceAccount}, expected ${expectSourceAccount}`);
  }
  if (destAccount !== expectDestAccount) {
    problems.push(`dest account is ${destAccount}, expected ${expectDestAccount}`);
  }
  if (sourceAccount === destAccount) {
    problems.push(`source and dest resolved to the SAME account (${sourceAccount}) — this migration is cross-account`);
  }
  if (problems.length) {
    throw new Error(`REFUSING: ${problems.join("; ")}`);
  }
  return { sourceAccount, destAccount };
}

// ---------------------------------------------------------------------------
// Sequential writer — reports exactly how far a partial failure got.
// ---------------------------------------------------------------------------

/**
 * Writes items one at a time (DynamoDB has no cross-item transaction that
 * would help here, and single-item put/delete is what lets each write be
 * addressed by a temp-file `--item`/`--key` payload — see makeAwsClient). A
 * mid-run failure throws with exactly how many succeeded and which item it
 * was on, phrased as ABORTED MID-RUN (never REFUSING — that word is reserved
 * for a guard that stopped BEFORE any write). Every write here is a
 * PutItem/DeleteItem keyed by the row's own key, so re-running from scratch
 * after a partial failure is always safe (upsert by key).
 */
async function writeSequential({ table, items, action, verb }) {
  let done = 0;
  for (const item of items) {
    try {
      await action(table, item);
      done += 1;
    } catch (err) {
      throw new Error(
        `ABORTED MID-RUN — ${verb} ${done} of ${items.length} items to ${table}; re-run is safe ` +
          `(upsert by key). Failed at ${describeItemKey(item)}: ${err.message}`,
      );
    }
  }
  return done;
}

// ---------------------------------------------------------------------------
// Orchestration — DI'd so it tests offline with fake clients
// ---------------------------------------------------------------------------

/**
 * Scans each source table, remaps through subMap/emailBySub, and (only under
 * execute: true) writes the result into the matching dest table.
 *
 * Order of guards, all BEFORE any read or write:
 *  1. subMap/emailBySub shape validation (CRITICAL 1)
 *  2. the account guard (assertAccounts)
 * Then Phase 1 scans + classifies EVERY table before Phase 2 writes anything,
 * so an unmapped row on table 3 still blocks table 1's writes — and under
 * `--execute`, ANY unmapped row refuses the whole run unless allowUnmapped is
 * true (CRITICAL 2): a clean exit that silently drops a row (e.g. the
 * founder's grandfathered capMicros row) is exactly the failure this script
 * exists to prevent.
 */
export async function runMigration({
  sourceClient,
  destClient,
  expectSourceAccount,
  expectDestAccount,
  tables,
  subMap,
  emailBySub,
  execute = false,
  allowUnmapped = false,
}) {
  const subMapProblems = validateSubMap(subMap);
  if (subMapProblems.length) {
    throw new Error(`REFUSING: invalid subMap: ${subMapProblems.join("; ")}`);
  }
  const emailProblems = validateEmailBySub(emailBySub);
  if (emailProblems.length) {
    throw new Error(`REFUSING: invalid emailBySub: ${emailProblems.join("; ")}`);
  }

  await assertAccounts({ sourceClient, destClient, expectSourceAccount, expectDestAccount });

  // Phase 1: read-only. Scan + classify every table before writing anything.
  const perTable = [];
  for (const { source, dest } of tables) {
    const items = await sourceClient.scan(source);
    const remapped = remapItems(items, subMap, emailBySub);
    perTable.push({ source, dest, ...remapped });
  }

  const allUnmapped = perTable.flatMap((t) => t.unmapped.map((u) => ({ ...u, table: t.source })));
  if (execute && allUnmapped.length > 0 && !allowUnmapped) {
    const list = allUnmapped.map((u) => `${u.table} ${describeItemKey(u.item)}`).join(", ");
    throw new Error(
      `REFUSING: ${allUnmapped.length} unmapped row(s) and --execute was given without --allow-unmapped: ${list}`,
    );
  }

  // Phase 2: write, only under execute.
  const results = [];
  for (const t of perTable) {
    const toWrite = [...t.writes, ...t.pending];
    if (execute && toWrite.length) {
      await writeSequential({
        table: t.dest,
        items: toWrite,
        action: (table, item) => destClient.putItem(table, item),
        verb: "wrote",
      });
    }
    results.push({
      table: t.source,
      destTable: t.dest,
      writes: t.writes.length,
      pending: t.pending.length,
      unmapped: t.unmapped,
      toWrite: toWrite.length,
      rows: t.rows,
    });
  }
  return results;
}

/**
 * Fold-pending mode: scans each dest table for PENDING#<emailHash>[...] rows
 * (or embedded-`sub` PENDING markers, for RECEIPT#/tasks rows) and resolves
 * whichever now have a known sub. Reuses assertAccounts (not an inline copy)
 * — fold never reads the source table, but the same cross-account identity
 * guard still runs before the first scan, for the same "refuse before any
 * read or write" reason, and to catch the same misconfigured-profile risk.
 */
export async function runFold({
  sourceClient,
  destClient,
  expectSourceAccount,
  expectDestAccount,
  tables,
  emailHashToSub,
  execute = false,
}) {
  const problems = validateEmailHashToSub(emailHashToSub);
  if (problems.length) {
    throw new Error(`REFUSING: invalid emailHashToSub: ${problems.join("; ")}`);
  }

  await assertAccounts({ sourceClient, destClient, expectSourceAccount, expectDestAccount });

  const results = [];
  for (const table of tables) {
    const items = await destClient.scan(table);
    const { writes, deletes, stillPending, skipped } = foldPending(items, emailHashToSub);
    if (execute) {
      if (writes.length) {
        await writeSequential({
          table,
          items: writes,
          action: (t, i) => destClient.putItem(t, i),
          verb: "wrote",
        });
      }
      if (deletes.length) {
        await writeSequential({
          table,
          items: deletes,
          action: (t, k) => destClient.deleteItem(t, k),
          verb: "deleted",
        });
      }
    }
    results.push({ table, folded: writes.length, stillPending: stillPending.length, skipped: skipped.length });
  }
  return results;
}

// ---------------------------------------------------------------------------
// --verify — side-by-side comparison for Step 5's verification
// ---------------------------------------------------------------------------

const VERIFY_ATTRS = ["capMicros", "spentMicros", "balance", "credits"];

/**
 * For each sub-owned source row that maps to a known new sub, compares the
 * named balance-ish attributes against the matching dest row (found by the
 * mapped pk on pk-prefixed shapes; other shapes are skipped — this is a
 * pk-keyed comparison by design, matching how quantum-stripe-wallet and
 * quantum-qpu-ledger carry every number this script exists to protect,
 * including the grandfathered capMicros row). Subs are always redacted to an
 * 8-char prefix — this is a printed report, never a write path.
 */
export function buildVerifyRows(sourceItems, destItems, subMap, attrs = VERIFY_ATTRS) {
  const destByPk = new Map();
  for (const d of destItems) {
    if (d.pk?.S !== undefined) destByPk.set(d.pk.S, d);
  }

  const rows = [];
  for (const item of sourceItems) {
    let classified;
    try {
      classified = classifyItem(item);
    } catch {
      continue; // not a sub-owned row this comparison applies to
    }
    if (classified.type !== "sub") continue;
    const newSub = subMap[classified.sub];
    const destItem = newSub ? destByPk.get(classified.rewrite(newSub).pk?.S) : undefined;
    const redactedSub = `${classified.sub.slice(0, 8)}…`;

    for (const attr of attrs) {
      const sourceAV = item[attr];
      const destAV = destItem?.[attr];
      if (sourceAV === undefined && destAV === undefined) continue;
      const value = (av) => (av === undefined ? undefined : av.N ?? av.S ?? av.BOOL ?? null);
      rows.push({
        sub: redactedSub,
        attribute: attr,
        sourceValue: value(sourceAV) ?? null,
        destValue: destItem ? value(destAV) ?? null : undefined,
        match: destItem ? JSON.stringify(sourceAV) === JSON.stringify(destAV) : false,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CLI arg parsing — pure, offline
// ---------------------------------------------------------------------------

export function parseTableMap(pairs) {
  return (pairs ?? []).map((pair) => {
    const i = pair.indexOf("=");
    if (i < 1 || i === pair.length - 1) {
      throw new Error(`--table-map expects old=new, got "${pair}"`);
    }
    return { source: pair.slice(0, i), dest: pair.slice(i + 1) };
  });
}

const FLAGS_WITH_VALUE = new Set([
  "--source-profile",
  "--dest-profile",
  "--region",
  "--org-profile",
  "--expect-source-account",
  "--expect-dest-account",
  "--table-map",
  "--sub-map",
  "--email-by-sub",
  "--fold-map",
  "--pk",
]);

export function parseArgs(argv) {
  const args = {
    region: "us-east-2",
    orgProfile: "org-admin",
    tableMapRaw: [],
    pks: [],
    execute: false,
    foldPending: false,
    allowUnmapped: false,
    verify: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--execute") {
      args.execute = true;
      continue;
    }
    if (flag === "--dry-run") {
      args.execute = false;
      continue;
    }
    if (flag === "--fold-pending") {
      args.foldPending = true;
      continue;
    }
    if (flag === "--allow-unmapped") {
      args.allowUnmapped = true;
      continue;
    }
    if (flag === "--verify") {
      args.verify = true;
      continue;
    }
    if (!FLAGS_WITH_VALUE.has(flag)) {
      throw new Error(`unrecognized argument: ${flag}`);
    }
    const value = argv[++i];
    switch (flag) {
      case "--source-profile":
        args.sourceProfile = value;
        break;
      case "--dest-profile":
        args.destProfile = value;
        break;
      case "--region":
        args.region = value;
        break;
      case "--org-profile":
        args.orgProfile = value;
        break;
      case "--expect-source-account":
        args.expectSourceAccount = value;
        break;
      case "--expect-dest-account":
        args.expectDestAccount = value;
        break;
      case "--table-map":
        args.tableMapRaw.push(value);
        break;
      case "--sub-map":
        args.subMapPath = value;
        break;
      case "--email-by-sub":
        args.emailBySubPath = value;
        break;
      case "--fold-map":
        args.foldMapPath = value;
        break;
      case "--pk":
        args.pks.push(value);
        break;
    }
  }
  args.tableMap = parseTableMap(args.tableMapRaw);
  return args;
}

// ---------------------------------------------------------------------------
// migration.json — committed defaults, flags override
// ---------------------------------------------------------------------------

/**
 * Decides the effective table map and account-resolution instructions from
 * CLI flags layered over the committed migration.json. A flag always wins
 * over the file for the piece of config it supplies; every other piece falls
 * back to the file. Pure — takes the already-parsed args and file config, so
 * it tests offline with no real migration.json or AWS calls.
 */
export function resolveEffectiveConfig(args, fileConfig) {
  const tableMap = args.tableMap?.length
    ? args.tableMap
    : (fileConfig?.tableMap ?? []).map((t) => ({ source: t.source, dest: t.dest }));
  if (!tableMap.length) {
    throw new Error("REFUSING: no --table-map given and migration.json has no tableMap");
  }

  const sourceAccountResolution = args.expectSourceAccount ? null : fileConfig?.sourceAccountResolution ?? null;
  if (!args.expectSourceAccount && !sourceAccountResolution) {
    throw new Error("REFUSING: no --expect-source-account and no sourceAccountResolution in migration.json");
  }
  const destAccountResolution = args.expectDestAccount ? null : fileConfig?.destAccountResolution ?? null;
  if (!args.expectDestAccount && !destAccountResolution) {
    throw new Error("REFUSING: no --expect-dest-account and no destAccountResolution in migration.json");
  }

  return { tableMap, sourceAccountResolution, destAccountResolution };
}

// ---------------------------------------------------------------------------
// Real clients — shell out to the `aws` CLI, one client per profile.
// Only exercised when this file is run directly; never touched by the tests.
// ---------------------------------------------------------------------------

function tempJsonFile(obj) {
  const dir = mkdtempSync(join(tmpdir(), "remap-subs-"));
  const file = join(dir, "item.json");
  writeFileSync(file, JSON.stringify(obj));
  return { file, dir };
}

function withTempJsonFile(obj, use) {
  const { file, dir } = tempJsonFile(obj);
  try {
    return use(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeAwsClient(profile, region) {
  const aws = (cliArgs) =>
    execFileSync("aws", ["--profile", profile, "--region", region, ...cliArgs], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });

  return {
    async getCallerIdentity() {
      return JSON.parse(aws(["sts", "get-caller-identity", "--output", "json"])).Account;
    },
    async scan(table) {
      const items = [];
      let ExclusiveStartKey;
      do {
        const cliArgs = [
          "dynamodb", "scan",
          "--table-name", table,
          "--consistent-read",
          "--output", "json",
        ];
        if (ExclusiveStartKey) {
          cliArgs.push("--exclusive-start-key", JSON.stringify(ExclusiveStartKey));
        }
        const res = JSON.parse(aws(cliArgs));
        items.push(...(res.Items ?? []));
        ExclusiveStartKey = res.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      return items;
    },
    // A quantum-workspace-progress row can carry up to 256KB of learner
    // progress — well past the shell's per-argument limits — so the item is
    // written to a temp file and passed as `--item file://...`, never inline.
    async putItem(table, item) {
      return withTempJsonFile(item, (file) =>
        aws(["dynamodb", "put-item", "--table-name", table, "--item", `file://${file}`]),
      );
    },
    async deleteItem(table, key) {
      return withTempJsonFile(key, (file) =>
        aws(["dynamodb", "delete-item", "--table-name", table, "--key", `file://${file}`]),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// migration.json account resolution — shells to `aws`, not unit-tested
// (mirrors founding-credit's run.mjs: only the pure decision above is).
// ---------------------------------------------------------------------------

function resolveAccountId(resolution) {
  if (resolution.method === "sts-get-caller-identity") {
    const out = execFileSync(
      "aws",
      ["sts", "get-caller-identity", "--profile", resolution.profile, "--query", "Account", "--output", "text"],
      { encoding: "utf8" },
    ).trim();
    if (!out) throw new Error(`REFUSING: could not resolve account via profile "${resolution.profile}"`);
    return out;
  }
  if (resolution.method === "organizations-list-accounts") {
    const out = execFileSync(
      "aws",
      [
        "organizations", "list-accounts",
        "--profile", resolution.orgProfile,
        "--query", `Accounts[?Name=='${resolution.accountName}'].Id`,
        "--output", "text",
      ],
      { encoding: "utf8" },
    ).trim();
    if (!out) {
      throw new Error(
        `REFUSING: no organizations account named "${resolution.accountName}" (profile ${resolution.orgProfile})`,
      );
    }
    return out;
  }
  throw new Error(`REFUSING: unsupported account resolution method "${resolution.method}"`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function loadJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`REFUSING: could not read/parse ${label} at "${path}": ${err.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ["sourceProfile", "destProfile"]) {
    if (!args[required]) {
      const flag = required === "sourceProfile" ? "--source-profile" : "--dest-profile";
      console.error(`REFUSING: missing required ${flag}`);
      process.exit(1);
    }
  }

  const migrationJsonPath = fileURLToPath(new URL("./migration.json", import.meta.url));
  const fileConfig = loadJson(migrationJsonPath, "migration.json");
  const effective = resolveEffectiveConfig(args, fileConfig);

  const sourceClient = makeAwsClient(args.sourceProfile, args.region);
  const destClient = makeAwsClient(args.destProfile, args.region);

  const expectSourceAccount = args.expectSourceAccount ?? resolveAccountId(effective.sourceAccountResolution);
  const expectDestAccount = args.expectDestAccount ?? resolveAccountId(effective.destAccountResolution);
  const tableMap = effective.tableMap;

  console.log(
    `\n${args.execute ? "*** EXECUTING — this writes to the dest account ***" : "DRY RUN — nothing will be written"}\n`,
  );

  if (args.verify) {
    if (!args.subMapPath) {
      console.error("REFUSING: --verify requires --sub-map <file of oldSub -> newSub>");
      process.exit(1);
    }
    await assertAccounts({ sourceClient, destClient, expectSourceAccount, expectDestAccount });
    const subMap = loadJson(args.subMapPath, "sub-map");
    for (const { source, dest } of tableMap) {
      const sourceItems = await sourceClient.scan(source);
      const destItems = await destClient.scan(dest);
      const filtered = args.pks.length
        ? sourceItems.filter((i) => args.pks.includes(describeItemKey(i)))
        : sourceItems;
      const rows = buildVerifyRows(filtered, destItems, subMap);
      for (const r of rows) {
        console.log(
          `${source} sub=${r.sub} ${r.attribute}: source=${r.sourceValue} dest=${r.destValue ?? "(no dest row)"} ` +
            `${r.match ? "OK" : "MISMATCH"}`,
        );
      }
    }
    return;
  }

  if (args.foldPending) {
    if (!args.foldMapPath) {
      console.error("REFUSING: --fold-pending requires --fold-map <file of emailHash -> newSub>");
      process.exit(1);
    }
    const emailHashToSub = loadJson(args.foldMapPath, "fold-map");
    const results = await runFold({
      sourceClient,
      destClient,
      expectSourceAccount,
      expectDestAccount,
      tables: tableMap.map((t) => t.dest),
      emailHashToSub,
      execute: args.execute,
    });
    for (const r of results) {
      console.log(`${r.table}: folded ${r.folded} · still pending ${r.stillPending} · skipped (already final) ${r.skipped}`);
    }
    return;
  }

  if (!args.subMapPath) {
    console.error("REFUSING: remap mode requires --sub-map <file of oldSub -> newSub>");
    process.exit(1);
  }
  const subMap = loadJson(args.subMapPath, "sub-map");
  const emailBySub = args.emailBySubPath ? loadJson(args.emailBySubPath, "email-by-sub") : {};

  const results = await runMigration({
    sourceClient,
    destClient,
    expectSourceAccount,
    expectDestAccount,
    tables: tableMap,
    subMap,
    emailBySub,
    execute: args.execute,
    allowUnmapped: args.allowUnmapped,
  });

  for (const r of results) {
    console.log(
      `${r.table} -> ${r.destTable}: ${args.execute ? "wrote" : "would write"} ${r.toWrite} · ` +
        `pending ${r.pending} · unmapped ${r.unmapped.length}`,
    );
    if (!args.execute) {
      for (const row of r.rows) {
        console.log(`    [${row.bucket}] ${row.before} -> ${row.after ?? "(unmapped — not written)"}`);
      }
    }
    for (const u of r.unmapped) {
      console.log(`    UNMAPPED sub=${u.sub.slice(0, 8)}… ${describeItemKey(u.item)} — ${u.reason}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // Guard refusals already say "REFUSING:"; a mid-run write failure already
    // says "ABORTED MID-RUN". Print the message as-is rather than
    // re-prefixing it — a second "REFUSING:" on an ABORTED message would
    // misreport a partial write as a clean pre-write refusal.
    console.error(`\n${err.message}\n`);
    process.exit(1);
  });
}
