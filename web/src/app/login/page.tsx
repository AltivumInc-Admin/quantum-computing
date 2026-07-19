"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { useAuth } from "@/components/auth/auth-provider";
import { isAuthConfigured } from "@/lib/auth-config";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status !== "authenticated") return;
    // Honor ?next= from the sign-up wall so a deep-linked visitor lands back
    // where they were headed; only same-origin paths, never an open redirect.
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/workspace");
  }, [status, router]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
      {!isAuthConfigured() ? (
        <div className="w-full max-w-sm rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 text-center shadow-(--shadow-resting)">
          <p className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
            The Quantum Workspace
          </p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Free accounts are coming soon.
          </p>
        </div>
      ) : (
        <Suspense fallback={<p className="text-sm text-caption">Loading…</p>}>
          <AuthForm />
        </Suspense>
      )}
    </div>
  );
}
