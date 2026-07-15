"use client";

import { Panel } from "./panel";
import { ReminderPrefs } from "@/components/reminder-prefs";
import { DeleteAccount } from "@/components/auth/delete-account";

/**
 * Z8 — THE CONSOLE, the CONFIGURE surface (the basement). ONE panel, three hairline
 * rows in place of four full-width cards: the review-reminder switch (absent without
 * REVIEW_PREFS_URL — ReminderPrefs self-gates to null), the account row with sign-out,
 * and account deletion tucked below its own disclosure so an IRREVERSIBLE action is not
 * peer-weighted with a checkbox (its type-DELETE confirm stays inside).
 */
export function ConsolePanel({
  email,
  onSignOut,
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  const row = "border-t border-gray-200/60 py-3 first:border-t-0 dark:border-white/[0.06]";
  return (
    <Panel title="Console" id="ws-console" as="aside">
      <ReminderPrefs className={row} />

      <div className={`flex items-center justify-between gap-3 ${row}`}>
        <span className="min-w-0 truncate text-sm text-gray-700 dark:text-gray-200">
          {email ?? "Signed in"}
        </span>
        <button
          type="button"
          onClick={onSignOut}
          className="shrink-0 rounded-control border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 interactive focus-ring dark:border-gray-700/50 dark:text-gray-200"
        >
          Sign out
        </button>
      </div>

      <div className={row}>
        <DeleteAccount />
      </div>
    </Panel>
  );
}
