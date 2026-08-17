import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * THE expiresAt LANDMINE.
 *
 * The wallet table (quantum-stripe-wallet) has DynamoDB TTL ENABLED on the
 * attribute named `expiresAt` (verified 2026-08-17: describe-time-to-live
 * returns ENABLED/expiresAt). TTL is table-wide and attribute-name-keyed:
 * ANY row on that table that ever carries `expiresAt` will be DELETED WHOLE
 * at that timestamp — balance, tier, subscriptionStatus, clawbackOwedCredits —
 * silently, by DynamoDB itself, with no application code involved and nothing
 * to alarm on. Purchased credits must never expire (rule 10), so writing
 * `expiresAt` onto a WALLET# row is not a bug, it is a scheduled theft of a
 * learner's paid balance.
 *
 * Today exactly two writes of `expiresAt` exist, and both are safe BY THE ROW
 * THEY TARGET, not by the file they live in:
 *
 *  1. lambda/stripe/index.mjs — the EVENT# idempotency marker Put (the row is
 *     `...eventKey(eventId)`). Expiring is that row's entire purpose: it only
 *     needs to outlive Stripe's retry window. It shares a table with WALLET#
 *     rows, which is exactly why the attribute name is so dangerous elsewhere.
 *  2. lambda/qpu/qpu-core.mjs — the day-cap leg (`SET expiresAt = :ttl` on the
 *     `DAY#${day}` row of the QPU's OWN ledger table, `TableName: ledgerTable`).
 *     A day counter that self-cleans after the day is the intended use.
 *
 * The known trap this test exists for: that QPU day-cap leg sits in the SAME
 * TransactItems array as the wallet debit leg. A copy-paste that changes ONLY
 * the table name (ledgerTable → walletTable), or only the key (DAY# → WALLET#),
 * silently arms the TTL on a learner's wallet. So this test does not merely
 * count occurrences — for each one it walks backwards to the nearest row key
 * and the nearest TableName and refuses anything that is not provably the
 * EVENT# marker or the DAY# row on the ledger table.
 *
 * If this test fails on your change: do NOT rename your attribute to dodge the
 * scan unless it genuinely must expire and can never land on a wallet row —
 * and never, under any name the TTL spec points at, on a WALLET# row. Adding
 * an occurrence means a human reads the table's TTL spec and extends
 * EXPECTED_WRITES in the same commit, with the reason written down.
 */

const REPO = join(__dirname, "..", "..", "..");
const LAMBDA_DIRS = ["lambda/stripe", "lambda/tutor", "lambda/qpu"];
const SKIP = /node_modules|\.aws-sam/;

/**
 * Every legitimate `expiresAt` occurrence in non-test Lambda source, pinned by
 * file and count. Any new occurrence — even one that would pass the shape
 * checks below — fails until a human accounts for it here.
 */
const EXPECTED_WRITES = new Map<string, { count: number; why: string }>([
  [
    "lambda/stripe/index.mjs",
    {
      count: 1,
      why: "the EVENT# idempotency Put — expiring is that row's whole purpose",
    },
  ],
  [
    "lambda/qpu/qpu-core.mjs",
    {
      count: 1,
      why: "the DAY# day-cap leg on the QPU's own ledger table (TableName: ledgerTable)",
    },
  ],
]);

/** Row-identity markers, nearest-wins when scanning backwards from a write. */
const ROW_MARKER = /eventKey\(|walletKey\(|EVENT#|WALLET#|DAY#|USER#|TASK#/g;
const TABLE_NAME = /TableName:\s*([A-Za-z_$][\w$]*)/g;

function collectSources(): Array<{ rel: string; src: string }> {
  const out: Array<{ rel: string; src: string }> = [];
  for (const dir of LAMBDA_DIRS) {
    let entries: string[];
    try {
      entries = readdirSync(join(REPO, dir));
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(REPO, dir, name);
      if (SKIP.test(full) || !/\.(mjs|js)$/.test(name) || /\.test\./.test(name)) continue;
      if (!statSync(full).isFile()) continue;
      out.push({ rel: `${dir}/${name}`, src: readFileSync(full, "utf8") });
    }
  }
  return out;
}

function lastMatch(re: RegExp, text: string): string | null {
  let m: RegExpExecArray | null;
  let last: string | null = null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) last = m[1] ?? m[0];
  return last;
}

describe("expiresAt never reaches a row DynamoDB TTL could vaporize", () => {
  const sources = collectSources();

  it("scans the billing, tutor and QPU sources (the walker must not no-op)", () => {
    expect(sources.map((s) => s.rel)).toEqual(
      expect.arrayContaining(["lambda/stripe/index.mjs", "lambda/qpu/qpu-core.mjs", "lambda/tutor/index.mjs"]),
    );
  });

  it("every expiresAt occurrence is pinned to its allowlisted file and count", () => {
    const counts = new Map<string, number>();
    for (const { rel, src } of sources) {
      const n = (src.match(/expiresAt/g) ?? []).length;
      if (n > 0) counts.set(rel, n);
    }
    const expected = Object.fromEntries([...EXPECTED_WRITES].map(([k, v]) => [k, v.count]));
    expect(Object.fromEntries(counts)).toEqual(expected);
  });

  it("every occurrence targets the EVENT# marker or the DAY# row on the ledger table", () => {
    const offenses: string[] = [];
    for (const { rel, src } of sources) {
      let idx = -1;
      while ((idx = src.indexOf("expiresAt", idx + 1)) !== -1) {
        const before = src.slice(Math.max(0, idx - 1500), idx);
        const row = lastMatch(ROW_MARKER, before);
        const table = lastMatch(TABLE_NAME, before);
        const line = src.slice(0, idx).split("\n").length;

        const isEventMarker = row === "eventKey(" || row === "EVENT#";
        const isDayCapOnLedger = row === "DAY#" && table === "ledgerTable";
        if (!(isEventMarker || isDayCapOnLedger)) {
          offenses.push(
            `${rel}:${line}  expiresAt writes to a row keyed near "${row ?? "?"}" on table "${table ?? "?"}" — ` +
              "on the wallet table TTL would DELETE that row whole; see the header of this test",
          );
        }
      }
    }
    expect(offenses.join("\n")).toBe("");
  });
});
