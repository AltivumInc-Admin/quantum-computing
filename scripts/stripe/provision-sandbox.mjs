#!/usr/bin/env node
/**
 * Build the Quantum Learner Stripe SANDBOX to match what live sells, so payment
 * changes can be exercised against a real Stripe before they touch real money.
 *
 * Why this exists: for months the only verification available to this handler was
 * offline tests against a stubbed SDK, and the phrase "tests pass but the path
 * cannot be exercised end to end" got accepted as a fact of life. It is not. A
 * sandbox runs every one of these paths against a real Stripe and a real webhook
 * delivery. Everything Stripe-related gets evaluated there first.
 *
 * WHAT IT CREATES (idempotently — safe to re-run):
 *   - product `ql_credits` with that LITERAL id. `CUSTOM_TOPUP_PRODUCT` passes it
 *     to price_data.product, so a custom top-up 500s in any account lacking it.
 *   - products `ql_plus` / `ql_pro`
 *   - one active price per CATALOG lookup_key, at the amount the repo publishes
 *   - a webhook endpoint carrying ALL NINE required events and a PINNED
 *     api_version matching the SDK's own pin
 *
 * Prices are IMMUTABLE in Stripe: an amount change means a new price, and the
 * lookup_key is moved onto it with transfer_lookup_key. That is the same dance
 * live needs, which is part of what this rehearses.
 *
 * Descriptions are generated from CATALOG rather than copied from live, on
 * purpose. Live's descriptions have drifted (stale credit counts, plus the
 * at-cost/no-markup framing rules 5 and 9 retired), and copying that here would
 * launder a known-wrong string into a second account. Structure — lookup keys,
 * product ids, amounts, intervals, currency — mirrors live exactly, which is what
 * makes sandbox behaviour predictive. Run check-catalog-parity.mjs against both
 * accounts; sandbox should pass and live's failures are the worklist.
 *
 * SAFETY. This script WRITES, so it refuses to run unless ALL of these hold:
 *   - the key is a test/sandbox key (never sk_live_ / rk_live_)
 *   - --expect-account is not the LIVE account id. A standard Stripe account
 *     returns the same acct_ for its test and live keys, so the id alone cannot
 *     separate the modes: naming the live account here can only be a mistake.
 *   - --expect-account matches the authenticated account exactly
 * Every `stripe` CLI profile on this machine points at the wrong account, so
 * identity is never inferred — only asserted. `--expect-account sandbox` is the
 * alias for the provisioned sandbox (scripts/stripe/lib/accounts.mjs).
 *
 *   STRIPE_API_KEY=$(op read "op://Quantum Learner/Stripe Sandbox/Secret Key") \
 *     node scripts/stripe/provision-sandbox.mjs \
 *       --expect-account sandbox \
 *       --webhook-url https://<api-id>.execute-api.us-east-2.amazonaws.com/webhook \
 *       --secret-id quantum-stripe-sandbox
 *
 * The webhook signing secret is returned by Stripe ONLY at creation. It is piped
 * straight into Secrets Manager by this process: never printed, never in argv,
 * never written to disk.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { CATALOG, CUSTOM_TOPUP_PRODUCT, REQUIRED_WEBHOOK_EVENTS } from "../../lambda/stripe/index.mjs";
import { LIVE_ACCOUNT, resolveAccount } from "./lib/accounts.mjs";

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  return i === -1 ? undefined : args[i + 1];
};
const dryRun = args.includes("--dry-run");
const key = process.env.STRIPE_API_KEY;
// `sandbox` resolves to the provisioned sandbox; an explicit acct_ passes
// through. A retired id throws here rather than failing closed at Stripe.
let expectAccount;
try {
  expectAccount = resolveAccount(flag("--expect-account"));
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
const webhookUrl = flag("--webhook-url");
const secretId = flag("--secret-id");
const region = flag("--region") ?? "us-east-2";

if (!key) die(2, "STRIPE_API_KEY is not set. Pass it by environment, never as an argument.");
if (!expectAccount) die(2, "--expect-account <acct_...> is required. This script writes; it will not guess.");
if (/^(sk|rk)_live_/.test(key)) die(2, "REFUSING: that is a LIVE key. This script only ever provisions a sandbox.");
// The key-prefix refusal above and this one are two halves of the same guard. A
// standard Stripe account returns the SAME acct_ for its test and its live key,
// so the id cannot tell the modes apart — but naming the live account as the
// thing to provision is unambiguous, and it is the shape a copy-paste takes.
if (expectAccount === LIVE_ACCOUNT) {
  die(2, `REFUSING: ${LIVE_ACCOUNT} is the LIVE account. This script only ever provisions a sandbox.`);
}
if (webhookUrl && !secretId && !dryRun) die(2, "--webhook-url requires --secret-id (where the signing secret goes).");

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

/** The SDK's own pin — inbound payload shape must match what the handler expects. */
const API_VERSION =
  readFileSync(new URL("../../lambda/stripe/index.mjs", import.meta.url), "utf8").match(
    /apiVersion:\s*"([^"]+)"/
  )?.[1] ?? die(2, "could not read the SDK apiVersion pin from index.mjs");

const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
async function stripe(method, path, form) {
  const init = { method, headers: { Authorization: auth } };
  if (form) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = form.toString();
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, init);
  const body = await res.json();
  if (body?.error) throw new Error(`${method} ${path}: ${body.error.message}`);
  return body;
}

const log = [];
const did = (verb, what) => {
  log.push(`  ${verb.padEnd(7)} ${what}`);
  console.log(`  ${verb.padEnd(7)} ${what}`);
};

// ---- identity, before any write ------------------------------------------------
const account = await stripe("GET", "account");
if (account.id !== expectAccount) {
  die(
    1,
    `WRONG ACCOUNT: key belongs to ${account.id} (${account.settings?.dashboard?.display_name ?? "?"}), ` +
      `expected ${expectAccount}. Refusing to write.`
  );
}
console.log(
  `\n  Provisioning ${account.id} (${account.settings?.dashboard?.display_name ?? "?"})` +
    `${dryRun ? "  [DRY RUN — no writes]" : ""}\n`
);

// ---- products ------------------------------------------------------------------
// Credit counts come from CATALOG so the copy cannot drift from what the handler
// actually grants — the exact failure live is in today.
const fmt = (n) => n.toLocaleString("en-US");
const PRODUCTS = {
  [CUSTOM_TOPUP_PRODUCT]: {
    name: "Quantum Learner Credits",
    description:
      "Pay-as-you-go credits for the AI tutor and real quantum hardware runs on IQM Garnet. " +
      "1 credit = $0.01. Purchased credits never expire.",
  },
  ql_plus: {
    name: "Quantum Learner Plus",
    description: `${fmt(CATALOG.ql_plus_monthly.credits)} credits every month for the AI tutor and real quantum hardware runs.`,
  },
  ql_pro: {
    name: "Quantum Learner Pro",
    description: `${fmt(CATALOG.ql_pro_monthly.credits)} credits every month for the AI tutor and real quantum hardware runs.`,
  },
};

for (const [id, spec] of Object.entries(PRODUCTS)) {
  let existing = null;
  try {
    existing = await stripe("GET", `products/${id}`);
  } catch {
    /* not found */
  }
  if (!existing) {
    if (dryRun) did("create", `product ${id}`);
    else {
      await stripe("POST", "products", new URLSearchParams({ id, name: spec.name, description: spec.description }));
      did("created", `product ${id}`);
    }
  } else if (existing.description !== spec.description || existing.name !== spec.name || !existing.active) {
    if (dryRun) did("update", `product ${id} (name/description/active)`);
    else {
      await stripe(
        "POST",
        `products/${id}`,
        new URLSearchParams({ name: spec.name, description: spec.description, active: "true" })
      );
      did("updated", `product ${id}`);
    }
  } else {
    did("ok", `product ${id}`);
  }
}

// ---- prices --------------------------------------------------------------------
function tierUsd(lookup) {
  const src = readFileSync(new URL("../../web/src/lib/pricing.ts", import.meta.url), "utf8");
  const body = src.match(/export const TIERS[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1] ?? "";
  for (const block of body.split(/\n  \},?\n?/)) {
    if (block.match(/checkoutLookupKey:\s*"([a-z0-9_]+)"/)?.[1] !== lookup) continue;
    return Number(block.match(/priceUsdPerMonth:\s*(\d+)/)?.[1]);
  }
  return undefined;
}

const { data: activePrices = [] } = await stripe("GET", "prices?limit=100&active=true");
const byLookup = new Map(activePrices.filter((p) => p.lookup_key).map((p) => [p.lookup_key, p]));

for (const [lookup, spec] of Object.entries(CATALOG)) {
  const recurring = spec.mode === "subscription";
  // Subscriptions bill the published monthly price; top-ups cost their credit
  // count exactly, because 1 credit is pegged to 1 cent.
  const amount = recurring ? tierUsd(lookup) * 100 : spec.credits;
  const product = recurring ? (spec.tier === "plus" ? "ql_plus" : "ql_pro") : CUSTOM_TOPUP_PRODUCT;
  if (!Number.isFinite(amount)) die(1, `${lookup}: could not resolve an amount from pricing.ts`);

  const current = byLookup.get(lookup);
  if (current && current.unit_amount === amount && Boolean(current.recurring) === recurring && current.product === product) {
    did("ok", `price ${lookup} (${amount}c)`);
    continue;
  }
  if (dryRun) {
    did(current ? "replace" : "create", `price ${lookup} -> ${amount}c on ${product}`);
    continue;
  }
  const form = new URLSearchParams({
    currency: "usd",
    product,
    unit_amount: String(amount),
    lookup_key: lookup,
    transfer_lookup_key: "true", // move the key off any stale price
  });
  if (recurring) form.set("recurring[interval]", "month");
  const created = await stripe("POST", "prices", form);
  did(current ? "replaced" : "created", `price ${lookup} -> ${created.id} (${amount}c)`);
  if (current) {
    await stripe("POST", `prices/${current.id}`, new URLSearchParams({ active: "false" }));
    did("retired", `price ${current.id} (superseded)`);
  }
}

// ---- webhook endpoint ----------------------------------------------------------
if (!webhookUrl) {
  console.log(`\n  No --webhook-url given; skipping the endpoint. Catalog is provisioned.\n`);
} else {
  const { data: endpoints = [] } = await stripe("GET", "webhook_endpoints?limit=100");
  const match = endpoints.find((e) => e.url === webhookUrl);
  const required = [...REQUIRED_WEBHOOK_EVENTS].sort();
  const correct =
    match &&
    match.status === "enabled" &&
    match.api_version === API_VERSION &&
    JSON.stringify([...match.enabled_events].sort()) === JSON.stringify(required);

  if (correct) {
    did("ok", `webhook ${match.id} (${required.length} events, pinned ${API_VERSION})`);
  } else if (dryRun) {
    did(match ? "recreate" : "create", `webhook ${webhookUrl} with ${required.length} events @ ${API_VERSION}`);
  } else {
    // api_version is CREATE-ONLY: an existing endpoint on the wrong pin (or the
    // wrong event set) is deleted and rebuilt, which mints a new signing secret.
    if (match) {
      await stripe("DELETE", `webhook_endpoints/${match.id}`);
      did("deleted", `webhook ${match.id} (wrong pin or event set; api_version cannot be patched)`);
    }
    const form = new URLSearchParams({
      url: webhookUrl,
      api_version: API_VERSION,
      description: "quantum-stripe sandbox (provisioned by scripts/stripe/provision-sandbox.mjs)",
    });
    for (const e of required) form.append("enabled_events[]", e);
    const created = await stripe("POST", "webhook_endpoints", form);
    did("created", `webhook ${created.id} (${required.length} events, pinned ${created.api_version})`);

    // The signing secret is returned ONLY here. Pipe it to Secrets Manager on
    // stdin — never printed, never in argv, never on disk.
    if (!created.secret) die(1, "Stripe returned no signing secret on create; cannot continue.");
    const payload = JSON.stringify({ secretKey: key, webhookSecret: created.secret });
    await new Promise((resolve, reject) => {
      const p = spawn(
        "aws",
        [
          "secretsmanager", "put-secret-value",
          "--secret-id", secretId,
          "--region", region,
          "--secret-string", "file:///dev/stdin",
        ],
        { stdio: ["pipe", "ignore", "inherit"] }
      );
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`aws exited ${code}`))));
      p.stdin.end(payload);
    });
    did("stored", `signing secret -> secretsmanager:${secretId} (${region}), never printed`);
  }
}

console.log(`\n  Done. Verify with:`);
console.log(`    STRIPE_API_KEY=... node scripts/stripe/check-catalog-parity.mjs --expect-account ${expectAccount}`);
console.log(`    STRIPE_API_KEY=... node scripts/stripe/check-webhook-parity.mjs --expect-account ${expectAccount}\n`);
