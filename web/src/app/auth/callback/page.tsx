"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Hub } from "aws-amplify/utils";
import { useAuth } from "@/components/auth/auth-provider";

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
    // change (status -> authenticated, re-running this effect). The only thing
    // we must catch ourselves is an explicit failure.
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect_failure") {
        router.replace("/login?error=google");
      }
    });
    return unsubscribe;
  }, [status, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">Signing you in…</p>
    </div>
  );
}
