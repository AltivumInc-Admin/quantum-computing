"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { resetLocalDeletions, wipeLocalProgress } from "@/lib/progress-merge";
import { isReviewPrefsConfigured, deleteReminderPrefs } from "@/lib/review-prefs-client";
import { hasUserPoolAdminScope } from "@/lib/auth-session";
import { useLocale } from "@/i18n";

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
  const { t } = useLocale();
  const router = useRouter();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening swaps the focused trigger for a whole new <section> (and closing
  // swaps it back), so without help keyboard focus falls to <body> and screen
  // readers never hear that the confirmation UI appeared. Move focus to the
  // section heading on open and back to the re-mounted trigger on close.
  // Comparing the prior value skips the initial mount — and StrictMode's mount
  // double-invoke — so first render never steals focus. (Same pattern as
  // auth-form's view-change heading focus.)
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current === open) return;
    prevOpenRef.current = open;
    if (open) {
      headingRef.current?.focus({ preventScroll: true });
    } else {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const syncConfigured = Boolean(process.env.NEXT_PUBLIC_SYNC_URL);
  const prefsConfigured = isReviewPrefsConfigured();
  const confirmed = typed.trim() === CONFIRM_WORD;

  // The shared qc:* wipe, plus the account binding that lives outside the
  // prefix (sync-client's SYNC_META_KEY — named literally here because this
  // component must not statically import sync-client's aws-amplify graph).
  // Session tombstones go with the wipe: they record what THIS device's copy
  // deleted, and that copy no longer exists — and wiping the meta also erases
  // boundSub, so sync's own mismatch branch (the only other reset) could
  // never fire for the next account signing in without a reload. Stale
  // tombstones would silently suppress that account's first-sync apply.
  const clearLocal = () => {
    wipeLocalProgress(["qc-sync:meta"]);
    resetLocalDeletions();
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);

    // 0. Can this session finish what it is about to start? The ordering below
    //    only "can never strand data" if the LAST step is capable of succeeding.
    //    deleteUser() is cognito-idp DeleteUser, gated on a scope a Google session
    //    can never carry — so without this check a federated user's progress and
    //    email preference were destroyed first and the account delete then failed
    //    every single time, leaving them told to "Try again" forever. Refuse
    //    before touching anything, and say why.
    if (!(await hasUserPoolAdminScope())) {
      setError(
        "Accounts created with Google can't be deleted from here yet, and nothing was deleted. " +
          "Email support and we'll remove it for you.",
      );
      setBusy(false);
      return;
    }

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
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center rounded-control border border-red-300/70 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 interactive focus-ring"
        >
          {t("deleteAccount.title")}
        </button>
        <p className="mt-2 text-xs text-caption">
          {t("deleteAccount.blurb")}
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label={t("deleteAccount.ariaLabel")}
      className={`rounded-card border border-red-300/70 dark:border-red-500/30 bg-(--surface-1) p-6 shadow-(--shadow-resting) ${className}`}
    >
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-sm font-medium text-(--ink) outline-none"
      >
        {t("deleteAccount.title")}
      </h2>
      <p className="mt-2 text-sm text-(--mut)">
        {t("deleteAccount.intro")}
      </p>
      <ul className="mt-2 list-disc pl-5 text-sm text-(--mut) space-y-1">
        {syncConfigured && <li>{t("deleteAccount.itemProgress")}</li>}
        {prefsConfigured && <li>{t("deleteAccount.itemPrefs")}</li>}
        <li>{t("deleteAccount.itemAccount")}</li>
        <li>{t("deleteAccount.itemLocal")}</li>
      </ul>
      <p className="mt-3 text-sm text-(--mut)">
        {t("deleteAccount.noUndo")}
      </p>

      <label htmlFor="delete-confirm" className="mt-4 block text-sm text-(--mut)">
        {t("deleteAccount.confirmLabel")}{" "}
        <span className="font-mono font-medium">{CONFIRM_WORD}</span>
      </label>
      <input
        id="delete-confirm"
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={busy}
        autoComplete="off"
        spellCheck={false}
        className="mt-2 w-full max-w-xs rounded-control border border-(--bd) bg-transparent px-3 py-2 text-sm text-(--ink) focus-ring disabled:opacity-60"
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
          {busy ? t("deleteAccount.deleting") : t("deleteAccount.submit")}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          disabled={busy}
          className="inline-flex items-center rounded-control border border-(--bd) px-4 py-2 text-sm font-medium text-(--mut) interactive focus-ring disabled:opacity-60"
        >
          {t("common.cancel")}
        </button>
      </div>
    </section>
  );
}
