/**
 * The Stripe accounts this repo may talk to, in one place.
 *
 * The owner's Stripe login also controls Altivum Logic and Tj-Scents, so every
 * script here asserts identity rather than inferring it. That guard is only as
 * good as the account id an operator is told to pass, and the ids had already
 * drifted: `acct_1TuFpH0a2DloOdGu` was recorded as the sandbox in three places
 * (the Makefile example, provision-sandbox's usage header, CLAUDE.md's
 * sandbox-first rule) long after the account that actually got provisioned was
 * `acct_1U5IQr0txWLZHlL3`. Following any of those documented commands produced
 * a WRONG ACCOUNT refusal, and the natural next move on a guard that looks
 * wrong is to weaken it — the guard standing between a products/prices/webhook
 * write and the wrong Stripe account.
 *
 * So the ids live here, the usage blocks name the ALIAS, and
 * `accounts.test.mjs` fails if the retired id reappears anywhere but the
 * sentence in CLAUDE.md that records it as retired.
 *
 * These are account identifiers, not secrets: they are already published in
 * CLAUDE.md, and a key is still required to do anything with one.
 */

/** Live: charges_enabled, dashboard display name "Quantum Learner". */
export const LIVE_ACCOUNT = "acct_1TuFow07hJdXv6GV";

/** The sandbox that is actually provisioned ("Quantum Learner Sandbox"). */
export const SANDBOX_ACCOUNT = "acct_1U5IQr0txWLZHlL3";

/**
 * Recorded in older docs as the sandbox; never provisioned. Kept so the guard
 * test has something to look for, and so a reader who finds it in an old
 * runbook can tell what it is.
 */
export const RETIRED_ACCOUNTS = ["acct_1TuFpH0a2DloOdGu"];

/** 1Password refs, so a usage block never pairs a key with the wrong account. */
export const KEY_REFS = {
  live: "op://Quantum Learner/Stripe/add more/Secret Key",
  sandbox: "op://Quantum Learner/Stripe Sandbox/Secret Key",
};

const BY_ALIAS = { live: LIVE_ACCOUNT, sandbox: SANDBOX_ACCOUNT };

/**
 * Resolve `--expect-account`. An alias (`live` / `sandbox`) becomes the id
 * recorded above; anything else is returned verbatim, so an explicit `acct_...`
 * still works and a typo still fails closed at the identity check. A retired id
 * is refused outright rather than sent to Stripe: it can only be a copy-paste
 * from a stale doc, and the refusal says which id to use instead.
 */
export function resolveAccount(value) {
  if (!value) return undefined;
  if (value in BY_ALIAS) return BY_ALIAS[value];
  if (RETIRED_ACCOUNTS.includes(value)) {
    throw new Error(
      `${value} is a retired Stripe account id that was never provisioned. ` +
        `The sandbox is ${SANDBOX_ACCOUNT} (or pass the alias "sandbox").`
    );
  }
  return value;
}
