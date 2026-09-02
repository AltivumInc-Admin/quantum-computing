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
 * A Stripe REST client over plain fetch. No SDK: these scripts must run under
 * plain node with no build step and no node_modules, because they are called
 * from CI and from the runbook.
 */
export function stripeClient(key, { fetchImpl = fetch } = {}) {
  const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

  async function request(method, path, form) {
    const init = { method, headers: { Authorization: auth } };
    if (form) {
      init.headers["Content-Type"] = "application/x-www-form-urlencoded";
      init.body = form instanceof URLSearchParams ? form.toString() : new URLSearchParams(form).toString();
    }
    const res = await fetchImpl(`https://api.stripe.com/v1/${path}`, init);
    const body = await res.json();
    if (body?.error) throw new Error(`${method} ${path}: ${body.error.message}`);
    return body;
  }

  return {
    request,
    get: (path) => request("GET", path),
    post: (path, form) => request("POST", path, form),
    /** Which half of the account the key addresses. The id alone cannot say. */
    mode: /^(sk|rk)_live_/.test(key) ? "live" : "test/sandbox",
  };
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
