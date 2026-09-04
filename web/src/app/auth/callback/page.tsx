"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Hub } from "aws-amplify/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { OAUTH_NEXT_KEY, isSafeNext } from "@/lib/oauth-inflight";

// A backstop, not a verdict. Nothing here can observe the token exchange, so a
// timeout means "this did not resolve in time" and NEVER "Google rejected you"
// — the two land on different banners for that reason (see the redirect below).
//
// It used to be reached routinely, and wrongly: a stale OAuth handshake in
// localStorage made Amplify block getCurrentUser() forever, so this page sat on
// "Signing you in…" for the full window, redirected to an error, and the user
// was signed in a moment later. That deadlock is fixed at its source in
// lib/oauth-inflight.ts; this timer now only covers a genuinely stalled
// network.
const CALLBACK_TIMEOUT_MS = 15000;

/** Where the visitor was headed before the Google hop, if anywhere safe. */
function consumeNext(): string {
  if (typeof window === "undefined") return "/workspace";
  let stashed: string | null = null;
  try {
    stashed = window.sessionStorage.getItem(OAUTH_NEXT_KEY);
    window.sessionStorage.removeItem(OAUTH_NEXT_KEY);
  } catch {
    // Private mode / blocked storage: fall back to the default destination.
  }
  return isSafeNext(stashed) ? stashed! : "/workspace";
}

export default function CallbackPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unconfigured") {
      router.replace("/");
      return;
    }
    if (status === "authenticated") {
      router.replace(consumeNext());
      return;
    }
    // Still waiting on the token exchange. Success arrives as a provider state
    // change (status -> authenticated, re-running this effect). We must catch an
    // explicit failure event, and — in case that event is missed or never fires —
    // fall back to a timeout so the page can never hang indefinitely.
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect_failure") {
        // Positive evidence of failure: say so.
        router.replace("/login?error=google");
      }
    });
    const timer = setTimeout(
      // No evidence either way. Claiming Google refused would be a guess, and
      // for a year it was usually the wrong one.
      () => router.replace("/login?error=timeout"),
      CALLBACK_TIMEOUT_MS
    );
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [status, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">Signing you in…</p>
    </div>
  );
}
