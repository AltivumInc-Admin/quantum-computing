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
 * Graded Reps whose content cached a `kind` + raw
 * fence `source` are re-mounted as their LIVE widgets — a due review is a
 * genuine re-attempt, objectively graded through each widget's own
 * gradeCardIfDue (the card is due by construction, so the solve advances the
 * schedule). Everything else — authored qcards, and Rep content cached before
 * kind/source existed — falls back to the text recall ReviewCard, which is
 * itself due-gated so a lingering card can't be re-graded into interval
 * inflation.
 *
 * The session ROSTER is sticky: grading a card removes it from the due list
 * but keeps it mounted (marked "Reviewed") instead of vanishing mid-read —
 * otherwise a predict Rep would unmount at the exact moment it reveals its
 * outcome. Each entry carries a GENERATION: if a rostered card comes due
 * again while still mounted (a tab left open past the UTC day boundary), its
 * generation bumps and the changed key remounts the widget fresh, so the new
 * due window gets a genuine re-attempt instead of a spent, locked widget.
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

const ChallengeLive = dynamic(() => import("@/components/quantum/challenge").then((m) => ({ default: m.Challenge })), {
  ssr: false,
  loading: liveSkeleton,
});
const PredictLive = dynamic(() => import("@/components/quantum/predict-widget").then((m) => ({ default: m.PredictWidget })), {
  ssr: false,
  loading: liveSkeleton,
});
const BlochLive = dynamic(() => import("@/components/quantum/bloch-target-widget").then((m) => ({ default: m.BlochTargetWidget })), {
  ssr: false,
  loading: liveSkeleton,
});
const CostLive = dynamic(() => import("@/components/quantum/cost-estimate-widget").then((m) => ({ default: m.CostEstimateWidget })), {
  ssr: false,
  loading: liveSkeleton,
});
const DebugLive = dynamic(() => import("@/components/quantum/debug-circuit-widget").then((m) => ({ default: m.DebugCircuitWidget })), {
  ssr: false,
  loading: liveSkeleton,
});
const ExpectLive = dynamic(() => import("@/components/quantum/expectation-widget").then((m) => ({ default: m.ExpectationWidget })), {
  ssr: false,
  loading: liveSkeleton,
});

type SourceWidget = ComponentType<{ source: string }>;

// Each live widget is mounted surface="review": the challenge suppresses its
// persistent solved-once-ever badge (this surface asks for a fresh attempt)
// and the schedule notes read "Reviewed — next review in N days".
const LIVE_WIDGETS: Record<CardKind, SourceWidget> = {
  challenge: function ChallengeReview({ source }) {
    return <ChallengeLive source={source} surface="review" />;
  },
  predict: function PredictReview({ source }) {
    return <PredictLive source={source} surface="review" />;
  },
  bloch: function BlochReview({ source }) {
    return <BlochLive source={source} surface="review" />;
  },
  cost: function CostReview({ source }) {
    return <CostLive source={source} surface="review" />;
  },
  debug: function DebugReview({ source }) {
    return <DebugLive source={source} surface="review" />;
  },
  expect: function ExpectReview({ source }) {
    return <ExpectLive source={source} surface="review" />;
  },
};

const KIND_LABELS: Record<CardKind, string> = {
  challenge: "Circuit challenge",
  predict: "Prediction",
  bloch: "Bloch target",
  cost: "Cost estimate",
  debug: "Fix the circuit",
  expect: "Expectation value",
};

interface RosterEntry {
  id: string;
  /** Bumps when the card RE-enters the due list while rostered — the changed key remounts the widget fresh. */
  gen: number;
}

interface RosterState {
  /** The snapshot string these entries were derived from (also encodes the previous due set). */
  key: string;
  entries: RosterEntry[];
}

function dueIdsOf(snapshotKey: string): string[] {
  const dueStr = snapshotKey.split("|")[0];
  return dueStr ? dueStr.split(",") : [];
}

function snapshot(): string {
  return `${dueCardIds().join(",")}|${getAllCardIds().length}`;
}

function CheckMark() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
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

  // Session-sticky roster, advanced with the guarded adjust-state-during-render
  // pattern (not an effect) so a just-graded card never flashes out before
  // paint. Runs once per snapshot change; `entries` renders this same pass.
  const [roster, setRoster] = useState<RosterState>({ key: "|0", entries: [] });
  let entries = roster.entries;
  if (roster.key !== snap) {
    const dueSet = new Set(dueIds);
    const prevDueSet = new Set(dueIdsOf(roster.key));
    // A rostered card re-entering the due list gets a new generation (fresh mount).
    entries = roster.entries.map((e) =>
      dueSet.has(e.id) && !prevDueSet.has(e.id) ? { id: e.id, gen: e.gen + 1 } : e,
    );
    const known = new Set(entries.map((e) => e.id));
    const fresh = dueIds.filter((id) => !known.has(id)).map((id) => ({ id, gen: 0 }));
    if (fresh.length > 0) entries = [...entries, ...fresh];
    setRoster({ key: snap, entries });
  }

  const dueSet = new Set(dueIds);
  const sessionComplete = entries.length > 0 && dueIds.length === 0;

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

      {sessionComplete && (
        <div
          role="status"
          className="mb-8 rounded-card border border-accent/30 bg-accent/5 dark:bg-accent/10 px-4 py-3 animate-fade-up"
        >
          <p className="inline-flex items-center gap-2 text-sm font-medium text-accent-dark dark:text-accent-light">
            <CheckMark />
            Session complete — every due card reviewed.
          </p>
          <p className="mt-1 text-xs text-caption">
            New reviews will appear here as their schedules come due.
          </p>
        </div>
      )}

      {entries.length === 0 ? (
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
        <ul role="list" className="m-0 list-none p-0">
          {entries.map(({ id, gen }, i) => {
            const content = getCardContent(id);
            if (!content) return null;
            // A corrupt/unknown stored kind indexes to undefined and falls back.
            const Live = content.kind && content.source ? LIVE_WIDGETS[content.kind] : undefined;
            const kindLabel = Live ? KIND_LABELS[content.kind!] : "Recall";
            const done = !dueSet.has(id);
            return (
              <li key={`${id}:${gen}`} className="mt-10 first:mt-0">
                <span className="sr-only">
                  {`Review item ${i + 1} of ${entries.length} — ${kindLabel}${done ? ", reviewed" : ""}`}
                </span>
                <div
                  aria-hidden="true"
                  className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest"
                >
                  <span className="text-caption tabular-nums">
                    {i + 1} / {entries.length} · {kindLabel}
                  </span>
                  {done ? (
                    <span className="inline-flex items-center gap-1 rounded-chip bg-accent/10 px-2 py-0.5 text-accent-dark dark:text-accent-light">
                      <CheckMark />
                      Reviewed
                    </span>
                  ) : (
                    <span className="rounded-chip bg-gray-100 px-2 py-0.5 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      Due
                    </span>
                  )}
                </div>
                {/* The widgets carry their own vertical margins for lesson flow;
                    the roster owns spacing here, so neutralize them. */}
                <div className={`[&>*]:my-0 ${done ? "opacity-80" : ""}`}>
                  {Live ? (
                    <Live source={content.source!} />
                  ) : (
                    <ReviewCard
                      source={JSON.stringify({ id, prompt: content.prompt, answer: content.answer })}
                    />
                  )}
                </div>
                {/* Failure remediation for live re-attempts: the recall answer is
                    already cached — a stuck learner should not be dead-ended. */}
                {Live && !done && (
                  <details className="mt-2">
                    <summary className="inline-block cursor-pointer rounded-control px-1 text-xs text-caption focus-ring">
                      Stuck? Show a correct answer
                    </summary>
                    <p className="mt-1 px-1 font-mono text-sm text-gray-600 dark:text-gray-300">
                      {content.answer}
                    </p>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
