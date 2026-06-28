"use client";

import { useCallback, useEffect, useRef } from "react";
import { Amplify } from "aws-amplify";
import { Hub, sessionStorage as amplifyTokenStorage } from "aws-amplify/utils";
import {
  getCurrentUser,
  fetchUserAttributes,
  signOut as amplifySignOut,
} from "aws-amplify/auth";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import { amplifyAuthConfig } from "@/lib/auth-config";
import type { AuthStatus } from "./auth-provider";

interface Props {
  onStatus: (s: AuthStatus) => void;
  onEmail: (e: string | null) => void;
  registerSignOut: (fn: () => Promise<void>) => void;
}

/**
 * Owns every aws-amplify v6 import and all the Cognito wiring (configure, token
 * storage, hydrate, Hub events, sign-out). It renders nothing and reports state
 * up to AuthProvider via callbacks. AuthProvider loads it through
 * next/dynamic({ ssr: false }), so the ~30 KB-gz Amplify SDK lives in this
 * lazily-fetched client-only chunk instead of every page's initial shared bundle.
 */
export default function AmplifyAuthBridge({ onStatus, onEmail, registerSignOut }: Props) {
  // Monotonic guard: every hydrate captures a sequence number and only commits its
  // result if it is still the latest. A sign-out / failure event bumps the counter,
  // so a slow in-flight hydrate can never clobber the newer state.
  const seqRef = useRef(0);

  const hydrate = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      await getCurrentUser();
      const attrs = await fetchUserAttributes();
      if (seq !== seqRef.current) return; // superseded by a newer hydrate / sign-out
      onEmail(attrs.email ?? null);
      onStatus("authenticated");
    } catch {
      if (seq !== seqRef.current) return;
      onEmail(null);
      onStatus("unauthenticated");
    }
  }, [onEmail, onStatus]);

  useEffect(() => {
    const cfg = amplifyAuthConfig();
    if (cfg) {
      Amplify.configure(cfg);
      // Scope Cognito tokens to per-tab sessionStorage instead of the v6 default
      // localStorage (shared across same-origin tabs, incl. the Pyodide lab).
      cognitoUserPoolsTokenProvider.setKeyValueStorage(amplifyTokenStorage);
    }
    registerSignOut(async () => {
      seqRef.current++; // a pending hydrate must not re-authenticate us mid-sign-out
      try {
        await amplifySignOut();
      } catch {
        // Best-effort: a failed (e.g. offline) sign-out must not strand the user.
      } finally {
        onEmail(null);
        onStatus("unauthenticated");
      }
    });
    void hydrate();
    // Re-hydrate on sign-in / Google-redirect token exchange. Clear on sign-out and
    // on any terminal failure so the UI never sits on a stale "authenticated".
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "signInWithRedirect":
          void hydrate();
          break;
        case "signedOut":
        case "tokenRefresh_failure":
        case "signInWithRedirect_failure":
          seqRef.current++;
          onEmail(null);
          onStatus("unauthenticated");
          break;
      }
    });
    return unsubscribe;
  }, [hydrate, registerSignOut, onEmail, onStatus]);

  return null;
}
