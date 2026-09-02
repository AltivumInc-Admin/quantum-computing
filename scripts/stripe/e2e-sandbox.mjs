#!/usr/bin/env node
/**
 * Exercise the wallet paths for real: real Stripe objects, real webhook
 * deliveries to a real deployed Lambda, real DynamoDB rows asserted after each
 * step. This is the verification that never existed for this integration.
 *
 * Every claim of the form "tests pass but this cannot be checked end to end" is
 * answered here. The offline suite proves the arithmetic; this proves the wiring
 * — that Stripe emits what we think, subscribes us to it, shapes it the way the
 * handler parses, and that the handler's writes land where the gates read.
 *
 * SANDBOX ONLY. Refuses any live key before doing anything else.
 *
 *   STRIPE_API_KEY=$(op read "op://Quantum Learner/Stripe Sandbox/Secret Key") \
 *     node scripts/stripe/e2e-sandbox.mjs \
 *       --expect-account sandbox \
 *       --table quantum-stripe-sandbox-wallet \
 *       --sub e2e-$(date +%s)            # the Cognito sub these rows are keyed by
 *
 *   --only grant,refund      run a subset (default: all)
 *   --keep                   leave objects behind for inspection
 *   --webhook-endpoint we_   which endpoint `replay` resends to (default: the
 *                            account's only enabled one)
 *
 * WHAT EACH STEP PROVES, and why it is shaped the way it is:
 *
 *   grant     A subscription created WITH metadata.{userId,tier,credits} emits
 *             invoice.paid (billing_reason: subscription_create). Proves the
 *             Basil `parent.subscription_details` read, the subscriptions
 *             re-retrieve, the PaymentIntent resolution through
 *             invoices.retrieve(expand:['payments']), and that a RECEIPT# row is
 *             written with amountPaidCents.
 *
 *   renewal   A test clock advanced past the period boundary emits a SECOND
 *             invoice.paid (subscription_cycle). With a debt seeded first, this
 *             is the only real proof of the #218 garnish: the grant pays the
 *             debt down before anything becomes spendable.
 *             NOTE: two advances are required. The renewal invoice is created in
 *             `draft` and sits ~1h of simulated time before it is paid.
 *
 *   refund    A PARTIAL refund then the remainder. reclaim()'s target is
 *             absolute (amount_refunded is cumulative), so the second refund must
 *             move refundedCredits 500 -> 1900 with a delta of 1400, not 1900.
 *             That two-step is the whole point; a single full refund would pass
 *             even with incremental arithmetic.
 *
 *   dispute   A real chargeback via pm_card_createDispute, then WON via
 *             evidence[uncategorized_text]=winning_evidence. Proves #217 end to
 *             end: funds_withdrawn books the shortfall as clawbackOwedCredits,
 *             funds_reinstated returns exactly what was taken and clears exactly
 *             the debt it created. Seeded so the balance cannot cover the
 *             clawback, because unrecovered > 0 is the only interesting case.
 *
 *   prorate   #230's pro-rate branch. Stripe cannot produce a partial dispute in
 *             test mode at all (no create endpoint, no amount param, no test
 *             helper), so the DENOMINATOR is seeded instead: amountPaidCents
 *             lives in our table, not Stripe's. The dispute event is 100% real;
 *             only the receipt's notion of what was paid is adjusted.
 *
 *   replay    stripe events resend against the deployed endpoint. The only way to
 *             get a genuine duplicate delivery on demand, and therefore the only
 *             real test of applyOnce's EVENT# idempotency leg.
 *             Its assertion is a NEGATIVE (the wallet must not move), so it needs
 *             positive controls or it passes vacuously: it resends the event THIS
 *             run's grant produced, requires the handler's EVENT# row for it to
 *             already exist, pins the endpoint, and waits for Stripe to report the
 *             redelivery drained before reading the wallet. A redelivery that is
 *             never observed is a FAILED step, not a pass.
 */
import { spawnSync } from "node:child_process";
import { resolveAccount } from "./lib/accounts.mjs";
import { assertAccount, die, parseArgs, stripeClient } from "./lib/preamble.mjs";

const { flag, has } = parseArgs(process.argv.slice(2));
const key = process.env.STRIPE_API_KEY;
// `sandbox` resolves to the provisioned sandbox; an explicit acct_ passes
// through. A retired id throws here rather than failing closed at Stripe.
let expectAccount;
try {
  expectAccount = resolveAccount(flag("--expect-account"));
} catch (err) {
  die(2, err.message);
}
const table = flag("--table");
const sub = flag("--sub");
const region = flag("--region", "us-east-2");
const only = (flag("--only") ?? "").split(",").filter(Boolean);
const keep = has("--keep");
// Which endpoint the replay step resends to. Discovered when the account has
// exactly one enabled endpoint; required when it has more.
const webhookEndpoint = flag("--webhook-endpoint");

const fail = (m) => {
  console.error(m);
  process.exit(2);
};
if (!key) fail("STRIPE_API_KEY is not set. Pass it by environment, never as an argument.");
if (/^(sk|rk)_live_/.test(key)) fail("REFUSING: that is a LIVE key. This harness creates disputes and refunds.");
if (!expectAccount) fail("--expect-account <acct_...> is required.");
if (!table) fail("--table <ddb-table> is required (the SANDBOX stack's wallet table).");
// The Stripe half of this harness's isolation was enforced and the DynamoDB half
// was only a comment. `quantum-stripe-wallet` and `quantum-stripe-sandbox-wallet`
// live in ONE AWS account and differ by one word, and the seeds below are
// absolute SET writes — they destroy a balance rather than adjust it. A refusal
// here matches the energy of the sk_live_ refusal above.
if (!/sandbox/.test(table)) {
  fail(`REFUSING: --table ${table} does not look like a sandbox table. This harness issues absolute SET writes to wallet rows.`);
}
if (!sub) fail("--sub <cognito-sub> is required — the identity these wallet rows are keyed by.");

const client = stripeClient(key);
const api = (method, path, params) => client.request(method, path, params);

/** Read the wallet row. Values, not shapes — this is the assertion surface. */
function wallet() {
  const r = spawnSync(
    "aws",
    ["dynamodb", "get-item", "--table-name", table, "--region", region,
     "--key", JSON.stringify({ pk: { S: `WALLET#${sub}` } }), "--output", "json"],
    { encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error(`ddb get-item failed: ${r.stderr}`);
  const item = JSON.parse(r.stdout || "{}").Item;
  return {
    credits: Number(item?.credits?.N ?? 0),
    owed: Number(item?.clawbackOwedCredits?.N ?? 0),
    tier: item?.tier?.S ?? null,
    status: item?.subscriptionStatus?.S ?? null,
    exists: Boolean(item),
  };
}

/**
 * The handler's idempotency marker for one Stripe event. Its presence is the
 * positive control the replay step needs: it proves the deployed handler has
 * actually processed THIS event id, so a redelivery of it must hit applyOnce's
 * EVENT# leg rather than being an event the endpoint under test never saw.
 */
function eventRow(id) {
  const r = spawnSync(
    "aws",
    ["dynamodb", "get-item", "--table-name", table, "--region", region,
     "--key", JSON.stringify({ pk: { S: `EVENT#${id}` } }), "--output", "json"],
    { encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error(`ddb get-item failed: ${r.stderr}`);
  return Boolean(JSON.parse(r.stdout || "{}").Item);
}

function receipt(pi) {
  const r = spawnSync(
    "aws",
    ["dynamodb", "get-item", "--table-name", table, "--region", region,
     "--key", JSON.stringify({ pk: { S: `RECEIPT#${pi}` } }), "--output", "json"],
    { encoding: "utf8" }
  );
  const item = JSON.parse(r.stdout || "{}").Item;
  return item
    ? {
        purchased: Number(item.purchasedCredits?.N ?? 0),
        refunded: Number(item.refundedCredits?.N ?? 0),
        disputed: Number(item.disputedCredits?.N ?? 0),
        amountPaidCents: item.amountPaidCents ? Number(item.amountPaidCents.N) : null,
        exists: true,
      }
    : { exists: false };
}

function seedWallet(fields) {
  const expr = [];
  const vals = {};
  for (const [k, v] of Object.entries(fields)) {
    expr.push(`${k} = :${k}`);
    vals[`:${k}`] = typeof v === "number" ? { N: String(v) } : { S: v };
  }
  const r = spawnSync(
    "aws",
    ["dynamodb", "update-item", "--table-name", table, "--region", region,
     "--key", JSON.stringify({ pk: { S: `WALLET#${sub}` } }),
     "--update-expression", `SET ${expr.join(", ")}`,
     "--expression-attribute-values", JSON.stringify(vals)],
    { encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error(`ddb seed failed: ${r.stderr}`);
}

/**
 * Stand up a RECEIPT# row in ONE write, `sub` included.
 *
 * It has to be one write, and it has to happen before the charge is confirmed.
 * A test dispute fires the instant the charge succeeds, and the webhook beat a
 * two-call seed here: reclaim() found a row carrying numbers but no `sub`, took
 * the `!sub` branch, and logged "purchase receipt is malformed; credits NOT
 * reclaimed". The handler was right; the harness was racing it.
 */
function seedReceipt(pi, fields) {
  const expr = [];
  const names = { "#sub": "sub" };
  const vals = {};
  for (const [k, v] of Object.entries(fields)) {
    const slot = k === "sub" ? "#sub" : k;
    expr.push(`${slot} = :${k}`);
    vals[`:${k}`] = typeof v === "number" ? { N: String(v) } : { S: v };
  }
  const r = spawnSync(
    "aws",
    ["dynamodb", "update-item", "--table-name", table, "--region", region,
     "--key", JSON.stringify({ pk: { S: `RECEIPT#${pi}` } }),
     "--update-expression", `SET ${expr.join(", ")}`,
     "--expression-attribute-names", JSON.stringify(names),
     "--expression-attribute-values", JSON.stringify(vals)],
    { encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error(`ddb seed receipt failed: ${r.stderr}`);
}

/**
 * A real chargeback whose receipt is already in place when it lands.
 * `pm_card_createDispute` disputes the moment the charge succeeds, so the PI is
 * created UNCONFIRMED, the receipt is written, and only then is it confirmed.
 */
async function disputedCharge({ amountCents, purchasedCredits, amountPaidCents }) {
  const pi = await api("POST", "payment_intents", {
    amount: String(amountCents),
    currency: "usd",
    payment_method: "pm_card_createDispute",
    confirm: "false",
    "automatic_payment_methods[enabled]": "true",
    "automatic_payment_methods[allow_redirects]": "never",
  });
  seedReceipt(pi.id, {
    sub,
    purchasedCredits,
    refundedCredits: 0,
    disputedCredits: 0,
    amountPaidCents,
  });
  await api("POST", `payment_intents/${pi.id}/confirm`, {});
  return pi.id;
}

/**
 * The endpoint a resend must be pinned to. `stripe events resend` with no
 * --webhook-endpoint fans out to every subscribed endpoint, and a rotation
 * deliberately leaves two coexisting, so an unpinned resend can prove something
 * about an endpoint that is not the one under test.
 */
async function soleEnabledEndpoint() {
  const { data = [] } = await api("GET", "webhook_endpoints?limit=100");
  const enabled = data.filter((e) => e.status === "enabled");
  assert(enabled.length > 0, "no enabled webhook endpoint in this account");
  assert(
    enabled.length === 1,
    `${enabled.length} enabled endpoints; pass --webhook-endpoint we_... to name the one under test`
  );
  return enabled[0].id;
}

/**
 * Watch a redelivery actually go out. `pending_webhooks` is Stripe's own count
 * of deliveries still queued for an event: a resend pushes it above zero and it
 * falls back to zero once the attempt has been made. That rise-and-fall is the
 * only signal available here, because the handler is expected to write NOTHING
 * — "the wallet did not move" is equally what a resend that never left the
 * building looks like.
 *
 * Polled fast, because a sandbox delivery can complete in well under a second.
 * If this ever races, widen the budget; do not go back to sleeping blind and
 * calling the result a pass.
 */
async function untilRedelivered(eventId, timeoutMs = 60_000) {
  const started = Date.now();
  let queued = false;
  while (Date.now() - started < timeoutMs) {
    const e = await api("GET", `events/${eventId}`);
    if (Number(e.pending_webhooks ?? 0) > 0) queued = true;
    else if (queued) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Webhook delivery is asynchronous. Poll the row rather than sleeping blind. */
async function until(desc, predicate, timeoutMs = 90_000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = wallet();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`timed out waiting for ${desc}. last wallet: ${JSON.stringify(last)}`);
}

const results = [];
const step = async (name, fn) => {
  if (only.length && !only.includes(name)) return;
  process.stdout.write(`  ${name.padEnd(9)} `);
  try {
    const note = await fn();
    console.log(`PASS  ${note ?? ""}`);
    results.push({ name, ok: true });
  } catch (err) {
    console.log(`FAIL  ${err.message}`);
    results.push({ name, ok: false, err: err.message });
  }
};

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ---- preflight -----------------------------------------------------------------
const account = await assertAccount(client, expectAccount).catch((err) => fail(err.message));
console.log(`\n  e2e against ${account.id} (${account.settings?.dashboard?.display_name ?? "?"})`);
console.log(`  wallet rows keyed by ${sub} in ${table}\n`);

const created = { clocks: [], customers: [], subs: [] };
let subscriptionPi = null;
let topupPi = null;
// The invoice.paid event THIS run produced. The replay step resends exactly
// this one: an event picked by `events?limit=1` belongs to whatever ran last,
// and a redelivery of a stranger's event cannot move this wallet no matter how
// broken the idempotency leg is — a guaranteed pass.
let grantEventId = null;

// ---- grant ---------------------------------------------------------------------
await step("grant", async () => {
  const price = (await api("GET", "prices?lookup_keys[]=ql_plus_monthly&limit=1&active=true")).data[0];
  assert(price, "no active ql_plus_monthly price — run provision-sandbox.mjs first");

  const customer = await api("POST", "customers", {
    email: `${sub}@e2e.invalid`,
    payment_method: "pm_card_visa",
    "invoice_settings[default_payment_method]": "pm_card_visa",
    "metadata[userId]": sub,
  });
  created.customers.push(customer.id);

  // The handler reads subscription.metadata — not the session's. A subscription
  // created without it grants nothing, silently.
  const subscription = await api("POST", "subscriptions", {
    customer: customer.id,
    "items[0][price]": price.id,
    "metadata[userId]": sub,
    "metadata[tier]": "plus",
    "metadata[credits]": "1900",
  });
  created.subs.push(subscription.id);

  const w = await until("invoice.paid to credit the wallet", (x) => x.credits >= 1900);
  assert(w.tier === "plus", `tier is ${w.tier}, expected plus`);
  assert(w.status === "active", `subscriptionStatus is ${w.status}, expected active`);

  const inv = (await api("GET", `invoices?subscription=${subscription.id}&limit=1`)).data[0];
  const full = await api("GET", `invoices/${inv.id}?expand[]=payments`);
  subscriptionPi = full.payments?.data?.find((p) => p.payment?.payment_intent)?.payment?.payment_intent;
  assert(subscriptionPi, "no PaymentIntent resolved on the invoice — the receipt cannot be written");
  // The event that carried this invoice, kept for the replay step. Stripe has no
  // "events for object" filter, so the type-filtered page is scanned for it.
  const events = (await api("GET", "events?type=invoice.paid&limit=100")).data ?? [];
  grantEventId = events.find((e) => e.data?.object?.id === inv.id)?.id ?? null;
  assert(grantEventId, `no invoice.paid event found for invoice ${inv.id}`);

  const r = receipt(subscriptionPi);
  assert(r.exists, `no RECEIPT# row for ${subscriptionPi}`);
  assert(r.purchased === 1900, `receipt purchased=${r.purchased}, expected 1900`);
  assert(r.amountPaidCents === 1900, `receipt amountPaidCents=${r.amountPaidCents}, expected 1900`);
  return `credits=${w.credits} tier=${w.tier} receipt=${subscriptionPi}`;
});

// ---- renewal (#218 garnish) ------------------------------------------------------
await step("renewal", async () => {
  const price = (await api("GET", "prices?lookup_keys[]=ql_plus_monthly&limit=1&active=true")).data[0];
  const now = Math.floor(Date.now() / 1000);
  const clock = await api("POST", "test_helpers/test_clocks", { frozen_time: String(now), name: `e2e ${sub}` });
  created.clocks.push(clock.id);

  const customer = await api("POST", "customers", {
    email: `${sub}-clock@e2e.invalid`,
    test_clock: clock.id,
    payment_method: "pm_card_visa",
    "invoice_settings[default_payment_method]": "pm_card_visa",
  });
  const subscription = await api("POST", "subscriptions", {
    customer: customer.id,
    "items[0][price]": price.id,
    "metadata[userId]": sub,
    "metadata[tier]": "plus",
    "metadata[credits]": "1900",
  });

  await until("the first clock invoice", (x) => x.credits > 0, 120_000);
  const before = wallet();

  // Seed a debt so the renewal has something to garnish. This is the #218 case:
  // before the fix, the grant landed in full and the debt never moved.
  seedWallet({ clawbackOwedCredits: 800 });

  const advance = async (to) => {
    await api("POST", `test_helpers/test_clocks/${clock.id}/advance`, { frozen_time: String(to) });
    for (let i = 0; i < 60; i++) {
      const c = await api("GET", `test_helpers/test_clocks/${clock.id}`);
      if (c.status === "ready") return;
      if (c.status === "internal_failure") throw new Error("test clock advance failed");
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("test clock did not become ready");
  };
  // Two advances: past the period boundary, then past the ~1h the renewal
  // invoice spends in `draft` before it is paid.
  await advance(now + 32 * 24 * 3600);
  await advance(now + 32 * 24 * 3600 + 7200);

  const w = await until("the renewal grant to garnish the debt", (x) => x.owed === 0 && x.credits > before.credits, 180_000);
  const gained = w.credits - before.credits;
  assert(gained === 1100, `renewal added ${gained} spendable credits, expected 1100 (1900 grant − 800 debt)`);
  return `credits +${gained}, debt 800 -> 0`;
});

// ---- refund (partial then remainder) ---------------------------------------------
await step("refund", async () => {
  assert(subscriptionPi, "no PaymentIntent from the grant step — run with grant enabled");
  const before = wallet();

  // 500c of a 1900c charge that granted 1900 credits: floor(1900 * 500/1900) = 500.
  await api("POST", "refunds", { payment_intent: subscriptionPi, amount: "500" });
  const partial = await until("the partial refund clawback", (x) => x.credits <= before.credits - 500);
  const firstDelta = before.credits - partial.credits;
  assert(firstDelta === 500, `partial refund reclaimed ${firstDelta}, expected 500`);

  await api("POST", "refunds", { payment_intent: subscriptionPi, amount: "1400" });
  const full = await until("the remaining refund clawback", (x) => x.credits <= partial.credits - 1000);
  const secondDelta = partial.credits - full.credits;
  // The target is ABSOLUTE: amount_refunded is cumulative (1900 now), so the
  // counter moves 500 -> 1900 and the DELTA is 1400. An incremental
  // implementation would reclaim 1900 here and overdraw by 500.
  assert(secondDelta === 1400, `second refund reclaimed ${secondDelta}, expected 1400 (delta, not a re-clawback)`);
  const r = receipt(subscriptionPi);
  assert(r.refunded === 1900, `receipt refundedCredits=${r.refunded}, expected 1900`);
  return `deltas 500 then 1400 (absolute target), refundedCredits=1900`;
});

// ---- dispute withdrawn then WON (#217) -------------------------------------------
await step("dispute", async () => {
  // Balance BELOW the clawback so unrecovered > 0 — the only case where #217's
  // restore arithmetic does anything. Seeded before the charge, like the receipt.
  seedWallet({ credits: 500, clawbackOwedCredits: 0 });
  topupPi = await disputedCharge({ amountCents: 2000, purchasedCredits: 2000, amountPaidCents: 2000 });

  const withdrawn = await until("funds_withdrawn to book the shortfall", (x) => x.owed > 0, 120_000);
  assert(withdrawn.credits === 0, `credits=${withdrawn.credits}, expected 0 (floored)`);
  assert(withdrawn.owed === 1500, `owed=${withdrawn.owed}, expected 1500 (2000 clawback − 500 balance)`);

  const dispute = (await api("GET", `disputes?payment_intent=${topupPi}&limit=1`)).data[0];
  assert(dispute, "no dispute found on the charge");
  const form = new URLSearchParams({ submit: "true" });
  form.set("evidence[uncategorized_text]", "winning_evidence");
  await api("POST", `disputes/${dispute.id}`, form);

  const won = await until("funds_reinstated to unwind both halves", (x) => x.owed === 0, 120_000);
  assert(won.credits === 500, `credits=${won.credits}, expected 500 — exactly what was taken, not the whole grant`);
  return `withdrawn: 500->0 owed=1500;  won: credits->500 owed->0`;
});

// ---- #230 pro-rate ---------------------------------------------------------------
await step("prorate", async () => {
  // Stripe cannot emit a partial dispute in test mode at all — no create
  // endpoint, no amount param, no test helper. The denominator lives in OUR
  // table though, so a full-amount dispute against a receipt that records a
  // LARGER amountPaidCents exercises the real pro-rate branch with a 100% real
  // Stripe dispute event.
  //
  // This cannot reuse the dispute above by resending its event: applyOnce's
  // EVENT# leg correctly refuses a duplicate id, so a resend is a no-op by
  // design (that is what the `replay` step proves). It needs its own charge.
  seedWallet({ credits: 2000, clawbackOwedCredits: 0 });
  const pi = await disputedCharge({ amountCents: 2000, purchasedCredits: 2000, amountPaidCents: 8000 });

  const w = await until("the pro-rated clawback", (x) => x.credits < 2000, 120_000);
  const taken = 2000 - w.credits;
  assert(taken === 500, `pro-rated clawback took ${taken}, expected 500 (2000c of 8000c = 25% of 2000 credits)`);
  assert(w.owed === 0, `owed=${w.owed}, expected 0 — the balance covered a pro-rated clawback`);
  return `2000c against an 8000c receipt = 25% -> 500 credits, not 2000  (${pi})`;
});

// ---- replay (idempotency) ---------------------------------------------------------
//
// This is the one step whose assertion is a NEGATIVE — the wallet must not move
// — so it needs a positive control or it passes for all the wrong reasons: a
// redelivery that never landed, a CLI that is not installed, an event that
// belongs to another run, a resend routed to a different endpoint. Each of those
// also leaves the wallet unchanged.
await step("replay", async () => {
  assert(grantEventId, "no invoice.paid event from the grant step — run replay with grant enabled");
  // Control 1: the handler has demonstrably processed THIS event id already, so
  // a duplicate of it has to reach applyOnce's EVENT# leg.
  assert(
    eventRow(grantEventId),
    `no EVENT# row for ${grantEventId} — the handler never recorded the original delivery, so a redelivery proves nothing`
  );
  const endpointId = webhookEndpoint ?? (await soleEnabledEndpoint());
  const before = wallet();

  const r = spawnSync(
    "stripe",
    ["events", "resend", grantEventId, "--api-key", key, "--webhook-endpoint", endpointId],
    { encoding: "utf8" }
  );
  // A missing CLI lands in r.error, not r.stderr — which is why the old failure
  // message read "failed: undefined".
  assert(!r.error, `stripe events resend could not run: ${r.error.message}`);
  assert(r.status === 0, `stripe events resend failed: ${(r.stderr || r.stdout || "").slice(0, 200)}`);

  // Control 2: the redelivery is observed leaving Stripe before the negative is
  // asserted. Timing out here is a FAILED step, not a pass.
  assert(await untilRedelivered(grantEventId), `no redelivery of ${grantEventId} was ever observed leaving Stripe`);
  await new Promise((res) => setTimeout(res, 2000)); // let the handler's writes settle

  const after = wallet();
  assert(
    after.credits === before.credits && after.owed === before.owed,
    `replay moved the wallet: ${JSON.stringify(before)} -> ${JSON.stringify(after)} — EVENT# idempotency leg failed`
  );
  return `${grantEventId} redelivered to ${endpointId}; wallet unchanged`;
});

// ---- teardown ----------------------------------------------------------------------
if (!keep) {
  for (const id of created.clocks) await api("DELETE", `test_helpers/test_clocks/${id}`).catch(() => {});
  for (const id of created.subs) await api("DELETE", `subscriptions/${id}`).catch(() => {});
  for (const id of created.customers) await api("DELETE", `customers/${id}`).catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n  ${results.length - failed.length}/${results.length} steps passed` +
    (keep ? "  (objects kept)" : "  (sandbox objects cleaned up)") + "\n"
);
process.exit(failed.length ? 1 : 0);
