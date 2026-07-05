"use client";

import { useMemo, useState, useSyncExternalStore, type ComponentType } from "react";
import dynamic from "next/dynamic";
import {
  dueCardIds,
  getAllCardIds,
  getCardContent,
  subscribe,
  type CardKind,
} from "@/lib/review-store";
import { ReviewCard } from "@/components/quantum/review-card";

/**
 * The /review surface: resurfaces every card whose schedule has come due,
 * across all sections, in one place. State is read through useSyncExternalStore
 * so the static export prerenders the empty shell and the list hydrates from
 * localStorage on the client.
 *
 * Graded Reps (challenge/predict/bloch) whose content cached a `kind` + raw
 * fence `source` are re-mounted as their LIVE widgets — a due review is a
 * genuine re-attempt, objectively graded through each widget's own
 * gradeCardIfDue (the card is due by construction, so the solve advances the
 * schedule). Everything else — authored qcards, and Rep content cached before
 * kind/source existed — falls back to the text recall ReviewCard.
 *
 * The session ROSTER is sticky: grading a card re-fires "qc-progress" and it
 * leaves the due list, but it stays mounted (showing its own solved/graded
 * state) instead of vanishing mid-read — otherwise a predict Rep would unmount
 * at the exact moment it reveals its outcome. The "due now" count stays live.
 *
 * The snapshot is a single string ("dueIds|total") so it is a stable value-equal
 * value for React's snapshot check — returning an object would churn identity.
 */

// Lazy like widget-fence.tsx: each live widget stays in its own chunk and only
// loads when a card of its kind is actually on the roster.
function liveSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="my-8 min-h-[240px] animate-pulse rounded-card border border-gray-200/80 bg-gray-50/70 dark:border-gray-700/40 dark:bg-white/[0.02] motion-reduce:animate-none"
    />
  );
}

type SourceWidget = ComponentType<{ source: string }>;

const LIVE_WIDGETS: Record<CardKind, SourceWidget> = {
  challenge: dynamic(() => import("@/components/quantum/challenge").then((m) => ({ default: m.Challenge })), {
    ssr: false,
    loading: liveSkeleton,
  }),
  predict: dynamic(() => import("@/components/quantum/predict-widget").then((m) => ({ default: m.PredictWidget })), {
    ssr: false,
    loading: liveSkeleton,
  }),
  bloch: dynamic(() => import("@/components/quantum/bloch-target-widget").then((m) => ({ default: m.BlochTargetWidget })), {
    ssr: false,
    loading: liveSkeleton,
  }),
};

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

  // Session-sticky roster: the union of every id seen due this mount, in
  // first-seen order. Merged with the guarded adjust-state-during-render
  // pattern (not an effect) so a just-graded card never flashes out before
  // paint; `merged` renders the union immediately this same pass.
  const [roster, setRoster] = useState<string[]>([]);
  const missing = dueIds.filter((id) => !roster.includes(id));
  if (missing.length > 0) setRoster([...roster, ...missing]);
  const merged = missing.length > 0 ? [...roster, ...missing] : roster;

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

      {merged.length === 0 ? (
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
          {merged.map((id) => {
            const content = getCardContent(id);
            if (!content) return null;
            // A corrupt/unknown stored kind indexes to undefined and falls back.
            const Live = content.kind && content.source ? LIVE_WIDGETS[content.kind] : undefined;
            if (Live) return <Live key={id} source={content.source!} />;
            const source = JSON.stringify({ id, prompt: content.prompt, answer: content.answer });
            return <ReviewCard key={id} source={source} />;
          })}
        </div>
      )}
    </div>
  );
}
