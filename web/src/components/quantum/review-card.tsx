"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  getCardStateRaw,
  gradeCard,
  setCardContent,
  PROGRESS_EVENT_NAME,
} from "@/lib/review-store";
import { nextIntervalDays, type CardState, type Rating } from "@/lib/review-schedule";

/**
 * A spaced-repetition review prompt rendered from a ```qcard fenced block in a
 * GUIDE. The author supplies a stable id, a prompt, and a worked answer; the
 * learner recalls, reveals, and self-grades. The schedule lives in localStorage
 * (review-store.ts) and resurfaces the card on the /review page when it comes due.
 *
 * Data shape (JSON inside the fence):
 *   { "id": "found-superposition-1", "prompt": "...", "answer": "..." }
 *
 * IMPORTANT: never rename or reuse an `id` — it is the localStorage key, so a
 * changed id silently orphans a learner's progress on that card.
 *
 * Like the other GUIDE widgets this avoids the ESM-only markdown pipeline: a tiny
 * inline formatter handles backtick `code` spans so it stays CommonJS-testable.
 */

interface CardSpec {
  id: string;
  prompt: string;
  answer: string;
}

interface ParsedCard {
  spec?: CardSpec;
  error?: string;
}

function parseCard(source: string): ParsedCard {
  try {
    const data = JSON.parse(source) as Partial<CardSpec>;
    if (typeof data.id !== "string" || !data.id.trim()) {
      throw new Error('card needs a non-empty string "id"');
    }
    if (typeof data.prompt !== "string" || typeof data.answer !== "string") {
      throw new Error('card needs string "prompt" and "answer" fields');
    }
    return { spec: { id: data.id, prompt: data.prompt, answer: data.answer } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, i) => {
    if (part.length >= 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded-chip bg-accent/10 px-1.5 py-0.5 font-mono text-[0.85em] text-accent-dark dark:text-accent-light"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Hydration-safe read of this card's persisted state (null on the server). */
function useCardState(id: string): CardState | null {
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener(PROGRESS_EVENT_NAME, cb);
      return () => window.removeEventListener(PROGRESS_EVENT_NAME, cb);
    },
    () => getCardStateRaw(id),
    () => null
  );
  return useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CardState;
    } catch {
      return null;
    }
  }, [raw]);
}

const RATINGS: { rating: Rating; label: string; tone: string }[] = [
  { rating: "again", label: "Again", tone: "border-warm/40 bg-warm/5 text-warm-dark dark:text-warm-light hover:bg-warm/10" },
  { rating: "hard", label: "Hard", tone: "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800" },
  { rating: "good", label: "Good", tone: "border-accent/30 bg-accent/5 text-accent-dark dark:text-accent-light hover:bg-accent/10" },
  { rating: "easy", label: "Easy", tone: "border-accent/40 bg-accent/10 text-accent-dark dark:text-accent-light hover:bg-accent/20" },
];

export function ReviewCard({ source }: { source: string }) {
  const parsed = useMemo(() => parseCard(source), [source]);
  const spec = parsed.spec;
  const state = useCardState(spec?.id ?? "");
  const [revealed, setRevealed] = useState(false);
  const [justGraded, setJustGraded] = useState<CardState | null>(null);
  const answerId = useId();

  // Cache the card's content so the /review page can re-render it from the
  // schedule (which is keyed by id only). Runs client-side after mount.
  useEffect(() => {
    if (spec) setCardContent(spec.id, { prompt: spec.prompt, answer: spec.answer });
  }, [spec]);

  if (!spec) {
    return (
      <div className="not-prose my-8 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3">
        <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
          card error: {parsed.error}
        </p>
      </div>
    );
  }

  const onGrade = (rating: Rating) => {
    const next = gradeCard(spec.id, rating);
    setJustGraded(next);
    setRevealed(false);
  };

  const reviewedBefore = state !== null;
  const feedback = justGraded;

  return (
    <div className="not-prose my-8 overflow-hidden rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting)">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 px-4 sm:px-5 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-dark dark:text-accent-light">
          Recall
        </span>
        {reviewedBefore && !feedback && (
          <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
            reviewed {state.reps === 1 ? "once" : `${state.reps}×`}
          </span>
        )}
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="text-[0.95rem] leading-relaxed text-gray-800 dark:text-gray-200">
          {renderInline(spec.prompt)}
        </p>

        {!revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-accent/30 bg-accent/5 px-3 py-1.5 text-sm font-medium text-accent-dark dark:text-accent-light interactive focus-ring hover:bg-accent/10"
          >
            Show answer
          </button>
        ) : (
          <>
            <div
              id={answerId}
              role="region"
              aria-label="Answer"
              className="mt-3 rounded-control border-l-2 border-accent/60 bg-accent/5 dark:bg-accent/10 px-3.5 py-3 animate-fade-up"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-widest text-accent-dark dark:text-accent-light mb-1">
                Answer
              </span>
              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {renderInline(spec.answer)}
              </p>
            </div>

            <div className="mt-3">
              <span className="block text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
                How well did you recall it?
              </span>
              <div className="flex flex-wrap gap-2">
                {RATINGS.map(({ rating, label, tone }) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => onGrade(rating)}
                    className={`rounded-control border px-3 py-1.5 text-sm font-medium interactive focus-ring ${tone}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {feedback && (
          <p
            role="status"
            className="mt-3 text-sm text-gray-500 dark:text-gray-400 animate-fade-up"
          >
            {nextIntervalDays(feedback) === 1
              ? "Next review tomorrow."
              : `Next review in ${nextIntervalDays(feedback)} days.`}
          </p>
        )}
      </div>
    </div>
  );
}
