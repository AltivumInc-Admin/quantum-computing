/**
 * The scaffolding every script under scripts/stripe/ was carrying privately.
 *
 * Five scripts, five copies of the same argv reader, the same base64 Basic-auth
 * fetch wrapper (named `stripe`, `stripeGet`, `stripeGet`, `api` and `api`), the
 * same die/fail helper, the same "GET /account, compare to --expect-account or
 * refuse" gate, and two byte-identical `aws secretsmanager put-secret-value`
 * spawns. Copies drift, and the drift is silent: the two pricing.ts parsers had
 * already diverged into one that swallowed a parse failure and one that turned it
 * into NaN.
 *
 * Everything here takes its effects by injection (fetch, spawn) so `node --test`
 * can exercise it with no network and no AWS — the same rationale as
 * scripts/changelog/rules.mjs and scripts/founding-credit/issue.mjs, and the same
 * zero-dependency rule: nothing in this directory may need `npm ci` to run.
 */
import { spawn as nodeSpawn } from "node:child_process";

/** argv reader. `flag("--x")` returns the following token; `has("--x")` a boolean. */
export function parseArgs(argv) {
  return {
    flag: (name, fallback) => {
      const i = argv.indexOf(name);
      return i === -1 ? fallback : argv[i + 1];
    },
    has: (name) => argv.includes(name),
    /** Every value of a repeatable flag, in order. */
    all: (name) =>
      argv.reduce((acc, tok, i) => (tok === name && argv[i + 1] !== undefined ? [...acc, argv[i + 1]] : acc), []),
  };
}

/** Print and exit. Exit 2 is a usage error, 1 is a refusal or drift. */
export function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

/**
 * A Stripe API error that carries the HTTP status, so a caller can tell a
 * genuine 404 from a throttle or a gateway page. The old helpers branched only
 * on `body?.error`, which made every failure indistinguishable: a 429 or a 5xx
 * returning a non-JSON body threw a bare SyntaxError out of res.json(), with no
 * status and no body text, and provision-sandbox read any error from its product
 * GET as "not found" and tried to create the product again.
 */
export class StripeHttpError extends Error {
  constructor(message, { status, code, type } = {}) {
    super(message);
    this.name = "StripeHttpError";
    this.status = status;
    this.code = code;
    this.type = type;
  }
}

const RETRYABLE = (status) => status === 429 || (status >= 500 && status < 600);

/**
 * A Stripe REST client over plain fetch. No SDK: these scripts must run under
 * plain node with no build step and no node_modules, because they are called
 * from CI and from the runbook. What the SDK does for you and a hand-rolled
 * fetch does not — status handling, retries with backoff, and following
 * pagination — is done here, once.
 */
export function stripeClient(key, { fetchImpl = fetch, sleepImpl = sleep, retries = 4 } = {}) {
  const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

  async function request(method, path, form) {
    const init = { method, headers: { Authorization: auth } };
    if (form) {
      init.headers["Content-Type"] = "application/x-www-form-urlencoded";
      init.body = form instanceof URLSearchParams ? form.toString() : new URLSearchParams(form).toString();
    }

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleepImpl(backoffMs(lastError?.retryAfter, attempt));

      let res;
      try {
        res = await fetchImpl(`https://api.stripe.com/v1/${path}`, init);
      } catch (err) {
        // A transport fault. Retry — but never a write, where a retry could
        // duplicate an object Stripe already created.
        lastError = new StripeHttpError(`${method} ${path}: ${err.message}`, {});
        if (method === "GET" && attempt < retries) continue;
        throw lastError;
      }

      const text = await res.text();
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        // A gateway page, not Stripe. Say the status and show the body.
        lastError = withRetryAfter(
          new StripeHttpError(`${method} ${path}: HTTP ${res.status} returned a non-JSON body: ${text.slice(0, 200)}`, {
            status: res.status,
          }),
          res
        );
        if (RETRYABLE(res.status) && attempt < retries) continue;
        throw lastError;
      }

      if (!res.ok || body?.error) {
        const e = body?.error ?? {};
        lastError = withRetryAfter(
          new StripeHttpError(`${method} ${path}: HTTP ${res.status} ${e.message ?? text.slice(0, 200)}`, {
            status: res.status,
            code: e.code,
            type: e.type,
          }),
          res
        );
        if (RETRYABLE(res.status) && attempt < retries) continue;
        throw lastError;
      }

      return body;
    }
    throw lastError;
  }

  /**
   * Every page of a list, not just the first.
   *
   * `limit=100` and a bare read of `data` audits a truncated view on any account
   * with more than a page of objects — and custom top-ups mint a lookup_key-less
   * active Price per purchase, competing for the same 100 slots. A key that fell
   * off the page was then reported as `no ACTIVE price with this lookup_key`, a
   * false drift verdict on the exact surface these guards police, and
   * provision-sandbox would mint a duplicate and transfer the lookup key off a
   * price it could not see.
   */
  async function listAll(path, { limit = 100, maxPages = 100 } = {}) {
    const out = [];
    let startingAfter;
    for (let page = 0; page < maxPages; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const after = startingAfter ? `&starting_after=${startingAfter}` : "";
      const body = await request("GET", `${path}${sep}limit=${limit}${after}`);
      const data = body.data ?? [];
      out.push(...data);
      if (!body.has_more || data.length === 0) return out;
      startingAfter = data[data.length - 1].id;
    }
    throw new StripeHttpError(`${path}: more than ${maxPages} pages; refusing to keep listing`, {});
  }

  return {
    request,
    get: (path) => request("GET", path),
    post: (path, form) => request("POST", path, form),
    listAll,
    /** Which half of the account the key addresses. The id alone cannot say. */
    mode: /^(sk|rk)_live_/.test(key) ? "live" : "test/sandbox",
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Stripe's own Retry-After when it sends one; exponential backoff otherwise. */
function backoffMs(retryAfterSeconds, attempt) {
  if (Number.isFinite(retryAfterSeconds)) return Math.min(retryAfterSeconds * 1000, 30_000);
  return Math.min(500 * 2 ** (attempt - 1), 8_000);
}

function withRetryAfter(err, res) {
  const header = res.headers?.get?.("retry-after");
  const seconds = header === null || header === undefined ? NaN : Number(header);
  if (Number.isFinite(seconds)) err.retryAfter = seconds;
  return err;
}

/**
 * Identity, before anything else. This owner's Stripe login also controls
 * Altivum Logic and Tj-Scents, and every `stripe` CLI profile on this machine
 * points at the wrong one, so identity is asserted and never inferred.
 *
 * Throws rather than exiting, so the caller decides the exit code and the
 * refusal wording ("Refusing to continue" for a read, "Refusing to write" for a
 * write) — and so a test can drive it with a stubbed client.
 */
export async function assertAccount(client, expectAccount, refusal = "Refusing to continue.") {
  const account = await client.get("account");
  if (account.id !== expectAccount) {
    throw new Error(
      `WRONG ACCOUNT: key belongs to ${account.id} (${account.settings?.dashboard?.display_name ?? "?"}), ` +
        `expected ${expectAccount}. ${refusal}`
    );
  }
  return account;
}

/**
 * Write a JSON secret to Secrets Manager, piped on stdin.
 *
 * `--secret-string file:///dev/stdin` is the point: the value never reaches
 * argv, never reaches shell history, and never touches disk. It exists only in
 * this process and in the `aws` child it is handed to.
 */
export function putSecretJson({ secretId, region, payload, spawnImpl = nodeSpawn }) {
  return new Promise((resolve, reject) => {
    const p = spawnImpl(
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
    p.stdin.end(typeof payload === "string" ? payload : JSON.stringify(payload));
  });
}
