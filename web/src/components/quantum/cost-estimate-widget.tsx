"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseCostEstimate } from "@/lib/cost-estimate-schema";
import {
  costEstimateTruth,
  gradeCostEstimate,
  costEstimateReviewAnswer,
  fmtUsd,
} from "@/lib/cost-estimate-grade";
import { costCardId, ratingForPrediction } from "@/lib/challenge-review";
import { gradeCardIfDue, getCardState, setCardContent } from "@/lib/review-store";
import { nextIntervalDays } from "@/lib/review-schedule";
import { PRICING, costLabel } from "./cost";
import { usePersistentSolved } from "./use-persistent-solved";
import { Chip, ErrorCard, WidgetCard, primaryActionClass } from "./widget-ui";
import { formatFixed } from "./format";

/**
 * A cost-estimate Rep rendered from a ```qcostestimate fenced block. The
 * learner prices a described hardware run in their head and commits to one of
 * four dollar figures BEFORE the itemized breakdown is revealed. The three
 * distractors are the canonical pricing-model misconceptions (forgot the task
 * fee / forgot the shots / charged the task fee per shot), so a miss diagnoses
 * exactly what was dropped. Grading feeds FSRS through the shared adapter
 * (costCardId + ratingForPrediction) — one irreversible commit, like predict.
 *
 * The reveal also states what those shots BUY: the standard error of an
 * estimated probability at p = 0.5 is 1/(2√N) — shots purchase statistical
 * precision, never hardware fidelity.
 *
 * Data shape (JSON inside the fence):
 *   { "id": "...", "prompt": "...", "provider": "IonQ", "shots": 2000,
 *     "tasks"?: 1, "hint"?: "..." }
 */

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const OPTION_BASE =
  "rounded-control border px-3 py-1.5 font-mono text-sm tabular-nums interactive focus-ring disabled:cursor-default";
const TONE = {
  neutral:
    "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
  selected: "border-accent/50 bg-accent/15 text-accent-dark dark:text-accent-light",
  correct: "border-accent/60 bg-accent/15 text-accent-dark dark:text-accent-light",
  wrong: "border-warm/60 bg-warm/10 text-warm-dark dark:text-warm-light",
};

// Two significant figures below 1%, one decimal above — a fixed one-decimal
// display would round 1,000,000 shots' 0.05% up to "0.1%", overstating the
// error 2x in the note whose whole point is honesty.
const fmtSePercent = (v: number): string =>
  v >= 1 ? formatFixed(v, 1) : String(parseFloat(v.toPrecision(2)));

export function CostEstimateWidget({
  source,
  surface = "lesson",
}: {
  source: string;
  /** "review" when mounted on /review — the schedule note drops the "Added to your review" phrasing. */
  surface?: "lesson" | "review";
}) {
  const parsed = useMemo(() => parseCostEstimate(source), [source]);
  const spec = parsed.spec;
  // On /review, salt the option ORDER with the card's repetition count so a
  // scheduled re-review shuffles fresh — position memory must not grade as
  // mastery. Lesson mounts stay unsalted (stable layout), like expectation.
  const truthResult = useMemo<ReturnType<typeof costEstimateTruth>>(() => {
    if (!spec) return { error: "no spec" };
    const salt = surface === "review" ? getCardState(costCardId(spec.id))?.reps ?? 0 : undefined;
    return costEstimateTruth(spec, salt);
  }, [spec, surface]);
  const truth = truthResult.truth;

  const cardId = costCardId(spec?.id ?? "invalid");
  // The uniform solved-once-ever flag (qc:cost:<id>). Only a correct commit
  // marks it; the header chip stays a verdict of THIS commit (a pre-commit
  // "Correct" would misdescribe the fresh attempt), so the read is unused.
  const [, markSolved] = usePersistentSolved("cost", spec?.id ?? "invalid");
  const [selected, setSelected] = useState<number | null>(null);
  const [committed, setCommitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [scheduled, setScheduled] = useState<number | null>(null);
  // One persistent live region announces the verdict: swapping text in a
  // mounted region is reliably announced, mounting a new region is not. Focus
  // moves here when the commit unmounts the focused Lock button.
  const outcomeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (committed) outcomeRef.current?.focus();
  }, [committed]);

  // Cache content — including the raw fence source — so /review can re-mount
  // this Rep as a LIVE re-attempt (fresh mount = fresh estimate).
  useEffect(() => {
    if (spec && truth) {
      setCardContent(cardId, {
        prompt: spec.prompt,
        answer: costEstimateReviewAnswer(spec, truth),
        kind: "cost",
        source,
      });
    }
  }, [spec, truth, cardId, source]);

  if (!spec) return <ErrorCard label="cost-estimate" message={parsed.error} />;
  if (!truth) return <ErrorCard label="cost-estimate" message={truthResult.error} />;

  const rates = PRICING[spec.provider];
  const perTask = "perShot" in rates ? rates.perTask : 0;
  const perShot = "perShot" in rates ? rates.perShot : 0;
  // Hints may reference the live rates via placeholders so authored prose can
  // never drift from the pricing table the grading actually uses.
  const hintText = spec.hint
    ?.replaceAll("{perTask}", fmtUsd(perTask))
    .replaceAll("{perShot}", `$${perShot}`)
    .replaceAll("{shots}", spec.shots.toLocaleString("en-US"));

  const commit = () => {
    if (committed || selected === null) return;
    const isCorrect = gradeCostEstimate(selected, truth);
    setCorrect(isCorrect);
    setCommitted(true);
    const graded = gradeCardIfDue(cardId, ratingForPrediction(isCorrect));
    if (graded) setScheduled(nextIntervalDays(graded));
    if (isCorrect) markSolved();
  };

  const optionTone = (i: number): string => {
    if (!committed) return selected === i ? TONE.selected : TONE.neutral;
    if (i === truth.correctIndex) return TONE.correct;
    if (selected === i) return TONE.wrong;
    return TONE.neutral;
  };

  return (
    <WidgetCard
      eyebrow="Cost estimate"
      headerRight={
        committed ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-xs font-semibold ${
              correct
                ? "bg-accent/10 text-accent-dark dark:text-accent-light"
                : "bg-warm/10 text-warm-dark dark:text-warm-light"
            }`}
          >
            {correct && <CheckIcon />}
            {correct ? "Correct" : "Not quite"}
          </span>
        ) : undefined
      }
    >
      <div className="px-4 py-4 sm:px-5">
        <p className="text-[0.95rem] leading-relaxed text-gray-800 dark:text-gray-200">{spec.prompt}</p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip>{spec.provider}</Chip>
          <Chip>
            {spec.shots.toLocaleString("en-US")} shots × {spec.tasks} task{spec.tasks === 1 ? "" : "s"}
          </Chip>
          <Chip>{costLabel(spec.provider)}</Chip>
        </div>

        {/* Toggle buttons, not fake radios: role=radio without the roving-
            tabindex arrow-key contract contradicts what a screen reader
            announces. aria-pressed keeps native button keyboard behavior and
            the fieldset legend names the group. */}
        <fieldset className="mt-4 m-0 border-0 p-0" disabled={committed}>
          <legend className="mb-1.5 text-[11px] text-caption">What does this run cost?</legend>
          <div className="flex flex-wrap gap-2">
            {truth.options.map((v, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={selected === i}
                onClick={() => !committed && setSelected(i)}
                disabled={committed}
                className={`${OPTION_BASE} ${optionTone(i)}`}
              >
                {fmtUsd(v)}
              </button>
            ))}
          </div>
        </fieldset>

        {!committed ? (
          <button
            type="button"
            onClick={commit}
            disabled={selected === null}
            className={`mt-4 inline-flex items-center gap-1.5 ${primaryActionClass}`}
          >
            <CheckIcon />
            Lock in estimate
          </button>
        ) : (
          <>
            <div
              role="region"
              aria-label="Itemized cost"
              className="mt-4 rounded-control border-l-2 border-accent/60 bg-accent/5 dark:bg-accent/10 px-3.5 py-3 animate-fade-up"
            >
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-accent-dark dark:text-accent-light">
                Itemized
              </span>
              <dl className="space-y-1 font-mono text-sm tabular-nums text-gray-700 dark:text-gray-200">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 dark:text-gray-400">
                    Task fees — {spec.tasks} × {fmtUsd(perTask)}
                  </dt>
                  <dd>{fmtUsd(truth.taskFee)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 dark:text-gray-400">
                    Shots — {spec.tasks} × {spec.shots.toLocaleString("en-US")} × ${perShot}
                  </dt>
                  <dd>{fmtUsd(truth.shotFee)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-accent/20 pt-1 font-semibold">
                  <dt>Total</dt>
                  <dd>{fmtUsd(truth.correct)}</dd>
                </div>
              </dl>
              <p className="mt-2.5 text-xs leading-relaxed text-caption">
                What those shots buy: at p = 0.5 the standard error of an estimated
                probability is 1/(2&#8730;N) — {spec.shots.toLocaleString("en-US")} shots per task pin
                an outcome to about &#177;{fmtSePercent(truth.sePercentPerTask)}%. Shots purchase
                statistical precision, not hardware fidelity.
              </p>
            </div>

            {hintText && !correct && (
              <p className="mt-3 text-sm leading-relaxed text-warm-dark dark:text-warm-light">{hintText}</p>
            )}
          </>
        )}

        {/* Persistent outcome region: the verdict is announced by a text swap
            in an always-mounted role=status node, and focus lands here when
            the commit unmounts the Lock button (matching bloch-target). */}
        <div ref={outcomeRef} role="status" tabIndex={-1} className="focus:outline-none">
          {committed && (
            <p
              className={`mt-3 text-sm font-medium tabular-nums animate-fade-up ${
                correct
                  ? "text-accent-dark dark:text-accent-light"
                  : "text-warm-dark dark:text-warm-light"
              }`}
            >
              {correct
                ? `Correct — this run costs ${fmtUsd(truth.correct)}.`
                : `Not quite — this run costs ${fmtUsd(truth.correct)}.`}
            </p>
          )}
          {committed && scheduled !== null && (
            <p className="mt-1 text-xs text-caption animate-fade-up">
              {surface === "review"
                ? scheduled <= 1
                  ? "Reviewed — next review tomorrow."
                  : `Reviewed — next review in ${scheduled} days.`
                : scheduled <= 1
                  ? "Added to your review — back tomorrow."
                  : `Added to your review — back in ${scheduled} days.`}
            </p>
          )}
        </div>
      </div>
    </WidgetCard>
  );
}
