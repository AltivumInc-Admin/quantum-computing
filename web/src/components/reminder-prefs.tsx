"use client";

import { useEffect, useId, useState } from "react";
import {
  isReviewPrefsConfigured,
  getReminderPrefs,
  setReminderPrefs,
} from "@/lib/review-prefs-client";

/**
 * The workspace control for review-reminder emails — the REAL switch behind
 * the consent stored in the review-email prefs table. Opt-in: the server
 * default is off, and this renders unchecked until the server says otherwise.
 * Hidden entirely until NEXT_PUBLIC_REVIEW_PREFS_URL (and auth) are configured,
 * so the static site is unaffected when the backend is absent.
 */
export function ReminderPrefs({ className }: { className?: string }) {
  if (!isReviewPrefsConfigured()) return null;
  return <Panel className={className} />;
}

type State = "loading" | "ready" | "saving" | "error";

function Panel({ className }: { className?: string }) {
  const id = useId();
  const [on, setOn] = useState(false); // opt-in: default OFF until the server says on
  const [state, setState] = useState<State>("loading");
  const checkboxId = `${id}-reminders`;

  useEffect(() => {
    let disposed = false;
    getReminderPrefs()
      .then(({ remindersOn }) => {
        if (disposed) return;
        setOn(remindersOn === true);
        setState("ready");
      })
      .catch(() => {
        if (!disposed) setState("error");
      });
    return () => {
      disposed = true;
    };
  }, []);

  const handleToggle = (next: boolean) => {
    setState("saving");
    setReminderPrefs(next)
      .then(({ remindersOn }) => {
        setOn(remindersOn === true);
        setState("ready");
      })
      .catch(() => {
        // Honest state: the server did not change, so neither does the box.
        setState("error");
      });
  };

  return (
    // De-carded: the workspace Console panel owns the card, the region label, and
    // the spacing now (§1 refactor). This is an unstyled inline row that accepts a
    // className from its single consumer, /workspace.
    <div className={className}>
      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={on}
          disabled={state === "loading" || state === "saving"}
          onChange={(e) => handleToggle(e.target.checked)}
          aria-describedby={`${checkboxId}-caption`}
          className="mt-0.5 h-4 w-4 shrink-0 rounded accent-accent focus-ring disabled:opacity-60"
        />
        <div>
          <label
            htmlFor={checkboxId}
            className="block text-sm font-medium text-gray-900 dark:text-white"
          >
            Email me when review cards are due
          </label>
          <p id={`${checkboxId}-caption`} className="mt-1 text-xs text-caption">
            Off by default. At most one email every 7 days, and only when cards are
            actually due. Every email has a one-click unsubscribe.
          </p>
          <p role="status" className="mt-1 text-xs text-caption">
            {state === "error"
              ? "Couldn't update your reminder preference — nothing changed. Try again."
              : state === "saving"
                ? "Saving…"
                : state === "ready"
                  ? on
                    ? "Reminders are on."
                    : "Reminders are off."
                  : null}
          </p>
        </div>
      </div>
    </div>
  );
}
