#!/usr/bin/env node
/**
 * Is the Stripe Dashboard subscribed to the events this handler actually needs?
 *
 * `index.test.mjs` R9 asserts REQUIRED_WEBHOOK_EVENTS matches the handler's
 * `switch` cases — code against code. Nothing asserted code against REALITY, and
 * on 2026-08-17 the live endpoint turned out to be subscribed to 4 of the 9:
 * `charge.refunded` and both dispute events were absent, so the entire clawback
 * path — every line of it, fully tested — could never fire in production. A
 * refund would have returned the customer's money and left the credits spent.
 *
 * That class of failure is invisible to every test in this repo, because the
 * Dashboard is not in the repo. This script is the missing half.
 *
 * It also checks the endpoint's pinned `api_version`. A null version means the
 * endpoint renders events at whatever the ACCOUNT DEFAULT happens to be, which
 * is what moved `invoice.subscription` under `parent.subscription_details` and
 * silently broke credit granting once already (see docs/billing-cutover-runbook
 * §1.1c). A pinned version makes the payload shape a decision instead of a
 * moving target.
 *
 * READ-ONLY. It never writes to Stripe. Provide the key by environment so no
 * secret reaches argv or shell history:
 *
 *   STRIPE_API_KEY=$(op read "op://Quantum Learner/Stripe/add more/Secret Key") \
 *     node scripts/stripe/check-webhook-parity.mjs --expect-account live
 *
 * --expect-account takes `live` or `sandbox` (resolved through
 * scripts/stripe/lib/accounts.mjs) or an explicit acct_. It is REQUIRED and
 * verified before anything else: this owner's
 * Stripe login also controls Altivum Logic and Tj-Scents, and every `stripe` CLI
 * profile on this machine currently points at the WRONG one. Never infer the
 * account from a profile, a session, or a previous run.
 *
 * Exit 0 = parity. Exit 1 = drift (or a wrong account). Exit 2 = usage error.
 */
import { REQUIRED_WEBHOOK_EVENTS } from "../../lambda/stripe/index.mjs";
import { resolveAccount } from "./lib/accounts.mjs";
import { assertAccount, die, parseArgs, stripeClient } from "./lib/preamble.mjs";
import { diffEvents } from "./lib/parity-rules.mjs";

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
const expectUrl = flag("--expect-url"); // optional: pin which endpoint we audit
const json = has("--json");

if (!key) die(2, "STRIPE_API_KEY is not set. Pass it by environment, never as an argument.");
if (!expectAccount) die(2, "--expect-account <acct_...> is required. Refusing to audit an unidentified account.");

const client = stripeClient(key);
const problems = [];
const notes = [];

// 1. Identity, before anything else.
const account = await assertAccount(client, expectAccount).catch((err) => die(1, err.message));
notes.push(`account ${account.id} (${account.settings?.dashboard?.display_name ?? "?"}), key mode ${client.mode}`);

// 2. The endpoints.
const { data: endpoints = [] } = await client.get("webhook_endpoints?limit=100");
const enabled = endpoints.filter((e) => e.status === "enabled");
const targets = expectUrl ? enabled.filter((e) => e.url === expectUrl) : enabled;

if (targets.length === 0) {
  problems.push(expectUrl ? `no enabled endpoint with url ${expectUrl}` : "no enabled webhook endpoint at all");
}
if (!expectUrl && targets.length > 1) {
  notes.push(`${targets.length} enabled endpoints; each is audited separately`);
}

const required = [...REQUIRED_WEBHOOK_EVENTS].sort();
const report = [];

for (const ep of targets) {
  const subscribed = new Set(ep.enabled_events);
  const { wildcard, missing, extra } = diffEvents(subscribed, required);

  if (missing.length) {
    problems.push(
      `${ep.url}: NOT subscribed to ${missing.length} required event(s) — the handler's code for these can never run:\n    ` +
        missing.join("\n    ")
    );
  }
  if (extra.length) {
    // Not fatal: a delivered-but-unhandled money event already logs the pinned
    // phrase in the handler's `default` branch. Worth surfacing all the same.
    notes.push(`${ep.url}: subscribed to ${extra.length} event(s) the handler ignores: ${extra.join(", ")}`);
  }
  if (wildcard) {
    notes.push(`${ep.url}: subscribed to "*" — every required event arrives, but so does everything else`);
  }
  if (!ep.api_version) {
    problems.push(
      `${ep.url}: api_version is NULL, so payload shape follows the ACCOUNT DEFAULT and can change under a ` +
        `deployed handler. Endpoint API version is creation-only — recreate the endpoint pinned (runbook §1.1c).`
    );
  }
  report.push({
    id: ep.id,
    url: ep.url,
    apiVersion: ep.api_version ?? null,
    subscribed: [...subscribed].sort(),
    missing,
    extra,
  });
}

if (json) {
  console.log(
    JSON.stringify({ account: account.id, mode: client.mode, required, endpoints: report, problems, notes }, null, 2)
  );
} else {
  console.log(`\n  Stripe webhook parity  (${notes[0]})\n`);
  for (const r of report) {
    const ok = r.missing.length === 0 && r.apiVersion;
    console.log(`  ${ok ? "OK   " : "DRIFT"}  ${r.url}`);
    console.log(`         api_version: ${r.apiVersion ?? "NULL (account default)"}`);
    console.log(`         subscribed: ${r.subscribed.length}/${required.length} required`);
    if (r.missing.length) console.log(`         MISSING: ${r.missing.join(", ")}`);
    if (r.extra.length) console.log(`         extra: ${r.extra.join(", ")}`);
  }
  for (const n of notes.slice(1)) console.log(`\n  note: ${n}`);
  if (problems.length) {
    console.log(`\n  ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  - ${p}`);
    console.log("");
  } else {
    console.log(`\n  All ${required.length} required events are subscribed on every audited endpoint.\n`);
  }
}

process.exit(problems.length ? 1 : 0);
