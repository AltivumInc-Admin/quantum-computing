"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
// The LEAN import path (./error-card, not ./widget-ui): quiz needs only the
// shell, the failure card, the eyebrow and the reveal-panel tones, and
// widget-ui statically pulls the math kernel, the Dirac state readout, format
// and CopyButton — none of which quiz can execute — straight into this
// widget's own code-split chunk.
import { cardShell, ErrorCard, EyebrowLabel, REVEAL_PANEL } from "./error-card";
import { parseQuiz, quizCardId } from "@/lib/quiz-schema";
import { gradeCardIfDue, setCardContent } from "@/lib/review-store";
import {
  nextIntervalDays,
  reviewDayPhrase,
  type CardState,
  type Rating,
} from "@/lib/review-schedule";
import { useLocale } from "@/i18n";

/**
 * Interactive self-check rendered from a ```quiz fenced block in a GUIDE.
 * Each question carries an optional thoughtful hint and a worked answer; the
 * learner reveals the answer, then self-rates (Again / Hard / Good / Easy).
 * A rating writes an FSRS card under `quiz:<id>` so the question resurfaces
 * on /review — the same mastery loop as ```qcard, for multi-question section
 * checkpoints (placement quiz, end-of-module checks).
 *
 * Data shape (JSON inside the fence) — parsed by @/lib/quiz-schema, which the
 * GUIDE-corpus gate validates at build time:
 *   { "questions": [ { "id": "...", "q": "...", "hint": "...", "a": "..." }, ... ] }
 *
 * IMPORTANT: never rename or reuse a question `id` — it is the localStorage
 * key, so a changed id silently orphans a learner's progress on that card.
 *
 * Rendering is client-side: like every fenced widget this mounts behind
 * widget-fence's approach gate with `ssr:false`, so the answer text arrives in
 * the RSC payload rather than as server-rendered DOM, and the reveal toggles it
 * into the document.
 *
 * Field bodies use only inline `code` (no block math), so a tiny inline
 * formatter handles rendering — keeping this component free of the ESM-only
 * markdown pipeline, exactly like CircuitLab.
 */

// Backtick-delimited spans become branded inline-code chips; everything else is
// plain text. Sufficient for the quiz content and keeps this a CommonJS-testable
// client component (no react-markdown import).
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function HintIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 18h6m-5 3h4m-6.6-7.3A6 6 0 1118 10c0 1.6-.8 3-2 3.9-.6.5-1 1.1-1 1.8v.3H9v-.3c0-.7-.4-1.3-1-1.8a5.9 5.9 0 01-.6-.5z"
      />
    </svg>
  );
}

// Same four-button strip as ReviewCard — tones stay local; labels come from t().
const RATING_TONES: Record<Rating, string> = {
  again: "border-warm/40 bg-warm/5 text-warm-dark dark:text-warm-light hover:bg-warm/10",
  hard: "border-(--bd) bg-(--field) text-(--mut) hover:bg-gray-100 dark:hover:bg-gray-800",
  good: "border-accent/30 bg-accent/5 text-accent-dark dark:text-accent-light hover:bg-accent/10",
  easy: "border-accent/40 bg-accent/10 text-accent-dark dark:text-accent-light hover:bg-accent/20",
};
const RATING_ORDER: Rating[] = ["again", "hard", "good", "easy"];

type GradeOutcome =
  | { kind: "graded"; state: CardState }
  | { kind: "noop" };

export function Quiz({ source }: { source: string }) {
  const { t } = useLocale();
  const quiz = useMemo(() => parseQuiz(source), [source]);
  const [openHints, setOpenHints] = useState<ReadonlySet<number>>(new Set());
  const [openAnswers, setOpenAnswers] = useState<ReadonlySet<number>>(new Set());
  // Per-question grade outcome, keyed by author id. Cleared never mid-session:
  // a not-due re-rate just flips the same key to "noop".
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, GradeOutcome>>(
    () => new Map(),
  );
  const baseId = useId();

  // Cache every question's prompt/answer so /review can re-mount from the
  // schedule alone (the schedule is keyed by card id only). Same contract as
  // ReviewCard — a graded card whose content was never cached is dropped from
  // the roster.
  useEffect(() => {
    if (quiz.error) return;
    for (const item of quiz.questions) {
      setCardContent(quizCardId(item.id), {
        prompt: item.q,
        answer: item.a,
      });
    }
  }, [quiz]);

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<ReadonlySet<number>>>,
    i: number,
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (quiz.error) {
    return <ErrorCard label={t("quiz.parseError")} message={quiz.error} className="my-8" />;
  }

  const allOpen =
    quiz.questions.length > 0 && openAnswers.size === quiz.questions.length;

  const toggleAll = () =>
    setOpenAnswers(
      allOpen ? new Set() : new Set(quiz.questions.map((_, i) => i)),
    );

  // Due-gated like ReviewCard / graded Reps: re-rating a card that is no
  // longer due must not advance the schedule.
  const onGrade = (questionId: string, rating: Rating) => {
    const next = gradeCardIfDue(quizCardId(questionId), rating);
    setOutcomes((prev) => {
      const map = new Map(prev);
      map.set(
        questionId,
        next ? { kind: "graded", state: next } : { kind: "noop" },
      );
      return map;
    });
  };

  return (
    <div className={`not-prose my-8 overflow-hidden ${cardShell}`}>
      <div className="flex items-center justify-between gap-3 border-b border-(--bd) px-4 sm:px-5 py-3">
        {/* Section-neutral: the same fence is a placement test in 00-prereqs
            and an end-of-module retention check in the other four sections,
            whose own headings say "check yourself" — a hardcoded "Placement
            quiz" contradicted the heading directly above it in 4 of 5 sites. */}
        <EyebrowLabel strong>{t("quiz.eyebrow")}</EyebrowLabel>
        {/* No aria-pressed: the label already flips, and "Hide all answers,
            pressed" announces a state opposite to what the label names. The
            per-question controls use aria-expanded for the same reason. */}
        <button
          type="button"
          onClick={toggleAll}
          className="inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-medium text-caption hover:text-accent-dark dark:hover:text-accent-light hover:bg-accent/5 interactive focus-ring"
        >
          {allOpen ? t("quiz.hideAll") : t("quiz.showAll")}
          <ChevronIcon open={allOpen} />
        </button>
      </div>

      <ol className="list-none m-0 p-0 divide-y divide-(--bd)">
        {quiz.questions.map((item, i) => {
          const hintOpen = openHints.has(i);
          const answerOpen = openAnswers.has(i);
          const hintId = `${baseId}-hint-${i}`;
          const answerId = `${baseId}-answer-${i}`;
          const outcome = outcomes.get(item.id);
          return (
            <li key={item.id} className="flex gap-3 sm:gap-4 px-4 sm:px-5 py-4">
              <span className="shrink-0 w-9 h-9 rounded-chip bg-accent/10 text-accent-dark dark:text-accent-light font-bold text-sm flex items-center justify-center font-mono tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-[0.95rem] leading-relaxed text-(--ink)">
                  {renderInline(item.q)}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {item.hint && (
                    <button
                      type="button"
                      onClick={() => toggle(setOpenHints, i)}
                      aria-expanded={hintOpen}
                      aria-controls={hintOpen ? hintId : undefined}
                      className="inline-flex items-center gap-1.5 rounded-control border border-warm/40 bg-warm/5 px-2.5 py-1 text-xs font-medium text-warm-dark dark:text-warm-light interactive focus-ring hover:bg-warm/10"
                    >
                      <HintIcon />
                      {hintOpen ? t("quiz.hideHint") : t("quiz.hint")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggle(setOpenAnswers, i)}
                    aria-expanded={answerOpen}
                    aria-controls={answerOpen ? answerId : undefined}
                    className="inline-flex items-center gap-1.5 rounded-control border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent-dark dark:text-accent-light interactive focus-ring hover:bg-accent/10"
                  >
                    {answerOpen ? t("quiz.hideAnswer") : t("quiz.showAnswer")}
                    <ChevronIcon open={answerOpen} />
                  </button>
                </div>

                {/* role="group", not role="region": a named region IS a
                    landmark, so "Show all answers" on the 10-question
                    00-prereqs quiz would inject ten landmarks into the rotor at
                    once. The role cannot simply be dropped — aria-label on a
                    bare div is prohibited naming on role=generic — and group
                    conveys the same containment without entering the rotor. */}
                {item.hint && hintOpen && (
                  <div
                    id={hintId}
                    role="group"
                    aria-label={`Hint for question ${i + 1}`}
                    className={`mt-3 rounded-control ${REVEAL_PANEL.warm} px-3.5 py-3 animate-fade-up`}
                  >
                    <EyebrowLabel strong tone="warm" className="block mb-1">
                      {t("quiz.hintLabel")}
                    </EyebrowLabel>
                    <p className="text-sm leading-relaxed text-(--mut)">
                      {renderInline(item.hint)}
                    </p>
                  </div>
                )}

                {answerOpen && (
                  <div
                    id={answerId}
                    role="group"
                    aria-label={`Answer to question ${i + 1}`}
                    className={`mt-3 rounded-control ${REVEAL_PANEL.accent} px-3.5 py-3 animate-fade-up`}
                  >
                    <EyebrowLabel strong className="block mb-1">
                      {t("quiz.answerLabel")}
                    </EyebrowLabel>
                    <p className="text-sm leading-relaxed text-(--mut)">
                      {renderInline(item.a)}
                    </p>

                    <div className="mt-3 border-t border-accent/15 pt-3">
                      <span className="block text-[11px] text-caption mb-1.5">
                        {t("quiz.howWell")}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {RATING_ORDER.map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => onGrade(item.id, rating)}
                            className={`rounded-control border px-3 py-1.5 text-sm font-medium interactive focus-ring ${RATING_TONES[rating]}`}
                          >
                            {t(`quiz.${rating}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {outcome && (
                  <p
                    role="status"
                    className="mt-3 text-sm text-caption animate-fade-up"
                  >
                    {outcome.kind === "noop"
                      ? t("quiz.outcomeNoop")
                      : t("quiz.outcomeScheduled", {
                          phrase: reviewDayPhrase(nextIntervalDays(outcome.state), t),
                        })}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
