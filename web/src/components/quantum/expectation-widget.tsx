"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseExpectation } from "@/lib/expectation-schema";
import {
  expectationTruth,
  gradeExpectation,
  expectationReviewAnswer,
  observableLabel,
  pauliString,
  fmtExpectation,
} from "@/lib/expectation-grade";
import { expectCardId, ratingForPrediction } from "@/lib/challenge-review";
import { gradeCardIfDue, getCardState, setCardContent } from "@/lib/review-store";
import { nextIntervalDays } from "@/lib/review-schedule";
import { Chip, ErrorCard, WidgetCard, primaryActionClass } from "./widget-ui";

/**
 * An expectation-value Rep rendered from a ```qexpect fenced block. The
 * learner reads a concrete circuit and a Pauli-string observable, works out
 * ⟨ψ|P|ψ⟩ in their head, and commits to one of four values BEFORE the reveal.
 * The three distractors are the canonical misconceptions (sign flip / ⟨P⟩
 * confused with P(+1) / expecting a definite ±1 reading), so a miss diagnoses
 * exactly which mental model slipped. One irreversible commit, like predict —
 * grading feeds FSRS through expectCardId + ratingForPrediction.
 *
 * The reveal tells the single-shot story: one measurement of P returns an
 * EIGENVALUE (+1 or −1) with P(+1) = (1 + ⟨P⟩)/2 — the expectation is the
 * long-run average of ±1 readings, the primitive every VQE energy term and
 * QML cost function is built from.
 *
 * Data shape (JSON inside the fence):
 *   { "id": "...", "prompt": "...", "program": "H 0", "observable": "Z 0",
 *     "qubits"?: 1, "hint"?: "..." }
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

export function ExpectationWidget({
  source,
  surface = "lesson",
}: {
  source: string;
  /** "review" when mounted on /review — the schedule note drops the "Added to your review" phrasing. */
  surface?: "lesson" | "review";
}) {
  const parsed = useMemo(() => parseExpectation(source), [source]);
  const spec = parsed.spec;
  // On /review, salt the option ORDER with the card's repetition count so a
  // scheduled re-review shuffles fresh — position memory must not grade as
  // mastery. Lesson mounts stay unsalted (stable layout, like cost-estimate).
  const truthResult = useMemo<ReturnType<typeof expectationTruth>>(() => {
    if (!spec) return { error: "no spec" };
    const salt =
      surface === "review" ? getCardState(`expect:${spec.id}`)?.reps ?? 0 : undefined;
    return expectationTruth(spec, salt);
  }, [spec, surface]);
  const truth = truthResult.truth;

  const cardId = expectCardId(spec?.id ?? "invalid");
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
  // this Rep as a LIVE re-attempt (fresh mount = fresh commit).
  useEffect(() => {
    if (spec && truth) {
      setCardContent(cardId, {
        prompt: spec.prompt,
        answer: expectationReviewAnswer(spec, truth),
        kind: "expect",
        source,
      });
    }
  }, [spec, truth, cardId, source]);

  if (!spec) return <ErrorCard label="expectation" message={parsed.error} />;
  if (!truth) return <ErrorCard label="expectation" message={truthResult.error} />;

  const programSteps = spec.program
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const label = observableLabel(truth.factors);
  const bareLabel = pauliString(truth.factors); // a shot measures the OPERATOR, not ⟨…⟩

  const commit = () => {
    if (committed || selected === null) return;
    const isCorrect = gradeExpectation(selected, truth);
    setCorrect(isCorrect);
    setCommitted(true);
    const graded = gradeCardIfDue(cardId, ratingForPrediction(isCorrect));
    if (graded) setScheduled(nextIntervalDays(graded));
  };

  const optionTone = (i: number): string => {
    if (!committed) return selected === i ? TONE.selected : TONE.neutral;
    if (i === truth.correctIndex) return TONE.correct;
    if (selected === i) return TONE.wrong;
    return TONE.neutral;
  };

  return (
    <WidgetCard
      eyebrow="Expectation value"
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

        <div className="mt-3 rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5">
          <pre className="m-0 whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200">
            {programSteps.join("\n")}
          </pre>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip>observable {label}</Chip>
          <Chip>
            {truth.n} qubit{truth.n === 1 ? "" : "s"}
          </Chip>
        </div>

        {/* Toggle buttons, not fake radios — same rationale as cost-estimate:
            aria-pressed keeps native button keyboard behavior and the fieldset
            legend names the group. */}
        <fieldset className="mt-4 m-0 border-0 p-0" disabled={committed}>
          <legend className="mb-1.5 text-[11px] text-caption">What is {label} for this state?</legend>
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
                {fmtExpectation(v)}
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
            Lock in prediction
          </button>
        ) : (
          <>
            <div
              role="region"
              aria-label="What a measurement returns"
              className="mt-4 rounded-control border-l-2 border-accent/60 bg-accent/5 dark:bg-accent/10 px-3.5 py-3 animate-fade-up"
            >
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-accent-dark dark:text-accent-light">
                The single-shot story
              </span>
              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                One measurement of {bareLabel} returns an eigenvalue, +1 or −1 — never{" "}
                <span className="font-mono tabular-nums">{fmtExpectation(truth.value)}</span> itself.
                It reads +1 with probability (1 + {label})/2 ={" "}
                <span className="font-mono tabular-nums">{fmtExpectation(truth.pPlus)}</span>, and the
                long-run average of those ±1 readings is the expectation{" "}
                <span className="font-mono tabular-nums">{fmtExpectation(truth.value)}</span>. Every VQE
                energy term and QML cost function is estimated exactly this way.
              </p>
            </div>

            {spec.hint && !correct && (
              <p className="mt-3 text-sm leading-relaxed text-warm-dark dark:text-warm-light">{spec.hint}</p>
            )}
          </>
        )}

        {/* Persistent outcome region: the verdict is announced by a text swap
            in an always-mounted role=status node, and focus lands here when
            the commit unmounts the Lock button (matching cost-estimate). */}
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
                ? `Correct — ${label} = ${fmtExpectation(truth.value)}.`
                : `Not quite — ${label} = ${fmtExpectation(truth.value)}.`}
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
