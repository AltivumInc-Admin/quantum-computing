"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getSections } from "@/lib/sections";
import { completedCount } from "@/lib/progress-store";

export default function WorkspacePage() {
  const router = useRouter();
  const { status, email, signOut } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "unconfigured") {
    return (
      <Shell>
        <p className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
          The Quantum Workspace
        </p>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Free accounts are coming soon.
        </p>
      </Shell>
    );
  }

  if (status !== "authenticated") {
    return (
      <Shell>
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      </Shell>
    );
  }

  const sections = getSections();
  const done = completedCount(sections.map((s) => s.slug));

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  return (
    <Shell>
      <h1 className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
        Your Workspace
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Signed in as <span className="font-medium text-gray-900 dark:text-white">{email}</span>
      </p>

      <div className="mt-6 rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 shadow-(--shadow-resting)">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {done} of {sections.length} sections complete on this device — not yet synced.
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Your progress and review cards will sync to your account in a coming release,
          so they follow you across devices.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="mt-6 inline-flex items-center rounded-control border border-gray-200 dark:border-gray-700/50 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 interactive focus-ring"
      >
        Sign out
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">{children}</div>
  );
}
