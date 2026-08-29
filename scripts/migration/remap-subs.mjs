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
 * ============================ TABLE SHAPES (verified live) ================
 * Confirmed against the deployed CloudFormation (each lambda's template.yaml) and
 * the handlers that write these rows — not guessed from the brief alone:
 *
 *  - quantum-stripe-wallet / quantum-qpu-ledger: single attribute `pk` (S) is
 *    the whole key. Sub-owned prefixes: WALLET#<sub>, USER#<sub>, CRED#<sub>.
 *    Passthrough (not sub-derived, copy unchanged): DAY#<date>, KILL,
 *    EVENT#<stripeEventId>, RECEIPT#<paymentIntentId> — the last one is not
 *    named in the migration brief but IS a live prefix (lambda/stripe/index.mjs
 *    receiptKey); refusing to guess it would otherwise abort a real migration.
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
 * native rows collide the same way there. Two things make plain
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
 *
 * `--fold-pending` (foldPending / runFold below) resolves staged rows once
 * Step 3 creates the native user and its new sub is known, consuming
 * emailHash -> newSub pairs.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { emailHash } from "../lib/email-hash.mjs";

// ---------------------------------------------------------------------------
// Table shape registry
// ---------------------------------------------------------------------------

// Sub-owned pk prefixes on quantum-stripe-wallet / quantum-qpu-ledger.
const SUB_PK_PREFIXES = ["WALLET#", "USER#", "CRED#"];
// Non-sub pk values/prefixes on the same two tables — copied unchanged.
const PASSTHROUGH_PK_EXACT = new Set(["KILL"]);
const PASSTHROUGH_PK_PREFIXES = ["DAY#", "EVENT#", "RECEIPT#"];

const PENDING = "PENDING#";

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
    throw new Error("remap-subs: item is not an object — refusing to guess its shape");
  }

  // --- quantum-qpu-tasks: real key is idempotencyKey; never touched. -------
  if (item.idempotencyKey?.S !== undefined) {
    const sub = item.userId?.S;
    if (typeof sub !== "string" || sub === "") {
      throw new Error(
        "remap-subs: unrecognized quantum-qpu-tasks row — has idempotencyKey but no userId",
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
    if (PASSTHROUGH_PK_EXACT.has(pk) || PASSTHROUGH_PK_PREFIXES.some((p) => pk.startsWith(p))) {
      return { type: "passthrough" };
    }
    const prefix = SUB_PK_PREFIXES.find((p) => pk.startsWith(p));
    if (!prefix) {
      throw new Error(`remap-subs: unrecognized pk prefix "${pk}" — refusing to guess its shape`);
    }
    const sub = pk.slice(prefix.length);
    if (sub === "") {
      throw new Error(`remap-subs: pk "${pk}" has no sub after its prefix`);
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
      throw new Error("remap-subs: workspace row has an empty userId");
    }
    return {
      type: "sub",
      sub,
      rewrite: (newSub) => ({ ...item, userId: { S: newSub } }),
      stage: (hash) => ({ ...item, userId: { S: `${PENDING}${hash}` } }),
    };
  }

  throw new Error(
    "remap-subs: item has none of pk/userId/idempotencyKey — unrecognized table shape",
  );
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
 * map of OLD sub -> email (for the pending fallback), returns three buckets:
 *
 *  - writes: rows ready to PutItem into the dest table as-is (remapped or
 *    passthrough)
 *  - pending: rows staged under PENDING#<emailHash>[...] — still meant to be
 *    written (a caller normally writes writes+pending together), just
 *    reported separately because they need a later fold
 *  - unmapped: rows that could not be resolved at all ({ item, sub, reason })
 *    — never written; they need manual investigation
 */
export function remapItems(items, subMap, emailBySub) {
  const writes = [];
  const pending = [];
  const unmapped = [];

  for (const item of items) {
    const classified = classifyItem(item);
    if (classified.type === "passthrough") {
      writes.push(item);
      continue;
    }
    const resolved = resolveSub(classified.sub, subMap, emailBySub);
    if (resolved.status === "mapped") {
      writes.push(classified.rewrite(resolved.newSub));
    } else if (resolved.status === "pending") {
      pending.push(classified.stage(resolved.hash));
    } else {
      unmapped.push({
        item,
        sub: classified.sub,
        reason: "sub not in subMap and no known email — cannot map or stage",
      });
    }
  }

  return { writes, pending, unmapped };
}

// ---------------------------------------------------------------------------
// foldPending — resolving staged rows once Step 3 mints the new sub
// ---------------------------------------------------------------------------

const PENDING_PK_RE = /^PENDING#([0-9a-f]{64})(?:#([A-Z]+))?$/;

function foldOne(item, emailHashToSub) {
  // tasks-shape: pending marker lives in the userId ATTRIBUTE only; the row's
  // real key (idempotencyKey) never changes, so folding is an update, not a
  // rekey — no delete.
  if (item.idempotencyKey?.S !== undefined) {
    const m = PENDING_PK_RE.exec(item.userId?.S ?? "");
    if (!m) return { kind: "keep" };
    const newSub = emailHashToSub[m[1]];
    if (!newSub) return { kind: "keep" };
    return { kind: "write-only", write: { ...item, userId: { S: newSub } } };
  }

  // pk-prefixed shape (wallet/ledger): PENDING#<hash>#<PREFIX>.
  if (item.pk?.S !== undefined) {
    const m = PENDING_PK_RE.exec(item.pk.S);
    if (!m) return { kind: "keep" };
    const [, hash, prefixName] = m;
    const newSub = emailHashToSub[hash];
    if (!newSub) return { kind: "keep" };
    if (!prefixName) {
      throw new Error(`remap-subs: pending pk "${item.pk.S}" is missing its original prefix`);
    }
    const newPk = `${prefixName}#${newSub}`;
    return {
      kind: "rekey",
      write: { ...item, pk: { S: newPk } },
      deleteKey: { pk: { S: item.pk.S } },
    };
  }

  // bare-userId shape (workspace-progress): PENDING#<hash> IS the whole key.
  if (item.userId?.S !== undefined) {
    const m = PENDING_PK_RE.exec(item.userId.S);
    if (!m) return { kind: "keep" };
    const [, hash] = m;
    const newSub = emailHashToSub[hash];
    if (!newSub) return { kind: "keep" };
    return {
      kind: "rekey",
      write: { ...item, userId: { S: newSub } },
      deleteKey: { userId: { S: item.userId.S } },
    };
  }

  return { kind: "keep" };
}

/**
 * Given rows scanned from a dest table (a mix of already-final rows and
 * PENDING#<emailHash>[...] staged rows) and a map of emailHash -> newSub,
 * resolves whichever staged rows now have a known sub.
 *
 * Returns { writes, deletes, stillPending }. `writes` carries the row under
 * its final key; `deletes` carries the OLD staged key to remove (empty for
 * the tasks shape, whose real key never moved). Rows not shaped as pending,
 * or pending but not yet resolvable, land in `stillPending` untouched.
 */
export function foldPending(items, emailHashToSub) {
  const writes = [];
  const deletes = [];
  const stillPending = [];

  for (const item of items) {
    const outcome = foldOne(item, emailHashToSub);
    if (outcome.kind === "keep") {
      stillPending.push(item);
    } else if (outcome.kind === "write-only") {
      writes.push(outcome.write);
    } else {
      writes.push(outcome.write);
      deletes.push(outcome.deleteKey);
    }
  }

  return { writes, deletes, stillPending };
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
  if (problems.length) {
    throw new Error(`REFUSING: ${problems.join("; ")}`);
  }
  return { sourceAccount, destAccount };
}

// ---------------------------------------------------------------------------
// Orchestration — DI'd so it tests offline with fake clients
// ---------------------------------------------------------------------------

/**
 * Scans each source table, remaps through subMap/emailBySub, and (only under
 * execute: true) writes the result into the matching dest table. The account
 * guard runs BEFORE the first scan — a mismatch means zero reads and zero
 * writes happen anywhere.
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
}) {
  await assertAccounts({ sourceClient, destClient, expectSourceAccount, expectDestAccount });

  const results = [];
  for (const { source, dest } of tables) {
    const items = await sourceClient.scan(source);
    const { writes, pending, unmapped } = remapItems(items, subMap, emailBySub);
    const toWrite = [...writes, ...pending];
    if (execute && toWrite.length) {
      await destClient.putItems(dest, toWrite);
    }
    results.push({ table: source, destTable: dest, writes: writes.length, pending: pending.length, unmapped });
  }
  return results;
}

/**
 * Fold-pending mode: scans each dest table for PENDING#<emailHash>[...] rows
 * and resolves whichever now have a known sub. Only the dest account is
 * meaningful here (fold never touches the source), but the guard still runs
 * before the first scan for the same "refuse before any read or write" reason.
 */
export async function runFold({ destClient, expectDestAccount, tables, emailHashToSub, execute = false }) {
  const destAccount = await destClient.getCallerIdentity();
  if (destAccount !== expectDestAccount) {
    throw new Error(`REFUSING: dest account is ${destAccount}, expected ${expectDestAccount}`);
  }

  const results = [];
  for (const table of tables) {
    const items = await destClient.scan(table);
    const { writes, deletes, stillPending } = foldPending(items, emailHashToSub);
    if (execute) {
      if (writes.length) await destClient.putItems(table, writes);
      if (deletes.length) await destClient.deleteItems(table, deletes);
    }
    results.push({ table, folded: writes.length, stillPending: stillPending.length });
  }
  return results;
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
  "--expect-source-account",
  "--expect-dest-account",
  "--table-map",
  "--sub-map",
  "--email-by-sub",
  "--fold-map",
]);

export function parseArgs(argv) {
  const args = {
    region: "us-east-2",
    tableMapRaw: [],
    execute: false,
    foldPending: false,
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
    }
  }
  args.tableMap = parseTableMap(args.tableMapRaw);
  return args;
}

// ---------------------------------------------------------------------------
// Real clients — shell out to the `aws` CLI, one client per profile.
// Only exercised when this file is run directly; never touched by the tests.
// ---------------------------------------------------------------------------

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
        const cliArgs = ["dynamodb", "scan", "--table-name", table, "--output", "json"];
        if (ExclusiveStartKey) {
          cliArgs.push("--exclusive-start-key", JSON.stringify(ExclusiveStartKey));
        }
        const res = JSON.parse(aws(cliArgs));
        items.push(...(res.Items ?? []));
        ExclusiveStartKey = res.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      return items;
    },
    async putItems(table, items) {
      for (const item of items) {
        aws(["dynamodb", "put-item", "--table-name", table, "--item", JSON.stringify(item)]);
      }
    },
    async deleteItems(table, keys) {
      for (const key of keys) {
        aws(["dynamodb", "delete-item", "--table-name", table, "--key", JSON.stringify(key)]);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ["sourceProfile", "destProfile", "expectSourceAccount", "expectDestAccount"]) {
    if (!args[required]) {
      console.error(`REFUSING: missing required --${required.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
      process.exit(1);
    }
  }

  const sourceClient = makeAwsClient(args.sourceProfile, args.region);
  const destClient = makeAwsClient(args.destProfile, args.region);

  console.log(
    `\n${args.execute ? "*** EXECUTING — this writes to the dest account ***" : "DRY RUN — nothing will be written"}\n`,
  );

  if (args.foldPending) {
    if (!args.foldMapPath) {
      console.error("REFUSING: --fold-pending requires --fold-map <file of emailHash -> newSub>");
      process.exit(1);
    }
    const emailHashToSub = JSON.parse(readFileSync(args.foldMapPath, "utf8"));
    const results = await runFold({
      destClient,
      expectDestAccount: args.expectDestAccount,
      tables: args.tableMap.map((t) => t.dest),
      emailHashToSub,
      execute: args.execute,
    });
    for (const r of results) {
      console.log(`${r.table}: folded ${r.folded} · still pending ${r.stillPending}`);
    }
    return;
  }

  if (!args.subMapPath) {
    console.error("REFUSING: remap mode requires --sub-map <file of oldSub -> newSub>");
    process.exit(1);
  }
  const subMap = JSON.parse(readFileSync(args.subMapPath, "utf8"));
  const emailBySub = args.emailBySubPath ? JSON.parse(readFileSync(args.emailBySubPath, "utf8")) : {};

  const results = await runMigration({
    sourceClient,
    destClient,
    expectSourceAccount: args.expectSourceAccount,
    expectDestAccount: args.expectDestAccount,
    tables: args.tableMap,
    subMap,
    emailBySub,
    execute: args.execute,
  });

  for (const r of results) {
    console.log(
      `${r.table} -> ${r.destTable}: ${args.execute ? "wrote" : "would write"} ${r.writes} · ` +
        `pending ${r.pending} · unmapped ${r.unmapped.length}`,
    );
    for (const u of r.unmapped) {
      // Redact: report which sub was unresolved, never the row's other
      // learner-identifying content.
      console.log(`    UNMAPPED sub=${u.sub.slice(0, 8)}… — ${u.reason}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`\nREFUSING: ${err.message}\n`);
    process.exit(1);
  });
}
