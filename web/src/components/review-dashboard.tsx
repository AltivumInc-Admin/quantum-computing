"use client";

import { useMemo, useState, useSyncExternalStore, type ComponentType } from "react";
import dynamic from "next/dynamic";
import {
  dueCardIds,
  getAllCardIds,
  getCardContent,
  subscribe,
  KIND_LABELS,
  type CardKind,
} from "@/lib/review-store";
import { ReviewCard } from "@/components/quantum/review-card";
// The lean primitives module, not ./widget-ui — this route's own chunk has no
// use for the math kernel, the Dirac readout or CopyButton.
import { CheckIcon, VerdictBadge } from "@/components/quantum/error-card";

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
      className="my-8 min-h-[240px] animate-pulse rounded-card glass motion-reduce:animate-none"
    />
  );
}

/**
 * A Rep widget as this surface consumes it. All six accept the optional
 * `surface` prop, so the registry can hold them directly — the six one-line
 * wrapper components that existed only to pin surface="review" are gone, and
 * the single call site passes it instead.
 */
type SourceWidget = ComponentType<{ source: string; surface?: "lesson" | "review" }>;

/** widget-fence.tsx's lazyWidget, minus the skeleton-height parameter. */
function liveWidget(
  factory: () => Promise<{ default: SourceWidget }>,
): SourceWidget {
  return dynamic(factory, { ssr: false, loading: liveSkeleton });
}

// Each live widget is mounted surface="review": the challenge suppresses its
// persistent solved-once-ever badge (this surface asks for a fresh attempt)
// and the schedule notes read "Reviewed — next review in N days".
const LIVE_WIDGETS: Record<CardKind, SourceWidget> = {
  challenge: liveWidget(() => import("@/components/quantum/challenge").then((m) => ({ default: m.Challenge }))),
  predict: liveWidget(() => import("@/components/quantum/predict-widget").then((m) => ({ default: m.PredictWidget }))),
  bloch: liveWidget(() => import("@/components/quantum/bloch-target-widget").then((m) => ({ default: m.BlochTargetWidget }))),
  cost: liveWidget(() => import("@/components/quantum/cost-estimate-widget").then((m) => ({ default: m.CostEstimateWidget }))),
  debug: liveWidget(() => import("@/components/quantum/debug-circuit-widget").then((m) => ({ default: m.DebugCircuitWidget }))),
  expect: liveWidget(() => import("@/components/quantum/expectation-widget").then((m) => ({ default: m.ExpectationWidget }))),
};

/**
 * Resolve a stored `kind` to its live widget. OWN-PROPERTY membership, not a
 * raw index: `kind` is an unchecked cast out of localStorage (and the sync
 * backend), so `LIVE_WIDGETS["constructor"]` would resolve through the
 * prototype chain to `Object` — a truthy "component" React then invokes,
 * throwing "Objects are not valid as a React child" and taking out the whole
 * /review route (src/app carries no error boundary). The documented
 * "corrupt kind falls back to the recall card" guarantee lives here.
 */
function liveWidgetFor(kind: string | undefined): SourceWidget | undefined {
  return kind && Object.hasOwn(LIVE_WIDGETS, kind) ? LIVE_WIDGETS[kind as CardKind] : undefined;
}

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

function snapshot(): string {
  return `${dueCardIds().join(",")}|${getAllCardIds().length}`;
}

/** The decoder for `snapshot()`, kept adjacent to it so the pair reads as one. */
function parseSnapshot(key: string): { dueIds: string[]; total: number } {
  const [dueStr, totalStr] = key.split("|");
  return {
    dueIds: dueStr ? dueStr.split(",") : [],
    total: Number(totalStr) || 0,
  };
}

export function ReviewDashboard() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => "|0");

  const { dueIds, total } = useMemo(() => parseSnapshot(snap), [snap]);

  // Session-sticky roster, advanced with the guarded adjust-state-during-render
  // pattern (not an effect) so a just-graded card never flashes out before
  // paint. Runs once per snapshot change; `entries` renders this same pass.
  const [roster, setRoster] = useState<RosterState>({ key: "|0", entries: [] });
  let entries = roster.entries;
  if (roster.key !== snap) {
    const dueSet = new Set(dueIds);
    const prevDueSet = new Set(parseSnapshot(roster.key).dueIds);
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
  // Resolve content ONCE, here, so every downstream consumer agrees on what the
  // roster is. A due card whose content cache is missing (a failed/evicted
  // setCardContent, or a corrupt record) used to stay in `entries` and render
  // nothing — the "i / N" counter and its sr-only twin then skipped a number,
  // and a roster of only such cards drew a blank page under a "3 due now"
  // header with no empty state at all, because that state gated on
  // entries.length. Dropping them here restores the honest "Nothing due" copy.
  const items = entries.flatMap(({ id, gen }) => {
    const content = getCardContent(id);
    return content ? [{ id, gen, content }] : [];
  });
  const sessionComplete = items.length > 0 && dueIds.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-10">
        <p className="text-sm font-mono font-medium tracking-[0.2em] uppercase text-accent-dark dark:text-accent-light mb-3">
          Spaced repetition
        </p>
        <h1 className="font-display text-display-xl tracking-tight text-(--ink)">
          Review
        </h1>
        <p className="mt-4 text-lg text-caption leading-relaxed">
          Cards you have studied resurface here exactly when you are about to
          forget them. A few minutes now keeps the whole curriculum fresh.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm tabular-nums text-caption">
          <span>
            <span className="font-semibold text-(--mut)">{dueIds.length}</span> due
            now
          </span>
          {/* Decorative separator: tokenized (it was the tree's only
              text-gray-300/700 pair, invisible to a token retune) and hidden
              from AT, which read "3 due now slash 12 cards tracked". */}
          <span aria-hidden="true" className="text-caption opacity-50">
            /
          </span>
          <span>
            <span className="font-semibold text-(--mut)">{total}</span> card
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
            <CheckIcon size="h-3 w-3" />
            Session complete — every due card reviewed.
          </p>
          <p className="mt-1 text-xs text-caption">
            New reviews will appear here as their schedules come due.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-card glass shadow-(--shadow-resting) px-6 py-12 text-center">
          <p className="text-base font-medium text-caption">
            {total === 0 ? "No cards yet" : "Nothing due — you're caught up"}
          </p>
          <p className="mt-2 text-sm text-caption">
            {total === 0
              ? "Work through a lesson and grade its recall cards to start building a review schedule."
              : "Come back when more cards come due, or keep reading new lessons."}
          </p>
        </div>
      ) : (
        <ul role="list" className="m-0 list-none p-0">
          {items.map(({ id, gen, content }, i) => {
            // A corrupt/unknown stored kind falls back to the recall card — see
            // liveWidgetFor for why the membership test is own-property only.
            const Live = content.source ? liveWidgetFor(content.kind) : undefined;
            const kindLabel = Live ? KIND_LABELS[content.kind as CardKind] : "Recall";
            const done = !dueSet.has(id);
            return (
              <li key={`${id}:${gen}`} className="mt-10 first:mt-0">
                <span className="sr-only">
                  {`Review item ${i + 1} of ${items.length} — ${kindLabel}${done ? ", reviewed" : ""}`}
                </span>
                <div
                  aria-hidden="true"
                  className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest"
                >
                  <span className="text-caption tabular-nums">
                    {i + 1} / {items.length} · {kindLabel}
                  </span>
                  {done ? (
                    <VerdictBadge tone="accent" size="xs">
                      Reviewed
                    </VerdictBadge>
                  ) : (
                    <span className="rounded-chip border border-(--bd) bg-(--field) px-2 py-0.5 text-caption">
                      Due
                    </span>
                  )}
                </div>
                {/* The widgets carry their own vertical margins for lesson flow;
                    the roster owns spacing here, so neutralize them.

                    No group opacity on the graded branch: this roster is sticky
                    precisely so the learner can READ the outcome after grading,
                    and a wrapper opacity composites the card's TEXT too, taking
                    .text-caption and the accent schedule line under the 4.5:1 AA
                    floor in both themes (and invisibly to the class-scanning
                    contrast guards). The "Reviewed" badge above already carries
                    the done-ness signal unambiguously. */}
                <div className="[&>*]:my-0">
                  {Live ? (
                    <Live source={content.source!} surface="review" />
                  ) : (
                    <ReviewCard
                      source={JSON.stringify({ id, prompt: content.prompt, answer: content.answer })}
                    />
                  )}
                </div>
                {/* Failure remediation for live re-attempts: the recall answer is
                    already cached — a stuck learner should not be dead-ended. */}
                {Live && !done && (
                  <details className="mt-2 text-xs">
                    {/* py-1 (not the bare px-1 this had) clears WCAG 2.5.8's
                        24px target: 16px line-box + 2 x 4px. */}
                    <summary className="inline-flex cursor-pointer rounded-control px-1 py-1 text-caption focus-ring">
                      Stuck? Show a correct answer
                    </summary>
                    <p className="mt-1 px-1 font-mono text-sm text-caption">
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
