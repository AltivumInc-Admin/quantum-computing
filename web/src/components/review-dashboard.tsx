"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  dueCardIds,
  getAllCardIds,
  getCardContent,
  subscribe,
} from "@/lib/review-store";
import { ReviewCard } from "@/components/quantum/review-card";

/**
 * The /review surface: resurfaces every card whose schedule has come due,
 * across all sections, in one place. State is read through useSyncExternalStore
 * so the static export prerenders the empty shell and the list hydrates from
 * localStorage on the client; grading a card here re-fires "qc-progress", which
 * recomputes the due list so the card drops out once it is no longer due.
 *
 * The snapshot is a single string ("dueIds|total") so it is a stable value-equal
 * value for React's snapshot check — returning an object would churn identity.
 */

function snapshot(): string {
  return `${dueCardIds().join(",")}|${getAllCardIds().length}`;
}

export function ReviewDashboard() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => "|0");

  const { dueIds, total } = useMemo(() => {
    const [dueStr, totalStr] = snap.split("|");
    return {
      dueIds: dueStr ? dueStr.split(",") : [],
      total: Number(totalStr) || 0,
    };
  }, [snap]);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-10">
        <p className="text-sm font-medium tracking-widest uppercase text-accent dark:text-accent-light mb-3">
          Spaced repetition
        </p>
        <h1 className="font-display text-display-xl tracking-tight text-gray-900 dark:text-white">
          Review
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
          Cards you have studied resurface here exactly when you are about to
          forget them. A few minutes now keeps the whole curriculum fresh.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm tabular-nums text-gray-500 dark:text-gray-400">
          <span>
            <span className="font-semibold text-gray-700 dark:text-gray-200">{dueIds.length}</span> due
            now
          </span>
          <span className="text-gray-300 dark:text-gray-700">/</span>
          <span>
            <span className="font-semibold text-gray-700 dark:text-gray-200">{total}</span> card
            {total === 1 ? "" : "s"} tracked
          </span>
        </div>
      </div>

      {dueIds.length === 0 ? (
        <div className="rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-6 py-12 text-center">
          <p className="text-base font-medium text-gray-700 dark:text-gray-200">
            {total === 0 ? "No cards yet" : "Nothing due — you're caught up"}
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {total === 0
              ? "Work through a lesson and grade its recall cards to start building a review schedule."
              : "Come back when more cards come due, or keep reading new lessons."}
          </p>
        </div>
      ) : (
        <div>
          {dueIds.map((id) => {
            const content = getCardContent(id);
            if (!content) return null;
            const source = JSON.stringify({ id, ...content });
            return <ReviewCard key={id} source={source} />;
          })}
        </div>
      )}
    </div>
  );
}
