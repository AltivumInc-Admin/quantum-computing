"use client";

import { useCallback, useEffect, useRef } from "react";
import { Amplify } from "aws-amplify";
import { Hub, sessionStorage as amplifyTokenStorage } from "aws-amplify/utils";
import {
  getCurrentUser,
  fetchAuthSession,
  signOut as amplifySignOut,
} from "aws-amplify/auth";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import { setCurrentOwner } from "@/lib/progress-owner";
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
      // The email comes from the ID token's claim, NEVER from fetchUserAttributes:
      // that call is a GetUser request to cognito-idp, which requires the
      // aws.cognito.signin.user.admin scope — a scope Google-federated (hosted-UI)
      // access tokens do not carry (the app client grants openid/email/profile).
      // Depending on it meant every Google sign-in exchanged tokens successfully
      // and was then reported "unauthenticated": the callback page hung 15s into a
      // "didn't complete" banner while a live session sat in sessionStorage — which
      // in turn made a follow-up email/password sign-in in the same tab throw
      // UserAlreadyAuthenticatedException (see auth-form's signInFresh). Both token
      // kinds carry the email claim, so this path is also one network call cheaper.
      const session = await fetchAuthSession();
      const claim = session.tokens?.idToken?.payload?.email;
      const sub = session.tokens?.idToken?.payload?.sub;
      if (seq !== seqRef.current) return; // superseded by a newer hydrate / sign-out
      // Point local progress at THIS account's bucket before anything reads it.
      // Storage is namespaced per owner (progress-owner), so this is what makes
      // one learner's cards, streak and saved circuits invisible to the next
      // account on a shared browser.
      if (typeof sub === "string") setCurrentOwner(sub);
      onEmail(typeof claim === "string" ? claim : null);
      onStatus("authenticated");
    } catch {
      if (seq !== seqRef.current) return;
      setCurrentOwner(null);
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
        // Back to the anonymous bucket. The account's own bucket is NOT
        // deleted — signing back in restores it instantly, even offline — it
        // simply stops being read, so nobody else on this device can see it.
        setCurrentOwner(null);
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
          setCurrentOwner(null);
          onEmail(null);
          onStatus("unauthenticated");
          break;
      }
    });
    return unsubscribe;
  }, [hydrate, registerSignOut, onEmail, onStatus]);

  return null;
}
