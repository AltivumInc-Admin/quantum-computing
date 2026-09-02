#!/usr/bin/env node
/**
 * Does the Stripe product catalog match what this repo sells?
 *
 * The sibling guard (`check-webhook-parity.mjs`) checks the events; this one
 * checks the goods. Both exist for the same reason: the Stripe Dashboard is not
 * in the repo, so no test in this repo can see it, and on 2026-08-17 both had
 * drifted — the live `ql_plus` product description advertised a credit grant
 * that disagreed with `CATALOG`, and all three products still carried the
 * at-cost/no-markup framing that CLAUDE.md rules 5 and 9 retired.
 *
 * That copy is customer-facing at the Checkout page, so it is a rule 13 surface
 * ("never advertise what the deployed system cannot do") sitting entirely
 * outside every rule 13 guard.
 *
 * Checks, per CATALOG entry:
 *   - an ACTIVE price exists with that lookup_key
 *   - subscriptions bill monthly at the tier's published price
 *   - one-off top-ups cost exactly their credit count (the $0.01 peg: credits === cents)
 *   - the product description states no credit count that disagrees with CATALOG
 *   - the product description makes no retired margin claim
 *
 * READ-ONLY. Key by environment; --expect-account is required and verified first.
 *
 *   STRIPE_API_KEY=$(op read "op://Quantum Learner/Stripe/add more/Secret Key") \
 *     node scripts/stripe/check-catalog-parity.mjs --expect-account live
 *
 * --expect-account takes `live` or `sandbox` (resolved through
 * scripts/stripe/lib/accounts.mjs) or an explicit acct_.
 *
 * Exit 0 = parity, 1 = drift, 2 = usage error.
 */
import { readFileSync } from "node:fs";
import { CATALOG } from "../../lambda/stripe/index.mjs";
import { resolveAccount } from "./lib/accounts.mjs";
import { assertAccount, die, parseArgs, stripeClient } from "./lib/preamble.mjs";
import { auditDescription, tierPrices } from "./lib/parity-rules.mjs";

const { flag, has } = parseArgs(process.argv.slice(2));
const key = process.env.STRIPE_API_KEY;
// `live` / `sandbox` resolve to the recorded ids; an explicit acct_ passes
// through. A retired id throws here rather than failing closed at Stripe.
let expectAccount;
try {
  expectAccount = resolveAccount(flag("--expect-account"));
} catch (err) {
  die(2, err.message);
}
const json = has("--json");

if (!key) die(2, "STRIPE_API_KEY is not set. Pass it by environment, never as an argument.");
if (!expectAccount) die(2, "--expect-account <acct_...> is required. Refusing to audit an unidentified account.");

const client = stripeClient(key);
const problems = [];

const account = await assertAccount(client, expectAccount).catch((err) => die(1, err.message));

// The published prices are parsed out of pricing.ts rather than imported: it is
// TypeScript with i18n key references, and this script must run under plain node
// with no build step (it is called from CI and from the runbook). The parser is
// shared with provision-sandbox and unit-tested in parity-rules.test.mjs — a
// second copy had already diverged into one that read a parse failure as drift.
const tiers = tierPrices(readFileSync(new URL("../../web/src/lib/pricing.ts", import.meta.url), "utf8"));
const { data: prices = [] } = await client.get("prices?limit=100&active=true&expand[]=data.product");
const byLookup = new Map(prices.filter((p) => p.lookup_key).map((p) => [p.lookup_key, p]));

const rows = [];
for (const [lookup, spec] of Object.entries(CATALOG)) {
  const price = byLookup.get(lookup);
  if (!price) {
    problems.push(`${lookup}: no ACTIVE price with this lookup_key — checkout for it will 500`);
    rows.push({ lookup, ok: false, reason: "missing" });
    continue;
  }

  const issues = [];
  const wantRecurring = spec.mode === "subscription";
  const isRecurring = Boolean(price.recurring);
  if (isRecurring !== wantRecurring) {
    issues.push(`CATALOG says mode=${spec.mode} but the price is ${isRecurring ? "recurring" : "one-time"}`);
  }
  if (wantRecurring) {
    if (price.recurring?.interval !== "month") issues.push(`interval is ${price.recurring?.interval}, expected month`);
    const tier = tiers[lookup];
    if (!tier) {
      issues.push(`no TIERS entry in pricing.ts carries checkoutLookupKey "${lookup}"`);
    } else {
      if (price.unit_amount !== tier.usd * 100) {
        issues.push(`Stripe charges ${price.unit_amount}c but pricing.ts publishes $${tier.usd}`);
      }
      if (tier.credits !== spec.credits) {
        issues.push(`pricing.ts grants ${tier.credits} but CATALOG grants ${spec.credits} (rule 8 lockstep)`);
      }
    }
  } else {
    // The dollar peg: 1 credit = $0.01, so a top-up's price in cents IS its credits.
    if (price.unit_amount !== spec.credits) {
      issues.push(`top-up costs ${price.unit_amount}c for ${spec.credits} credits — breaks the 1c peg`);
    }
  }

  issues.push(...auditDescription(price.product?.description, spec.credits));

  if (issues.length) problems.push(`${lookup} (${price.id}, product ${price.product?.id}):\n    ` + issues.join("\n    "));
  rows.push({ lookup, priceId: price.id, product: price.product?.id, amount: price.unit_amount, issues });
}

const stray = [...byLookup.keys()].filter((k) => !(k in CATALOG)).sort();

if (json) {
  console.log(JSON.stringify({ account: account.id, rows, stray, problems }, null, 2));
} else {
  console.log(`\n  Stripe catalog parity  (account ${account.id} — ${account.settings?.dashboard?.display_name ?? "?"})\n`);
  for (const r of rows) {
    const ok = r.issues && r.issues.length === 0;
    console.log(`  ${ok ? "OK   " : "DRIFT"}  ${r.lookup.padEnd(20)} ${r.priceId ?? "(missing)"}  ${r.amount ?? "-"}c`);
    for (const i of r.issues ?? []) console.log(`           ${i}`);
  }
  if (stray.length) console.log(`\n  note: active lookup_keys not in CATALOG (harmless, but nothing sells them): ${stray.join(", ")}`);
  console.log(problems.length ? `\n  ${problems.length} product(s) have drifted.\n` : `\n  Catalog matches CATALOG and pricing.ts.\n`);
}

process.exit(problems.length ? 1 : 0);
