"use client";

import { useSyncExternalStore } from "react";
import {
  ANON_OWNER,
  anonBucketSize,
  claimAnonBucket,
  currentOwner,
  discardAnonBucket,
} from "@/lib/progress-owner";
import { PROGRESS_EVENT_NAME } from "@/lib/progress-event";
import { subscribe } from "@/lib/progress-store";

/**
 * The one place unowned progress can cross into an account — and it only ever
 * happens on an explicit click.
 *
 * Progress made before signing in lives in the anonymous bucket, which a
 * signed-in session cannot see. For the learner who genuinely studied first and
 * signed up second that would look like their work vanished, so we offer it
 * back. Crucially we ASK: on a shared browser that bucket may be a stranger's,
 * and silently absorbing it is the exact failure this whole change exists to
 * remove. Nothing moves until the user chooses.
 *
 * Reads through useSyncExternalStore on the qc-progress channel — which
 * setCurrentOwner also fires — so this appears as soon as a session hydrates
 * and disappears the moment the bucket is claimed or discarded, with no
 * setState-in-effect and a stable 0 for the prerendered shell.
 *
 * DESIGN. This is a decision, not a warning: the device found work, and the
 * learner is the only one who knows whose it is. So it reads as an instrument
 * panel in the workspace's own language — hairline rule, tabular count, the
 * measurement typography the cockpit uses — rather than as an alert box. No
 * amber, no icon, no urgency: nothing is wrong, and dressing a routine question
 * as a fault is how interfaces teach people to dismiss them unread. Claiming is
 * the accent-lit affordance because it is the common intent; discarding stays a
 * quiet ghost button because it is destructive and should never be the reflex.
 */
function pendingCount(): number {
  return currentOwner() === ANON_OWNER ? 0 : anonBucketSize();
}

export function ClaimAnonProgress() {
  const count = useSyncExternalStore(subscribe, pendingCount, () => 0);
  if (count === 0) return null;

  const done = () => window.dispatchEvent(new Event(PROGRESS_EVENT_NAME));

  return (
    <section
      aria-label="Unclaimed progress on this device"
      className="animate-fade-up mt-6 rounded-card border border-gray-200/60 bg-(--surface-1) shadow-(--shadow-resting) dark:border-white/[0.06]"
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-5 px-5 py-4 sm:px-6">
        {/* The measurement, in the cockpit's own instrument voice. */}
        <div className="flex items-baseline gap-3">
          <span className="font-display text-display-md tabular-nums leading-none text-(--ink)">
            {count}
          </span>
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-caption">
            {count === 1 ? "item" : "items"} unclaimed
          </span>
        </div>

        {/* Hairline divider — vertical where there is room, horizontal when the
            row wraps, so the two halves never collide on a narrow viewport. */}
        <span
          aria-hidden="true"
          className="hidden h-8 w-px bg-gray-200/60 sm:block dark:bg-white/[0.06]"
        />

        <div className="min-w-56 flex-1">
          <p className="text-sm text-(--ink)">
            Progress on this device from before you signed in.
          </p>
          <p className="mt-0.5 text-sm text-(--mut)">
            Add it to this account, or leave it out if it was not yours.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              claimAnonBucket(currentOwner());
              done();
            }}
            className="surface-accent inline-flex items-center rounded-control px-3.5 py-2 text-sm font-medium interactive focus-ring"
          >
            Add to my account
          </button>
          <button
            type="button"
            onClick={() => {
              discardAnonBucket();
              done();
            }}
            className="inline-flex items-center rounded-control px-3 py-2 text-sm text-(--mut) hover:text-(--ink) interactive focus-ring"
          >
            Not mine
          </button>
        </div>
      </div>
    </section>
  );
}
