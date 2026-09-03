/**
 * The stale-handshake rule that fixes the Google sign-in deadlock.
 *
 * The bug these pin: Amplify keeps `inflightOAuth` in localStorage (shared by
 * every tab, surviving a browser restart) while this app keeps tokens in
 * sessionStorage, and its TokenOrchestrator blocks getCurrentUser() on an
 * unrejectable, untimed promise for as long as that flag reads "true". One
 * abandoned Google click therefore hung every later page load until the
 * callback page's timeout fired. See lib/oauth-inflight.ts.
 */
import {
  OAUTH_HANDSHAKE_KEYS,
  clearStaleOAuthHandshake,
  isOAuthRedirect,
  oauthStorageKey,
} from "@/lib/oauth-inflight";

const CLIENT = "3lf3h3q67tgcodeso3rvitfufv";

/** A localStorage stand-in that records what was removed. */
function store(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

/** A full handshake, exactly as signInWithRedirect writes it. */
function handshake() {
  return {
    [oauthStorageKey(CLIENT, "inflightOAuth")]: "true",
    [oauthStorageKey(CLIENT, "oauthPKCE")]: "verifier-abc",
    [oauthStorageKey(CLIENT, "oauthState")]: "state-xyz",
    // The persistent "this was an OAuth sign-in" marker is NOT handshake state:
    // Amplify reads it at sign-out to decide on the hosted-UI logout hop.
    [oauthStorageKey(CLIENT, "oauthSignIn")]: "true,false",
    "qc-sync:meta": "{}",
  };
}

describe("isOAuthRedirect", () => {
  it("recognizes the success shape (code + state)", () => {
    expect(isOAuthRedirect("?code=abc&state=xyz")).toBe(true);
  });

  it("recognizes the provider-failure shape (error), which Amplify must still handle", () => {
    expect(isOAuthRedirect("?error=access_denied&error_description=nope")).toBe(true);
  });

  it("rejects a half-shape, which cannot complete an exchange", () => {
    expect(isOAuthRedirect("?code=abc")).toBe(false);
    expect(isOAuthRedirect("?state=xyz")).toBe(false);
  });

  it("rejects ordinary page loads", () => {
    expect(isOAuthRedirect("")).toBe(false);
    expect(isOAuthRedirect("?next=%2Freview")).toBe(false);
  });
});

describe("clearStaleOAuthHandshake", () => {
  it("clears a handshake stranded by an abandoned Google click", () => {
    const s = store(handshake());
    expect(clearStaleOAuthHandshake(s, CLIENT, "")).toEqual([...OAUTH_HANDSHAKE_KEYS]);
    for (const name of OAUTH_HANDSHAKE_KEYS) {
      expect(s.getItem(oauthStorageKey(CLIENT, name))).toBeNull();
    }
  });

  it("is what unblocks hydrate: the flag the TokenOrchestrator gates on is gone", () => {
    const s = store(handshake());
    clearStaleOAuthHandshake(s, CLIENT, "");
    expect(s.getItem(oauthStorageKey(CLIENT, "inflightOAuth"))).toBeNull();
  });

  it("leaves a REAL callback untouched, so the token exchange still runs", () => {
    const s = store(handshake());
    expect(clearStaleOAuthHandshake(s, CLIENT, "?code=abc&state=xyz")).toEqual([]);
    expect(s.getItem(oauthStorageKey(CLIENT, "inflightOAuth"))).toBe("true");
    expect(s.getItem(oauthStorageKey(CLIENT, "oauthPKCE"))).toBe("verifier-abc");
    expect(s.getItem(oauthStorageKey(CLIENT, "oauthState"))).toBe("state-xyz");
  });

  it("leaves an explicit provider failure untouched, so Amplify can report it", () => {
    const s = store(handshake());
    expect(clearStaleOAuthHandshake(s, CLIENT, "?error=access_denied")).toEqual([]);
    expect(s.getItem(oauthStorageKey(CLIENT, "inflightOAuth"))).toBe("true");
  });

  it("never touches the sign-out marker or unrelated app keys", () => {
    const s = store(handshake());
    clearStaleOAuthHandshake(s, CLIENT, "");
    expect(s.getItem(oauthStorageKey(CLIENT, "oauthSignIn"))).toBe("true,false");
    expect(s.getItem("qc-sync:meta")).toBe("{}");
  });

  it("is a no-op when there is no handshake, so every boot can call it", () => {
    const s = store({ "qc-sync:meta": "{}" });
    expect(clearStaleOAuthHandshake(s, CLIENT, "")).toEqual([]);
    expect(s.keys()).toEqual(["qc-sync:meta"]);
  });

  it("clears a partial handshake (only the keys actually present)", () => {
    const s = store({ [oauthStorageKey(CLIENT, "inflightOAuth")]: "true" });
    expect(clearStaleOAuthHandshake(s, CLIENT, "")).toEqual(["inflightOAuth"]);
  });

  it("is scoped to one client id, so another pool's keys survive", () => {
    const other = oauthStorageKey("otherclient", "inflightOAuth");
    const s = store({ ...handshake(), [other]: "true" });
    clearStaleOAuthHandshake(s, CLIENT, "");
    expect(s.getItem(other)).toBe("true");
  });

  it("returns only key NAMES, never the PKCE/state secrets", () => {
    const s = store(handshake());
    const cleared = clearStaleOAuthHandshake(s, CLIENT, "");
    expect(cleared.join(" ")).not.toMatch(/verifier-abc|state-xyz/);
  });
});
