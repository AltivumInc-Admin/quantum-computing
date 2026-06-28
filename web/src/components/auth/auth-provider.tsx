"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { isAuthConfigured } from "@/lib/auth-config";

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

// The aws-amplify SDK (~30 KB gz) lives entirely inside this lazily-loaded,
// client-only chunk so it stays out of every page's initial shared bundle — the
// provider itself imports no Amplify code. The bridge does the Cognito work and
// reports state back through the callbacks below.
const AmplifyAuthBridge = dynamic(() => import("./amplify-auth-bridge"), { ssr: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isAuthConfigured();
  const [status, setStatus] = useState<AuthStatus>(
    configured ? "configuring" : "unconfigured"
  );
  const [email, setEmail] = useState<string | null>(null);

  // The bridge registers the real (Amplify) sign-out; the context exposes a stable
  // indirection so consumers don't depend on the lazily-loaded module.
  const signOutRef = useRef<() => Promise<void>>(async () => {});
  const signOut = useCallback(() => signOutRef.current(), []);
  const registerSignOut = useCallback((fn: () => Promise<void>) => {
    signOutRef.current = fn;
  }, []);

  return (
    <AuthContext.Provider value={{ status, email, signOut }}>
      {configured && (
        <AmplifyAuthBridge
          onStatus={setStatus}
          onEmail={setEmail}
          registerSignOut={registerSignOut}
        />
      )}
      {children}
    </AuthContext.Provider>
  );
}
