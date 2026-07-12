"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getSections } from "@/lib/sections";
import { completedCount } from "@/lib/progress-store";
import { CredentialsWorkspaceTeaser } from "@/components/credentials-wall";
import { QpuSubmitPanel } from "@/components/quantum/qpu-submit-panel";
import { ReminderPrefs } from "@/components/reminder-prefs";
import { DeleteAccount } from "@/components/auth/delete-account";

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
        {process.env.NEXT_PUBLIC_SYNC_URL ? (
          <SyncPanel done={done} total={sections.length} />
        ) : (
          <>
            <p className="text-sm text-gray-700 dark:text-gray-200">
              {done} of {sections.length} sections complete on this device — not yet synced.
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Your progress and review cards will sync to your account in a coming release,
              so they follow you across devices.
            </p>
          </>
        )}
      </div>

      <ReminderPrefs />

      <Link
        href="/runbook"
        className="mt-4 flex items-center justify-between rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) px-6 py-4 shadow-(--shadow-resting) interactive focus-ring group"
      >
        <span>
          <span className="block text-sm font-medium text-gray-900 dark:text-white">
            Open your Runbook
          </span>
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            Mastery, weekly streak, and your activity graph.
          </span>
        </span>
        <svg
          className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      <CredentialsWorkspaceTeaser />

      <QpuSubmitPanel />

      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="mt-6 inline-flex items-center rounded-control border border-gray-200 dark:border-gray-700/50 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 interactive focus-ring"
      >
        Sign out
      </button>

      <DeleteAccount />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">{children}</div>
  );
}

/**
 * The live sync affordance (rendered only when NEXT_PUBLIC_SYNC_URL is set).
 * The sync client — and with it aws-amplify — is imported dynamically on
 * demand, preserving the auth layer's code-split contract. Background syncs
 * run via <ProgressSync/>; this panel adds visibility and a manual trigger.
 */
function SyncPanel({ done, total }: { done: number; total: number }) {
  const [state, setState] = useState<"idle" | "syncing" | "error" | "mismatch">("idle");
  const [lastSynced, setLastSynced] = useState<number | null>(null);

  useEffect(() => {
    let disposed = false;
    const read = () => {
      void import("@/lib/sync-client").then(({ lastSyncedAt }) => {
        if (!disposed) setLastSynced(lastSyncedAt());
      });
    };
    read();
    window.addEventListener("qc-sync", read);
    return () => {
      disposed = true;
      window.removeEventListener("qc-sync", read);
    };
  }, []);

  const handleSync = (accountChange?: "adopt" | "reset") => {
    setState("syncing");
    void import("@/lib/sync-client")
      .then(({ syncNow }) => syncNow(accountChange ? { accountChange } : undefined))
      .then(() => setState("idle"))
      .catch((e: Error) => setState(e?.name === "SyncAccountMismatch" ? "mismatch" : "error"));
  };

  const buttonClass =
    "inline-flex items-center rounded-control border border-accent/30 bg-accent/5 px-4 py-2 text-sm font-medium text-accent-dark dark:text-accent-light interactive focus-ring disabled:opacity-60";

  if (state === "mismatch") {
    return (
      <>
        <p className="text-sm text-gray-700 dark:text-gray-200">
          This device holds progress synced by a different account.
        </p>
        <p role="status" className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Choose whether to merge this device&apos;s progress into the account you are
          signed in as, or replace it with the account&apos;s own data.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => handleSync("adopt")} className={buttonClass}>
            Merge this device&apos;s progress
          </button>
          <button
            type="button"
            onClick={() => handleSync("reset")}
            className="inline-flex items-center rounded-control border border-gray-200 dark:border-gray-700/50 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 interactive focus-ring"
          >
            Use account data only
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-gray-700 dark:text-gray-200">
        {done} of {total} sections complete.
      </p>
      <p role="status" className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {state === "syncing"
          ? "Syncing…"
          : state === "error"
            ? "Sync failed — check your connection and try again."
            : lastSynced
              ? `Synced to your account — last synced ${new Date(lastSynced).toLocaleString()}.`
              : "Your progress and review cards sync to your account across devices."}
      </p>
      <button
        type="button"
        onClick={() => handleSync()}
        disabled={state === "syncing"}
        className={`mt-4 ${buttonClass}`}
      >
        Sync now
      </button>
    </>
  );
}
