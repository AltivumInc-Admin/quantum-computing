// The shared Stripe-script preamble, exercised with no network and no AWS.
//
// The identity gate in particular: it is the only thing standing between these
// scripts and the wrong Stripe account, this owner's login controls three, and
// every `stripe` CLI profile on this machine points at the wrong one.
import test from "node:test";
import assert from "node:assert/strict";
import { assertAccount, parseArgs, stripeClient } from "./lib/preamble.mjs";

const okResponse = (body) => ({ json: async () => body });

test("parseArgs reads values, presence, and repeated flags", () => {
  const { flag, has, all } = parseArgs([
    "--expect-account", "live",
    "--expect-url", "https://a.example/webhook",
    "--expect-url", "https://b.example/webhook",
    "--json",
  ]);
  assert.equal(flag("--expect-account"), "live");
  assert.equal(flag("--missing"), undefined);
  assert.equal(flag("--missing", "fallback"), "fallback");
  assert.equal(has("--json"), true);
  assert.equal(has("--dry-run"), false);
  assert.deepEqual(all("--expect-url"), ["https://a.example/webhook", "https://b.example/webhook"]);
  assert.deepEqual(all("--nothing"), []);
});

test("a trailing repeatable flag with no value is ignored, not read as undefined", () => {
  const { all } = parseArgs(["--expect-url"]);
  assert.deepEqual(all("--expect-url"), []);
});

test("the client authenticates with the key and surfaces Stripe's own error text", async () => {
  const seen = [];
  const client = stripeClient("sk_test_abc", {
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return okResponse({ error: { message: "No such price: 'ql_plus_monthly'" } });
    },
  });
  await assert.rejects(() => client.get("prices?limit=1"), /No such price/);
  assert.equal(seen[0].url, "https://api.stripe.com/v1/prices?limit=1");
  assert.equal(seen[0].init.headers.Authorization, `Basic ${Buffer.from("sk_test_abc:").toString("base64")}`);
});

test("a form body is urlencoded, whether given as an object or URLSearchParams", async () => {
  const seen = [];
  const client = stripeClient("sk_test_abc", {
    fetchImpl: async (url, init) => {
      seen.push(init);
      return okResponse({ id: "we_1" });
    },
  });
  await client.post("webhook_endpoints", { url: "https://x.example/webhook" });
  await client.post("webhook_endpoints", new URLSearchParams({ url: "https://y.example/webhook" }));
  assert.equal(seen[0].headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(seen[0].body, "url=https%3A%2F%2Fx.example%2Fwebhook");
  assert.equal(seen[1].body, "url=https%3A%2F%2Fy.example%2Fwebhook");
});

test("key mode is read from the key, because the account id cannot say", () => {
  // A standard Stripe account returns the SAME acct_ for its test and live keys.
  assert.equal(stripeClient("sk_live_x").mode, "live");
  assert.equal(stripeClient("rk_live_x").mode, "live");
  assert.equal(stripeClient("sk_test_x").mode, "test/sandbox");
});

test("assertAccount returns the account when it matches", async () => {
  const client = { get: async () => ({ id: "acct_expected", settings: { dashboard: { display_name: "QL" } } }) };
  const account = await assertAccount(client, "acct_expected");
  assert.equal(account.id, "acct_expected");
});

test("assertAccount refuses a different account, naming both and the refusal", async () => {
  const client = { get: async () => ({ id: "acct_other", settings: { dashboard: { display_name: "Altivum Logic" } } }) };
  await assert.rejects(
    () => assertAccount(client, "acct_expected", "Refusing to write."),
    /WRONG ACCOUNT.*acct_other.*Altivum Logic.*acct_expected.*Refusing to write\./s
  );
});

test("assertAccount survives an account with no dashboard display name", async () => {
  const client = { get: async () => ({ id: "acct_other" }) };
  await assert.rejects(() => assertAccount(client, "acct_expected"), /acct_other \(\?\)/);
});
