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
 */
function pendingCount(): number {
  return currentOwner() === ANON_OWNER ? 0 : anonBucketSize();
}

export function ClaimAnonProgress() {
  const count = useSyncExternalStore(subscribe, pendingCount, () => 0);
  if (count === 0) return null;

  const done = () => window.dispatchEvent(new Event(PROGRESS_EVENT_NAME));

  return (
    <div role="alert" className="rounded-control border border-(--bd) bg-(--field) p-4 text-sm">
      <p className="text-(--ink)">
        This device has {count} {count === 1 ? "item" : "items"} of progress from before you
        signed in.
      </p>
      <p className="mt-1 text-caption">
        Add it to this account, or leave it out if it was not yours.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            claimAnonBucket(currentOwner());
            done();
          }}
          className="rounded-control border border-(--bd) px-3 py-1.5 text-xs font-medium text-(--mut) interactive focus-ring"
        >
          Add to my account
        </button>
        <button
          type="button"
          onClick={() => {
            discardAnonBucket();
            done();
          }}
          className="rounded-control border border-(--bd) px-3 py-1.5 text-xs font-medium text-(--mut) interactive focus-ring"
        >
          Not mine — discard it
        </button>
      </div>
    </div>
  );
}
