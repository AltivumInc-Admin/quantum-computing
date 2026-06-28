"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Hub } from "aws-amplify/utils";
import { useAuth } from "@/components/auth/auth-provider";

// If neither success (status -> authenticated) nor an explicit failure event arrives
// within this window, assume the token exchange stalled and bail to login rather than
// leaving the user staring at "Signing you in…" forever.
const CALLBACK_TIMEOUT_MS = 15000;

export default function CallbackPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unconfigured") {
      router.replace("/");
      return;
    }
    if (status === "authenticated") {
      router.replace("/workspace");
      return;
    }
    // Still waiting on the token exchange. Success arrives as a provider state
    // change (status -> authenticated, re-running this effect). We must catch an
    // explicit failure event, and — in case that event is missed or never fires —
    // fall back to a timeout so the page can never hang indefinitely.
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect_failure") {
        router.replace("/login?error=google");
      }
    });
    const timer = setTimeout(
      () => router.replace("/login?error=google"),
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
