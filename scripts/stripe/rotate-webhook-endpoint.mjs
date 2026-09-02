#!/usr/bin/env node
/**
 * Recreate a Stripe webhook endpoint with the full required event set and a
 * pinned API version, rotate its signing secret into Secrets Manager, recycle
 * the function, and PROVE the new secret is live before retiring the old
 * endpoint.
 *
 * `api_version` is creation-only, so repinning is always delete-and-recreate,
 * and a recreate always mints a new signing secret. That makes this a rotation
 * whether you wanted one or not.
 *
 * THE STEP EVERYONE MISSES, and the reason this is a script and not a runbook
 * paragraph: a warm Lambda caches the signing secret at cold start. Rotating the
 * secret in Secrets Manager does nothing to a running container — it keeps
 * verifying against the OLD secret and rejecting every delivery with a 400.
 * Verified in the sandbox on 2026-08-17: 24 invocations, 2-38ms each, wallet
 * untouched, and (before SIGNATURE_REJECTED existed) not one log line. So this
 * script forces an `update-function-configuration` and then sends a genuinely
 * signed probe, refusing to retire the old endpoint until that probe returns 2xx.
 *
 * The probe is a synthetic event of an unhandled type. It reaches the handler's
 * `default` branch, which matches only /^(charge|refund|payout|radar)\./ and so
 * returns 200 silently. Nothing is written, no money moves — it tests exactly one
 * thing: does the deployed function verify a signature made with the new secret.
 *
 * The signing secret is never printed, never in argv, never on disk. It exists
 * only inside this process and inside the `aws` child it is piped to.
 *
 *   STRIPE_API_KEY=$(op read "op://Quantum Learner/Stripe/add more/Secret Key") \
 *     node scripts/stripe/rotate-webhook-endpoint.mjs \
 *       --expect-account live \
 *       --url https://bfiloz43aa.execute-api.us-east-2.amazonaws.com/webhook \
 *       --secret-id quantum-stripe \
 *       --function quantum-stripe \
 *       --confirm-live
 *
 * --confirm-live is mandatory for any sk_live_ key. Sandbox needs no such flag.
 *
 * THE OTHER HALF OF THE SECRET. Secrets Manager holds {secretKey, webhookSecret},
 * so this rotation rewrites the API key too. It stores STRIPE_API_KEY — the key
 * GET /v1/account just proved belongs to --expect-account — and nothing else, the
 * same thing provision-sandbox.mjs does. It used to shell out to `op read` for a
 * SECOND key with no identity check at all, defaulted to the LIVE 1Password item;
 * a sandbox rotation therefore wrote the LIVE key into the sandbox function's
 * secret, after which the sandbox Lambda would create real customers and real
 * charges on the live account, invisibly to every offline guard.
 *
 * --secret-key-ref <op://...> overrides it, for an operator driving the rotation
 * with a restricted key. The override is read and VERIFIED (right account, right
 * mode, a full sk_ key) BEFORE the replacement endpoint is minted, because the
 * signing secret is returned only at creation: aborting after that point loses it.
 */
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { REQUIRED_WEBHOOK_EVENTS, STRIPE_API_VERSION } from "../../lambda/stripe/catalog.mjs";
import { resolveAccount } from "./lib/accounts.mjs";
import { assertAccount, die, parseArgs, putSecretJson, stripeClient } from "./lib/preamble.mjs";

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
const url = flag("--url");
const secretId = flag("--secret-id");
const fnName = flag("--function");
const region = flag("--region") ?? "us-east-2";
// No default: an unnamed ref used to mean the LIVE 1Password item, on every
// path including the sandbox one.
const secretKeyRef = flag("--secret-key-ref");
const confirmLive = has("--confirm-live");

if (!key) die(2, "STRIPE_API_KEY is not set. Pass it by environment, never as an argument.");
for (const [v, n] of [[expectAccount, "--expect-account"], [url, "--url"], [secretId, "--secret-id"], [fnName, "--function"]]) {
  if (!v) die(2, `${n} is required.`);
}
const isLive = /^(sk|rk)_live_/.test(key);
if (isLive && !confirmLive) die(2, "That is a LIVE key. Re-run with --confirm-live if you mean it.");

const client = stripeClient(key);
const api = (method, path, form) => client.request(method, path, form);

const say = (verb, what) => console.log(`  ${verb.padEnd(9)} ${what}`);

// ---- identity, before anything ---------------------------------------------------
const account = await assertAccount(client, expectAccount).catch((err) => die(1, err.message));
console.log(
  `\n  Rotating ${account.id} (${account.settings?.dashboard?.display_name ?? "?"})  ${isLive ? "*** LIVE ***" : "[sandbox]"}\n`
);

// The SDK's own pin governs outbound calls; the endpoint pin governs the inbound
// payload shape. They must agree or you debug a difference that does not exist.
// Imported, not scraped out of index.mjs's text by a regex that took the first
// quoted `apiVersion:` it found.
const apiVersion = STRIPE_API_VERSION;

// ---- the API key this rotation will store, resolved and PROVED before any write --
// Ordering is the point: the replacement endpoint returns its signing secret once
// and only at creation, so every reason to abort has to fire before that call.
const handlerKey = await resolveHandlerKey();

async function resolveHandlerKey() {
  if (!secretKeyRef) {
    // STRIPE_API_KEY already proved, above, that it belongs to expectAccount.
    if (!/^sk_/.test(key)) {
      die(
        2,
        "STRIPE_API_KEY is not a full secret key (sk_), so it cannot be what the deployed function " +
          "authenticates to Stripe with. Pass --secret-key-ref <op://...> naming the key to store."
      );
    }
    return key;
  }
  const read = spawnSync("op", ["read", secretKeyRef], { encoding: "utf8" });
  if (read.status !== 0 || !read.stdout.trim()) die(1, `could not read ${secretKeyRef} from 1Password`);
  const candidate = read.stdout.trim();
  if (!/^sk_/.test(candidate)) die(1, `${secretKeyRef} is not a full Stripe secret key (sk_).`);
  if (/^sk_live_/.test(candidate) !== isLive) {
    die(1, `${secretKeyRef} is a ${/^sk_live_/.test(candidate) ? "LIVE" : "test"} key; this rotation is ${isLive ? "LIVE" : "sandbox"}.`);
  }
  // Identity is asserted for this key too, not inherited from the other one.
  const who = await assertAccount(stripeClient(candidate), expectAccount, `Refusing to store ${secretKeyRef}.`).catch(
    (err) => die(1, err.message)
  );
  say("verified", `${secretKeyRef} -> ${who.id}`);
  return candidate;
}

const required = [...REQUIRED_WEBHOOK_EVENTS].sort();
const endpoints = await client.listAll("webhook_endpoints");
const old = endpoints.find((e) => e.url === url && e.status === "enabled");
say("found", old ? `${old.id} (${old.enabled_events.length} events, api_version ${old.api_version ?? "NULL"})` : "no existing endpoint at that url");

// ---- create the replacement (both coexist; nothing is lost yet) --------------------
const form = new URLSearchParams({ url, api_version: apiVersion, description: "quantum-stripe (rotate-webhook-endpoint.mjs)" });
for (const e of required) form.append("enabled_events[]", e);
const created = await api("POST", "webhook_endpoints", form);
if (!created.secret) die(1, "Stripe returned no signing secret on create; aborting before anything is retired.");
say("created", `${created.id} (${required.length} events, pinned ${created.api_version})`);

// ---- store both halves of the secret ----------------------------------------------
// Deliberately NOT `get-secret-value`: the existing secret is never read. The API
// key half is the one verified above, the webhook half comes from the create
// response. Neither is ever printed.
await putSecretJson({ secretId, region, payload: { secretKey: handlerKey, webhookSecret: created.secret } });
say("stored", `signing secret -> secretsmanager:${secretId} (never printed)`);

// ---- recycle warm containers -------------------------------------------------------
const upd = spawnSync(
  "aws",
  ["lambda", "update-function-configuration", "--region", region, "--function-name", fnName,
   "--description", `webhook secret rotated ${new Date().toISOString()}`, "--output", "text", "--query", "LastModified"],
  { encoding: "utf8" }
);
if (upd.status !== 0) die(1, `could not recycle ${fnName}: ${upd.stderr}`);
spawnSync("aws", ["lambda", "wait", "function-updated", "--region", region, "--function-name", fnName]);
say("recycled", `${fnName} — warm containers hold the OLD secret until this happens`);

// ---- prove the new secret is actually in force -------------------------------------
// A real Stripe signature over a synthetic, unhandled event. 200 means the
// deployed function verified against the secret we just stored.
async function probe() {
  const body = JSON.stringify({
    id: `evt_rotation_probe_${Date.now()}`,
    object: "event",
    type: "rotation.probe",
    api_version: apiVersion,
    data: { object: {} },
  });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", created.secret).update(`${t}.${body}`).digest("hex");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${t},v1=${sig}` },
    body,
  });
  return { status: res.status, text: (await res.text()).slice(0, 120) };
}

let ok = null;
for (let attempt = 1; attempt <= 6; attempt++) {
  const r = await probe();
  if (r.status >= 200 && r.status < 300) {
    ok = r;
    break;
  }
  say("probe", `attempt ${attempt}: HTTP ${r.status} ${r.text}`);
  await new Promise((r2) => setTimeout(r2, 5000));
}
if (!ok) {
  console.error(
    `\n  PROBE FAILED. The function is NOT verifying against the new secret.\n` +
      `  The OLD endpoint (${old?.id ?? "n/a"}) has deliberately been left ENABLED, so nothing is lost.\n` +
      `  Investigate, then re-run. Do not disable the old endpoint by hand.\n`
  );
  process.exit(1);
}
say("probe", `HTTP ${ok.status} — the deployed function verifies the new secret`);

// ---- only now retire the old one ---------------------------------------------------
if (old) {
  // Disabled, not deleted: rollback is a single toggle in the Dashboard.
  await api("POST", `webhook_endpoints/${old.id}`, new URLSearchParams({ disabled: "true" }));
  say("disabled", `${old.id} (kept, not deleted — rollback is one toggle)`);
}

console.log(`\n  Rotation complete. Verify with:`);
console.log(`    make stripe-parity ACCOUNT=${account.id}\n`);
