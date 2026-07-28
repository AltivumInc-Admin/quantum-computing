/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, act } from "@testing-library/react";

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

import AmplifyAuthBridge from "@/components/auth/amplify-auth-bridge";

function setup() {
  const onStatus = jest.fn();
  const onEmail = jest.fn();
  let registered: () => Promise<void> = async () => {};
  const registerSignOut = jest.fn((fn: () => Promise<void>) => {
    registered = fn;
  });
  const view = render(
    <AmplifyAuthBridge onStatus={onStatus} onEmail={onEmail} registerSignOut={registerSignOut} />
  );
  return { onStatus, onEmail, registerSignOut, getRegistered: () => registered, view };
}

const lastStatus = (m: jest.Mock) => m.mock.calls.at(-1)?.[0];
const lastEmail = (m: jest.Mock) => m.mock.calls.at(-1)?.[0];

describe("AmplifyAuthBridge", () => {
  beforeEach(() => {
    hubCb = null;
    configure.mockClear();
    setKeyValueStorage.mockClear();
    hubUnsub.mockClear();
    getCurrentUser.mockReset();
    fetchAuthSession.mockReset();
    amplifySignOut.mockReset();
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
  });

  it("resolves unauthenticated when there is no current user", async () => {
    getCurrentUser.mockRejectedValue(new Error("no user"));
    let h!: ReturnType<typeof setup>;
    await act(async () => {
      h = setup();
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");
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

    await act(async () => {
      hubCb!({ payload: { event: "signedOut" } });
    });
    expect(lastStatus(h.onStatus)).toBe("unauthenticated");
    expect(lastEmail(h.onEmail)).toBe(null);
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
