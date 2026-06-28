"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Amplify } from "aws-amplify";
import { Hub } from "aws-amplify/utils";
import {
  getCurrentUser,
  fetchUserAttributes,
  signOut as amplifySignOut,
} from "aws-amplify/auth";
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

  const hydrate = useCallback(async () => {
    try {
      await getCurrentUser();
      const attrs = await fetchUserAttributes();
      setEmail(attrs.email ?? null);
      setStatus("authenticated");
    } catch {
      setEmail(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const cfg = amplifyAuthConfig();
    if (cfg) Amplify.configure(cfg);
    // hydrate() is async — its setState calls run after `await getCurrentUser()`,
    // not synchronously in this effect body, so the rule's heuristic misfires here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void hydrate();
    // Token exchange after the Google redirect fires "signInWithRedirect"; an
    // in-app signIn fires "signedIn". Re-hydrate on both; clear on sign-out.
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "signInWithRedirect":
          void hydrate();
          break;
        case "signedOut":
          setEmail(null);
          setStatus("unauthenticated");
          break;
      }
    });
    return unsubscribe;
  }, [configured, hydrate]);

  const signOut = useCallback(async () => {
    await amplifySignOut();
  }, []);

  return (
    <AuthContext.Provider value={{ status, email, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
