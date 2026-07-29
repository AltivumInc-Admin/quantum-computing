/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, act, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { TextEncoder, TextDecoder } from "node:util";

// jsdom does not implement crypto.subtle (or, in this jsdom version, TextEncoder)
// by default; hydrate() now awaits hashEmail (Web Crypto SHA-256 over UTF-8
// bytes), so the real digest needs both. Without this polyfill hashEmail throws
// inside hydrate()'s try block and the whole hydrate reports "unauthenticated" —
// a test-environment artifact, not a real bridge bug (both APIs are universal in
// evergreen browsers on the HTTPS-only origin this ships to).
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
if (typeof globalThis.TextEncoder === "undefined") {
  Object.defineProperty(globalThis, "TextEncoder", { value: TextEncoder, configurable: true });
}
if (typeof globalThis.TextDecoder === "undefined") {
  Object.defineProperty(globalThis, "TextDecoder", { value: TextDecoder, configurable: true });
}

const configure = jest.fn();
jest.mock("aws-amplify", () => ({ Amplify: { configure: (...a: unknown[]) => configure(...a) } }));

let hubCb: ((p: { payload: { event: string } }) => void) | null = null;
const hubUnsub = jest.fn();
const tokenStorage = { sentinel: "session-storage" };
jest.mock("aws-amplify/utils", () => ({
  Hub: {
    listen: (_c: string, cb: (p: { payload: { event: string } }) => void) => {
      hubCb = cb;
      return hubUnsub;
    },
  },
  sessionStorage: tokenStorage,
}));

const setKeyValueStorage = jest.fn();
jest.mock("aws-amplify/auth/cognito", () => ({
  cognitoUserPoolsTokenProvider: {
    setKeyValueStorage: (...a: unknown[]) => setKeyValueStorage(...a),
  },
}));

const getCurrentUser = jest.fn();
const fetchAuthSession = jest.fn();
const amplifySignOut = jest.fn();
jest.mock("aws-amplify/auth", () => ({
  getCurrentUser: () => getCurrentUser(),
  fetchAuthSession: () => fetchAuthSession(),
  signOut: () => amplifySignOut(),
}));

/** A session whose ID token carries the given email claim — the shape BOTH a
 *  native-SRP and a Google-federated sign-in produce. */
const sessionWithEmail = (email: string) => ({
  tokens: { idToken: { payload: { email } } },
});

jest.mock("@/lib/auth-config", () => ({ amplifyAuthConfig: () => ({ Auth: { Cognito: {} } }) }));

// hashEmail stays real by default (the digest is deterministic and near-instant),
// but wrapped in a jest.fn so one test can control exactly when it settles — that
// is the only way to prove the seq-guard around its `await` actually fires.
const actualFoundingTen = jest.requireActual("@/lib/founding-ten") as typeof import("@/lib/founding-ten");
jest.mock("@/lib/founding-ten", () => {
  const actual = jest.requireActual("@/lib/founding-ten");
  return { ...actual, hashEmail: jest.fn(actual.hashEmail) };
});

import AmplifyAuthBridge from "@/components/auth/amplify-auth-bridge";
import { hashEmail } from "@/lib/founding-ten";

function setup() {
  const onStatus = jest.fn();
  const onEmail = jest.fn();
  const onEmailHash = jest.fn();
  let registered: () => Promise<void> = async () => {};
  const registerSignOut = jest.fn((fn: () => Promise<void>) => {
    registered = fn;
  });
  const view = render(
    <AmplifyAuthBridge
      onStatus={onStatus}
      onEmail={onEmail}
      onEmailHash={onEmailHash}
      registerSignOut={registerSignOut}
    />
  );
  return { onStatus, onEmail, onEmailHash, registerSignOut, getRegistered: () => registered, view };
}

const lastStatus = (m: jest.Mock) => m.mock.calls.at(-1)?.[0];
const lastEmail = (m: jest.Mock) => m.mock.calls.at(-1)?.[0];
const lastEmailHash = (m: jest.Mock) => m.mock.calls.at(-1)?.[0];

describe("AmplifyAuthBridge", () => {
  beforeEach(() => {
    hubCb = null;
    configure.mockClear();
    setKeyValueStorage.mockClear();
    hubUnsub.mockClear();
    getCurrentUser.mockReset();
    fetchAuthSession.mockReset();
    amplifySignOut.mockReset();
    (hashEmail as jest.Mock).mockReset().mockImplementation(actualFoundingTen.hashEmail);
  });

  it("configures Amplify and scopes Cognito tokens to sessionStorage", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchAuthSession.mockResolvedValue(sessionWithEmail("a@b.com"));
    await act(async () => {
      setup();
    });
    expect(configure).toHaveBeenCalledTimes(1);
    expect(setKeyValueStorage).toHaveBeenCalledWith(tokenStorage);
    // Lock the security-critical order: configure -> scope storage -> first token read,
    // so a future reorder that lets a token op run before sessionStorage is scoped
    // (re-leaking refresh tokens to localStorage) fails CI.
    expect(configure.mock.invocationCallOrder[0]).toBeLessThan(
      setKeyValueStorage.mock.invocationCallOrder[0]
    );
    expect(setKeyValueStorage.mock.invocationCallOrder[0]).toBeLessThan(
      getCurrentUser.mock.invocationCallOrder[0]
    );
  });

  it("hydrates to authenticated with the user email", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchAuthSession.mockResolvedValue(sessionWithEmail("a@b.com"));
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    expect(lastStatus(h.onStatus)).toBe("authenticated");
    expect(lastEmail(h.onEmail)).toBe("a@b.com");
    // The hash is a THIRD await inside hydrate() (getCurrentUser, fetchAuthSession,
    // then the real Web Crypto digest) — unlike the mocked promises above, a real
    // crypto.subtle.digest can settle a tick later than the one `act()` flush this
    // test already performed, so this one assertion needs to poll rather than
    // assume it landed synchronously with status/email.
    const expectedHash = await hashEmail("a@b.com");
    await waitFor(() => expect(lastEmailHash(h.onEmailHash)).toBe(expectedHash));
  });

  // THE SAME BUG CLASS as the 2026-07-28 outage just below, one call later. There
  // it was fetchUserAttributes throwing inside hydrate's try and getting reported
  // as "unauthenticated" even though the session was genuinely live. hashEmail is
  // the same shape of secondary call — cosmetic, badge-only — and crypto.subtle
  // can genuinely be unavailable (insecure context, embedded webview, a hardened
  // enterprise browser) or the digest can simply reject. A rejection there must
  // degrade to "no badge", never propagate to hydrate's catch and flip a real
  // session (and, via setCurrentOwner(null) in that catch, the local progress
  // bucket) to signed-out.
  it("a REJECTING hashEmail must never speak for auth — status stays authenticated, only the badge disappears", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchAuthSession.mockResolvedValue(sessionWithEmail("a@b.com"));
    (hashEmail as jest.Mock).mockRejectedValueOnce(new Error("crypto.subtle unavailable"));
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    expect(lastStatus(h.onStatus)).toBe("authenticated");
    expect(lastEmail(h.onEmail)).toBe("a@b.com");
    await waitFor(() => expect(lastEmailHash(h.onEmailHash)).toBe(null));
    // The rejection must not have been swallowed by hydrate's OUTER catch: if it
    // had, this second, later assertion would see the status flipped back.
    expect(lastStatus(h.onStatus)).toBe("authenticated");
  });

  // THE 2026-07-28 OUTAGE, pinned. The old hydrate called fetchUserAttributes,
  // which is a GetUser network call requiring the aws.cognito.signin.user.admin
  // scope — a scope Google-federated (hosted-UI) access tokens do not carry, so
  // every Google sign-in exchanged tokens successfully and was then reported
  // "unauthenticated" (three cognito-idp 400s, a 15s hang, and a "didn't
  // complete" banner — with a live session squatting in sessionStorage). Hydrate
  // must therefore never depend on a scope-gated attributes API: the email comes
  // from the ID token's claim, which both token kinds carry.
  it("never calls a scope-gated attributes API — a session alone authenticates (the Google-token outage)", async () => {
    getCurrentUser.mockResolvedValue({ userId: "google_123" });
    fetchAuthSession.mockResolvedValue(sessionWithEmail("gadiel@example.com"));
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    expect(lastStatus(h.onStatus)).toBe("authenticated");
    expect(lastEmail(h.onEmail)).toBe("gadiel@example.com");
  });

  it("still authenticates (email null) when the session has no readable email claim", async () => {
    // A malformed/empty payload must degrade to a nameless session, never to
    // "unauthenticated" — that lie is exactly what locked Google users out.
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchAuthSession.mockResolvedValue({ tokens: { idToken: { payload: {} } } });
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    expect(lastStatus(h.onStatus)).toBe("authenticated");
    expect(lastEmail(h.onEmail)).toBe(null);
    // No email claim means no badge lookup is even possible.
    expect(lastEmailHash(h.onEmailHash)).toBe(null);
  });

  it("resolves unauthenticated when there is no current user", async () => {
    getCurrentUser.mockRejectedValue(new Error("no user"));
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");
    expect(lastEmailHash(h.onEmailHash)).toBe(null);
  });

  it("re-hydrates on signedIn and clears on signedOut", async () => {
    getCurrentUser.mockRejectedValueOnce(new Error("no user")); // mount: unauthenticated
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");

    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchAuthSession.mockResolvedValue(sessionWithEmail("c@d.com"));
    await act(async () => {
      hubCb!({ payload: { event: "signedIn" } });
    });
    expect(lastStatus(h.onStatus)).toBe("authenticated");
    expect(lastEmail(h.onEmail)).toBe("c@d.com");
    const expectedHash = await hashEmail("c@d.com");
    await waitFor(() => expect(lastEmailHash(h.onEmailHash)).toBe(expectedHash));

    await act(async () => {
      hubCb!({ payload: { event: "signedOut" } });
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");
    expect(lastEmail(h.onEmail)).toBe(null);
    expect(lastEmailHash(h.onEmailHash)).toBe(null);
  });

  it("clears authenticated state on a tokenRefresh_failure event", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchAuthSession.mockResolvedValue(sessionWithEmail("a@b.com"));
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    expect(lastStatus(h.onStatus)).toBe("authenticated");
    await act(async () => {
      hubCb!({ payload: { event: "tokenRefresh_failure" } });
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");
    expect(lastEmail(h.onEmail)).toBe(null);
    expect(lastEmailHash(h.onEmailHash)).toBe(null);
  });

  it("a signedIn hydrate resolving after signedOut does not clobber the signed-out state", async () => {
    getCurrentUser.mockRejectedValueOnce(new Error("no user"));
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");

    let release: (v: unknown) => void = () => {};
    getCurrentUser.mockReturnValueOnce(
      new Promise((res) => {
        release = res;
      })
    );
    fetchAuthSession.mockResolvedValue(sessionWithEmail("late@x.com"));

    await act(async () => {
      hubCb!({ payload: { event: "signedIn" } });
    });
    await act(async () => {
      hubCb!({ payload: { event: "signedOut" } });
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");

    await act(async () => {
      release({ userId: "u1" });
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");
    expect(lastEmailHash(h.onEmailHash)).toBe(null);
  });

  // The hash adds a SECOND await inside hydrate() (getCurrentUser/fetchAuthSession,
  // then hashEmail), so the seq guard has to hold across it too, independently of
  // the first check. Here hydrate clears the FIRST guard (status/email land as
  // "authenticated"/the real address) and only then gets superseded by a sign-out
  // while hashEmail is still resolving — proving the post-await recheck in
  // amplify-auth-bridge.tsx actually fires, not just the one before it.
  it("a hydrate superseded WHILE ITS HASH IS STILL RESOLVING does not clobber the signed-out emailHash", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchAuthSession.mockResolvedValue(sessionWithEmail("late-hash@x.com"));
    let releaseHash: (v: string) => void = () => {};
    (hashEmail as jest.Mock).mockImplementationOnce(
      () => new Promise<string>((res) => { releaseHash = res; })
    );
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    // Status and email already committed. onEmailHash HAS already fired once —
    // Finding 2's pre-await clear — but only with null, to stop a stale prior
    // badge from showing under this new email while the digest is in flight; the
    // real hash for THIS account has not landed yet.
    expect(lastStatus(h.onStatus)).toBe("authenticated");
    expect(lastEmail(h.onEmail)).toBe("late-hash@x.com");
    expect(h.onEmailHash).toHaveBeenCalledTimes(1);
    expect(lastEmailHash(h.onEmailHash)).toBe(null);

    await act(async () => {
      hubCb!({ payload: { event: "signedOut" } });
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");
    expect(lastEmailHash(h.onEmailHash)).toBe(null);

    // The stale hash finally resolves — it must be dropped, not clobber the
    // signed-out null with a hash for an account that is no longer current.
    await act(async () => {
      releaseHash(await actualFoundingTen.hashEmail("late-hash@x.com"));
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");
    expect(lastEmailHash(h.onEmailHash)).toBe(null);
  });

  it("registers a signOut that settles to unauthenticated even when amplify rejects", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchAuthSession.mockResolvedValue(sessionWithEmail("a@b.com"));
    amplifySignOut.mockRejectedValue(new Error("network"));
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    await act(async () => {
      await h.getRegistered()();
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");
    expect(lastEmail(h.onEmail)).toBe(null);
    expect(lastEmailHash(h.onEmailHash)).toBe(null);
  });

  it("unsubscribes the Hub listener on unmount", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchAuthSession.mockResolvedValue(sessionWithEmail("a@b.com"));
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    expect(hubUnsub).not.toHaveBeenCalled();
    h.view.unmount();
    expect(hubUnsub).toHaveBeenCalledTimes(1);
  });
});
