"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Amplify } from "aws-amplify";
import { Hub, sessionStorage as amplifyTokenStorage } from "aws-amplify/utils";
import {
  getCurrentUser,
  fetchUserAttributes,
  signOut as amplifySignOut,
} from "aws-amplify/auth";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import { amplifyAuthConfig, isAuthConfigured } from "@/lib/auth-config";

export type AuthStatus =
  | "unconfigured"
  | "configuring"
  | "authenticated"
  | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  email: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: "unconfigured",
  email: null,
  signOut: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isAuthConfigured();
  const [status, setStatus] = useState<AuthStatus>(
    configured ? "configuring" : "unconfigured"
  );
  const [email, setEmail] = useState<string | null>(null);
  // Monotonic guard: every hydrate captures a sequence number and only commits its
  // result if it is still the latest. A sign-out / failure event bumps the counter,
  // so a slow in-flight hydrate can never clobber the newer state (last-write-wins
  // race: a signedIn hydrate resolving after a synchronous signedOut).
  const seqRef = useRef(0);

  const hydrate = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      await getCurrentUser();
      const attrs = await fetchUserAttributes();
      if (seq !== seqRef.current) return; // superseded by a newer hydrate / sign-out
      setEmail(attrs.email ?? null);
      setStatus("authenticated");
    } catch {
      if (seq !== seqRef.current) return;
      setEmail(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const cfg = amplifyAuthConfig();
    if (cfg) {
      Amplify.configure(cfg);
      // Scope Cognito tokens to per-tab sessionStorage instead of the v6 default
      // localStorage: localStorage is shared across every same-origin tab — including
      // the JupyterLite/Pyodide lab, where pasted user Python can read it via
      // `import js` — so a persistent refresh token would be reachable by any
      // same-origin script. Trade-off: login no longer persists across tabs/restarts.
      cognitoUserPoolsTokenProvider.setKeyValueStorage(amplifyTokenStorage);
    }
    // hydrate() is async — its setState calls run after `await getCurrentUser()`,
    // not synchronously in this effect body, so the rule's heuristic misfires here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void hydrate();
    // Token exchange after the Google redirect fires "signInWithRedirect"; an in-app
    // signIn fires "signedIn". Re-hydrate on both. Clear on sign-out and on any
    // terminal failure (revoked/expired refresh, failed redirect) so the UI never
    // sits on a stale "authenticated".
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "signInWithRedirect":
          void hydrate();
          break;
        case "signedOut":
        case "tokenRefresh_failure":
        case "signInWithRedirect_failure":
          seqRef.current++; // invalidate any in-flight hydrate
          setEmail(null);
          setStatus("unauthenticated");
          break;
      }
    });
    return unsubscribe;
  }, [configured, hydrate]);

  const signOut = useCallback(async () => {
    seqRef.current++; // a pending hydrate must not re-authenticate us mid-sign-out
    try {
      await amplifySignOut();
    } catch {
      // Best-effort: a failed (e.g. offline) sign-out must not become an unhandled
      // rejection at the fire-and-forget call sites, nor strand the user as signed-in.
    } finally {
      // Reflect signed-out locally whether or not the network call succeeded — the
      // `signedOut` Hub event does not fire on failure, and leaving the user shown as
      // signed-in would be worse than a best-effort local clear (tokens are bounded
      // to the tab by the sessionStorage store above).
      setEmail(null);
      setStatus("unauthenticated");
    }
  }, []);

  return (
    <AuthContext.Provider value={{ status, email, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
