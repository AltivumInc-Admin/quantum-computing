// The Google sign-in deadlock, and why this module exists.
//
// Amplify v6 keeps its OAuth HANDSHAKE state — the in-flight flag, the PKCE
// verifier and the CSRF state — in `localStorage`: `oAuthStore` is constructed
// as `new DefaultOAuthStore(defaultStorage)` and nothing in the public API
// redirects it. `cognitoUserPoolsTokenProvider.setKeyValueStorage(...)` in
// amplify-auth-bridge.tsx moves only the TOKENS, to per-tab sessionStorage.
//
// That split is the bug. The handshake flag is shared by every tab and survives
// a browser restart; the session it refers to is not. And while
// `inflightOAuth === "true"`, Amplify's TokenOrchestrator deliberately blocks
// getCurrentUser() / fetchAuthSession() on a promise with NO timeout and NO
// rejection path — it resolves only when the flow completes or fails.
//
// So one abandoned "Continue with Google" (back button, a closed tab, a second
// tab, a browser restart mid-hop) leaves the flag set forever, and every later
// page load hangs inside the bridge's hydrate(). Observed on production
// 2026-09-03: the callback page sat on "Signing you in…" for its full timeout,
// redirected to /login?error=google, and the user was then immediately signed
// in — because clearing the stale flag is what finally released the blocked
// hydrate. The error and the success were the same event, in that order.
//
// The rule this module encodes: a page that is NOT completing a redirect has no
// business inheriting a handshake. Only the callback carries `code`+`state`
// (success) or `error` (an explicit provider failure Amplify must still handle)
// back from Cognito; anywhere else those keys are debris and are cleared before
// Amplify.configure runs, so the blocking gate is never armed.
//
// Pure and storage-injected so the whole rule is testable without a browser.

/** The three keys Amplify writes for one redirect handshake. */
export const OAUTH_HANDSHAKE_KEYS = [
  "inflightOAuth",
  "oauthPKCE",
  "oauthState",
] as const;

/** Amplify's key shape: `CognitoIdentityServiceProvider.<clientId>.<name>`. */
export function oauthStorageKey(clientId: string, name: string): string {
  return `CognitoIdentityServiceProvider.${clientId}.${name}`;
}

/**
 * Is this URL Cognito handing a redirect back to us?
 *
 * `code`+`state` is the success shape. `error` is the failure shape, and it must
 * count: Amplify needs the in-flight flag intact to run its own failure path
 * (which is what surfaces a real "access denied" to the user). Anything else —
 * a plain page load, a deep link, a refresh after the flow already finished —
 * is not a redirect and must not keep a handshake alive.
 */
export function isOAuthRedirect(search: string): boolean {
  const p = new URLSearchParams(search);
  return (p.has("code") && p.has("state")) || p.has("error");
}

// Where the visitor was actually headed.
//
// The sign-up wall sends a deep-linked visitor to `/login?next=<path>`, but the
// Google hop cannot carry that: the redirect URI registered with Cognito is a
// fixed `/auth/callback`, so the query string is gone by the time we return.
// Stash it in sessionStorage — per-tab, which is exactly the scope of one
// redirect round-trip — and read it once on the way back. Without this, every
// federated sign-in silently lands on /workspace no matter what the learner
// clicked, which is the same "we lost your place" the wall exists to prevent.
export const OAUTH_NEXT_KEY = "qc:oauth:next";

/** Only same-origin absolute paths; never an open redirect. */
export function isSafeNext(path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

/** Minimal storage shape, so tests need no browser and no Amplify. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

/**
 * Drop a handshake this page cannot be part of. Returns the key NAMES cleared
 * (not values — these are CSRF/PKCE secrets) so the caller can log or assert.
 *
 * Safe to call unconditionally on every boot: on a real callback it clears
 * nothing, and when there is no handshake there is nothing to clear.
 */
export function clearStaleOAuthHandshake(
  storage: KeyValueStore,
  clientId: string,
  search: string
): string[] {
  if (isOAuthRedirect(search)) return [];
  const cleared: string[] = [];
  for (const name of OAUTH_HANDSHAKE_KEYS) {
    const key = oauthStorageKey(clientId, name);
    if (storage.getItem(key) === null) continue;
    storage.removeItem(key);
    cleared.push(name);
  }
  return cleared;
}
