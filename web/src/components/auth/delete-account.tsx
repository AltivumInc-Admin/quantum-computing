"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { isReviewPrefsConfigured, deleteReminderPrefs } from "@/lib/review-prefs-client";

const CONFIRM_WORD = "delete";

/**
 * Account deletion, in the order that can never strand data: server progress
 * first, then email preferences, then the Cognito user, then this device's
 * local copy. If any server step fails the flow STOPS and says exactly what
 * happened — the Cognito user is never deleted ahead of its data. The
 * sync-client is imported dynamically (its aws-amplify contract); the prefs
 * client lazy-loads amplify internally.
 */
export function DeleteAccount({ className = "" }: { className?: string }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncConfigured = Boolean(process.env.NEXT_PUBLIC_SYNC_URL);
  const prefsConfigured = isReviewPrefsConfigured();
  const confirmed = typed.trim() === CONFIRM_WORD;

  const clearLocal = () => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("qc:") || k === "qc-sync:meta") keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      window.dispatchEvent(new Event("qc-progress"));
    } catch {
      /* storage unavailable — nothing local to clear */
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);

    // 1. Server progress (the sync snapshot, including the stored email claim).
    if (syncConfigured) {
      try {
        const { deleteProgress } = await import("@/lib/sync-client");
        await deleteProgress();
      } catch {
        setError(
          "Couldn't delete your synced progress from the server. Nothing was deleted — your account is untouched. Try again.",
        );
        setBusy(false);
        return;
      }
    }

    // 2. Email reminder preference.
    if (prefsConfigured) {
      try {
        await deleteReminderPrefs();
      } catch {
        setError(
          (syncConfigured
            ? "Your synced progress was deleted, but your email preference could not be."
            : "Your email preference could not be deleted.") +
            " Your account was NOT deleted. Try again to finish.",
        );
        setBusy(false);
        return;
      }
    }

    // 3. The Cognito account itself — only after every server delete succeeded.
    try {
      const { deleteUser } = await import("aws-amplify/auth");
      await deleteUser();
    } catch {
      setError(
        (syncConfigured || prefsConfigured
          ? "Your server data was deleted, but the account itself could not be deleted."
          : "The account could not be deleted.") + " Try again.",
      );
      setBusy(false);
      return;
    }

    // 4. This device's local copy, then sign out (best effort — the user no
    // longer exists) and leave the workspace.
    clearLocal();
    try {
      await signOut();
    } catch {
      /* the account is already gone */
    }
    router.replace("/");
  };

  if (!open) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center rounded-control border border-red-300/70 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 interactive focus-ring"
        >
          Delete account
        </button>
        <p className="mt-2 text-xs text-caption">
          Permanently removes your account and all data. Asks for confirmation first.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="Delete account"
      className={`rounded-card border border-red-300/70 dark:border-red-500/30 bg-(--surface-1) p-6 shadow-(--shadow-resting) ${className}`}
    >
      <h2 className="text-sm font-medium text-gray-900 dark:text-white">Delete account</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        This permanently deletes:
      </p>
      <ul className="mt-2 list-disc pl-5 text-sm text-gray-600 dark:text-gray-400 space-y-1">
        {syncConfigured && <li>your synced progress on the server (including your email address)</li>}
        {prefsConfigured && <li>your email reminder preference</li>}
        <li>your account and sign-in</li>
        <li>this device&apos;s local copy of your progress</li>
      </ul>
      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
        There is no undo and no recovery period.
      </p>

      <label htmlFor="delete-confirm" className="mt-4 block text-sm text-gray-700 dark:text-gray-200">
        Type <span className="font-mono font-medium">{CONFIRM_WORD}</span> to confirm
      </label>
      <input
        id="delete-confirm"
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={busy}
        autoComplete="off"
        spellCheck={false}
        className="mt-2 w-full max-w-xs rounded-control border border-gray-200 dark:border-gray-700/50 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white focus-ring disabled:opacity-60"
      />

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={!confirmed || busy}
          className="inline-flex items-center rounded-control border border-red-700 dark:border-red-500/50 bg-red-700 px-4 py-2 text-sm font-medium text-white interactive focus-ring disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          disabled={busy}
          className="inline-flex items-center rounded-control border border-gray-200 dark:border-gray-700/50 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 interactive focus-ring disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
