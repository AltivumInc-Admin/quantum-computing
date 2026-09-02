// The shared Stripe-script preamble, exercised with no network and no AWS.
//
// The identity gate in particular: it is the only thing standing between these
// scripts and the wrong Stripe account, this owner's login controls three, and
// every `stripe` CLI profile on this machine points at the wrong one.
import test from "node:test";
import assert from "node:assert/strict";
import { assertAccount, parseArgs, stripeClient, StripeHttpError } from "./lib/preamble.mjs";

/** Enough of a fetch Response for the client: status, ok, text, headers. */
const response = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
});
const okResponse = (body) => response(200, body);
/** Retries are exercised without waiting for them. */
const noSleep = async () => {};

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
    sleepImpl: noSleep,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return response(404, { error: { message: "No such price: 'ql_plus_monthly'", code: "resource_missing" } });
    },
  });
  await assert.rejects(() => client.get("prices?limit=1"), /No such price/);
  assert.equal(seen[0].url, "https://api.stripe.com/v1/prices?limit=1");
  assert.equal(seen[0].init.headers.Authorization, `Basic ${Buffer.from("sk_test_abc:").toString("base64")}`);
});

test("a 404 carries its status, so a caller can tell 'not there' from 'went wrong'", async () => {
  // provision-sandbox swallows this one error and creates the product; every
  // other failure must propagate, or a throttle becomes a create attempt against
  // an id that already exists.
  const client = stripeClient("sk_test_abc", {
    sleepImpl: noSleep,
    fetchImpl: async () => response(404, { error: { message: "No such product", code: "resource_missing" } }),
  });
  const err = await client.get("products/ql_credits").catch((e) => e);
  assert.ok(err instanceof StripeHttpError);
  assert.equal(err.status, 404);
  assert.equal(err.code, "resource_missing");
});

test("a non-JSON gateway page reports its status and its body, not a bare SyntaxError", async () => {
  const client = stripeClient("sk_test_abc", {
    retries: 0,
    sleepImpl: noSleep,
    fetchImpl: async () => response(502, "<html>502 Bad Gateway</html>"),
  });
  const err = await client.get("account").catch((e) => e);
  assert.equal(err.status, 502);
  assert.match(err.message, /HTTP 502 returned a non-JSON body: <html>/);
});

test("a 429 is retried, honouring Retry-After, and then succeeds", async () => {
  const waits = [];
  let calls = 0;
  const client = stripeClient("sk_test_abc", {
    sleepImpl: async (ms) => waits.push(ms),
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? response(429, { error: { message: "Too many requests" } }, { "retry-after": "2" })
        : okResponse({ id: "acct_x" });
    },
  });
  assert.deepEqual(await client.get("account"), { id: "acct_x" });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]);
});

test("a 500 that never clears gives up with the status, not silently", async () => {
  let calls = 0;
  const client = stripeClient("sk_test_abc", {
    retries: 2,
    sleepImpl: noSleep,
    fetchImpl: async () => {
      calls += 1;
      return response(500, { error: { message: "server error" } });
    },
  });
  const err = await client.get("account").catch((e) => e);
  assert.equal(calls, 3); // the first attempt plus two retries
  assert.equal(err.status, 500);
});

test("a 4xx is NOT retried — it will never clear", async () => {
  let calls = 0;
  const client = stripeClient("sk_test_abc", {
    sleepImpl: noSleep,
    fetchImpl: async () => {
      calls += 1;
      return response(401, { error: { message: "Invalid API Key" } });
    },
  });
  await assert.rejects(() => client.get("account"), /Invalid API Key/);
  assert.equal(calls, 1);
});

test("a write is not retried on a transport fault — a retry could duplicate it", async () => {
  let calls = 0;
  const client = stripeClient("sk_test_abc", {
    sleepImpl: noSleep,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("ECONNRESET");
    },
  });
  await assert.rejects(() => client.post("prices", { unit_amount: "1900" }), /ECONNRESET/);
  assert.equal(calls, 1);
});

test("listAll follows has_more instead of auditing a truncated first page", async () => {
  const paths = [];
  const client = stripeClient("sk_test_abc", {
    sleepImpl: noSleep,
    fetchImpl: async (url) => {
      paths.push(url);
      return url.includes("starting_after=price_100")
        ? okResponse({ data: [{ id: "price_101" }], has_more: false })
        : okResponse({ data: [{ id: "price_1" }, { id: "price_100" }], has_more: true });
    },
  });
  const all = await client.listAll("prices?active=true");
  assert.deepEqual(all.map((p) => p.id), ["price_1", "price_100", "price_101"]);
  assert.equal(paths[0], "https://api.stripe.com/v1/prices?active=true&limit=100");
  assert.match(paths[1], /&starting_after=price_100$/);
});

test("listAll refuses to loop forever on an endpoint that always says has_more", async () => {
  const client = stripeClient("sk_test_abc", {
    sleepImpl: noSleep,
    fetchImpl: async () => okResponse({ data: [{ id: "price_1" }], has_more: true }),
  });
  await assert.rejects(() => client.listAll("prices", { maxPages: 3 }), /more than 3 pages/);
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
