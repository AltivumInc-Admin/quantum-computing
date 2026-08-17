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
 *     node scripts/stripe/check-catalog-parity.mjs --expect-account acct_1TuFow07hJdXv6GV
 *
 * Exit 0 = parity, 1 = drift, 2 = usage error.
 */
import { readFileSync } from "node:fs";
import { CATALOG } from "../../lambda/stripe/index.mjs";

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  return i === -1 ? undefined : args[i + 1];
};
const key = process.env.STRIPE_API_KEY;
const expectAccount = flag("--expect-account");
const json = args.includes("--json");

if (!key) {
  console.error("STRIPE_API_KEY is not set. Pass it by environment, never as an argument.");
  process.exit(2);
}
if (!expectAccount) {
  console.error("--expect-account <acct_...> is required. Refusing to audit an unidentified account.");
  process.exit(2);
}

/**
 * Published monthly prices, parsed out of pricing.ts rather than imported: it is
 * TypeScript with i18n key references, and this script must run under plain node
 * with no build step (it is called from CI and from the runbook).
 */
function tierPrices() {
  const src = readFileSync(new URL("../../web/src/lib/pricing.ts", import.meta.url), "utf8");
  const body = src.match(/export const TIERS[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1];
  if (!body) throw new Error("could not locate the TIERS array in pricing.ts");
  const out = {};
  // Split on tier-object boundaries. A single spanning regex silently pairs the
  // FREE tier's values (0 / 0, and no checkoutLookupKey) with the NEXT tier's
  // lookup key, which reads as a $0 price on a paid tier — a false drift report
  // on exactly the surface this script exists to police.
  for (const block of body.split(/\n  \},?\n?/)) {
    const lookup = block.match(/checkoutLookupKey:\s*"([a-z0-9_]+)"/)?.[1];
    if (!lookup) continue; // free tier: nothing to sell
    const usd = block.match(/priceUsdPerMonth:\s*(\d+)/)?.[1];
    const credits = block.match(/monthlyCredits:\s*(\d+)/)?.[1];
    if (usd === undefined || credits === undefined) continue;
    out[lookup] = { usd: Number(usd), credits: Number(credits) };
  }
  return out;
}

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
  });
  const body = await res.json();
  if (body?.error) throw new Error(`${path}: ${body.error.message}`);
  return body;
}

const problems = [];

const account = await stripeGet("account");
if (account.id !== expectAccount) {
  console.error(
    `WRONG ACCOUNT: key belongs to ${account.id} (${account.settings?.dashboard?.display_name ?? "?"}), ` +
      `expected ${expectAccount}. Refusing to continue.`
  );
  process.exit(1);
}

const tiers = tierPrices();
const { data: prices = [] } = await stripeGet("prices?limit=100&active=true&expand[]=data.product");
const byLookup = new Map(prices.filter((p) => p.lookup_key).map((p) => [p.lookup_key, p]));

// Retired commercial framing. These are claims about the SPREAD, which rules 5/9
// settled and rule 6 keeps out of the repo — they must not survive on a customer-
// facing Stripe product either.
const RETIRED_CLAIMS = [/\bno markup\b/i, /\bat cost\b/i, /\badd(?:s|ing)? nothing on top\b/i];

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

  const desc = price.product?.description ?? "";
  for (const n of desc.matchAll(/([\d,]{3,})\s+credits/gi)) {
    const stated = Number(n[1].replace(/,/g, ""));
    if (stated !== spec.credits) {
      issues.push(`product description advertises ${n[1]} credits; CATALOG grants ${spec.credits}`);
    }
  }
  for (const re of RETIRED_CLAIMS) {
    const hit = desc.match(re);
    if (hit) issues.push(`product description still makes the retired claim "${hit[0]}" (rules 5/9)`);
  }

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
