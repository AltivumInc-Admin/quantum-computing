"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { parseChallenge } from "@/lib/challenge-schema";
import { gradeTs, type GradeResult } from "@/lib/challenge-grade";
import { gradeCardIfDue, setCardContent } from "@/lib/review-store";
import { challengeCardId, ratingForSolve, challengeReviewAnswer } from "@/lib/challenge-review";
import { nextIntervalDays } from "@/lib/review-schedule";

/**
 * A self-checking coding challenge rendered from a ```qchallenge fenced block.
 * The learner writes a circuit in the shared qsim DSL and clicks Check; Tier-A
 * grading runs entirely in-browser via the qcsim-parity kernel, comparing the
 * resulting state vector to the target up to global phase. No backend, no login.
 * Tier "py" defers to the Pyodide grader (free-form Braket Python), loaded
 * lazily only when such a challenge is checked.
 */

const PROGRESS_EVENT = "qc-progress";

function usePersistentSolved(key: string): [boolean, () => void] {
  const solved = useSyncExternalStore(
    (cb) => {
      window.addEventListener(PROGRESS_EVENT, cb);
      return () => window.removeEventListener(PROGRESS_EVENT, cb);
    },
    () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false
  );
  const mark = () => {
    try {
      localStorage.setItem(key, "1");
      window.dispatchEvent(new Event(PROGRESS_EVENT));
    } catch {
      /* storage unavailable — grading still works, just not remembered */
    }
  };
  return [solved, mark];
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const VERDICT_STYLES: Record<GradeResult["status"], string> = {
  solved:
    "border-l-2 border-accent/60 bg-accent/5 dark:bg-accent/10 text-accent-dark dark:text-accent-light",
  wrong:
    "border-l-2 border-warm/60 bg-warm/5 dark:bg-warm/10 text-warm-dark dark:text-warm-light",
  error:
    "border-l-2 border-gray-300 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300",
};

export function Challenge({
  source,
  surface = "lesson",
}: {
  source: string;
  /**
   * "review" when mounted on /review: the persistent solved-once-ever badge is
   * suppressed (this surface is asking for a fresh re-attempt, so "Solved"
   * would claim the review is already done) and the schedule note drops the
   * "Added to your review" phrasing — the card is already there.
   */
  surface?: "lesson" | "review";
}) {
  const parsed = useMemo(() => parseChallenge(source), [source]);
  const spec = parsed.spec;

  const [code, setCode] = useState(spec?.starter ?? "");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [solved, markSolved] = usePersistentSolved(
    `qc:challenge:${spec?.id ?? "invalid"}`
  );
  const editorId = useId();

  const cardId = challengeCardId(spec?.id ?? "invalid");
  const wrongAttempts = useRef(0);
  const [scheduled, setScheduled] = useState<number | null>(null);

  // Cache the challenge's content — including the raw fence source — so /review
  // can re-mount this exact challenge as a LIVE re-attempt (falling back to a
  // recall card for content cached before `kind`/`source` existed).
  useEffect(() => {
    if (spec) {
      setCardContent(cardId, {
        prompt: spec.prompt,
        answer: challengeReviewAnswer(spec.target.program),
        kind: "challenge",
        source,
      });
    }
  }, [spec, cardId, source]);

  if (!spec) {
    return (
      <div className="not-prose my-8 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3">
        <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
          challenge error: {parsed.error}
        </p>
      </div>
    );
  }

  const apply = (r: GradeResult) => {
    setResult(r);
    if (r.status === "wrong") {
      // Only a genuine wrong answer counts toward difficulty; an "error" (parse
      // or disallowed gate) is a malformed attempt, not a wrong answer.
      wrongAttempts.current += 1;
    } else if (r.status === "solved") {
      const graded = gradeCardIfDue(cardId, ratingForSolve(wrongAttempts.current));
      if (graded) setScheduled(nextIntervalDays(graded));
      wrongAttempts.current = 0;
      markSolved();
    }
  };

  const runPy = async () => {
    setBusy(true);
    setResult({ status: "wrong", message: "Booting Python (first run takes a few seconds)…" });
    try {
      const { gradePy } = await import("@/lib/pyodide-grader");
      apply(await gradePy(code, spec));
    } catch (e) {
      setResult({ status: "error", message: `Python grader failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const onCheck = () => {
    if (spec.tier === "py") {
      void runPy();
      return;
    }
    apply(gradeTs(code, spec));
  };

  const showSolved = (surface !== "review" && solved) || result?.status === "solved";

  return (
    <div className="not-prose my-8 overflow-hidden rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting)">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 px-4 py-3 sm:px-5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-dark dark:text-accent-light">
          Your turn
        </span>
        {showSolved && (
          <span className="inline-flex items-center gap-1.5 rounded-chip bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-dark dark:text-accent-light">
            <CheckIcon />
            Solved
          </span>
        )}
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="text-[0.95rem] leading-relaxed text-gray-800 dark:text-gray-200">
          {spec.prompt}
        </p>

        {spec.allowedGates && spec.allowedGates.length > 0 && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Allowed gates:{" "}
            <span className="font-mono text-gray-600 dark:text-gray-300">
              {spec.allowedGates.join(", ")}
            </span>
          </p>
        )}

        <label htmlFor={editorId} className="sr-only">
          Your circuit
        </label>
        <textarea
          id={editorId}
          value={code}
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
          rows={Math.max(3, code.split("\n").length + 1)}
          className="mt-3 w-full rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 font-mono text-sm text-gray-800 dark:text-gray-200 focus-ring resize-y"
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onCheck}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-control surface-accent px-3 py-1.5 text-sm font-medium interactive focus-ring disabled:opacity-60"
          >
            <CheckIcon />
            Check
          </button>
          {spec.tier === "py" && (
            <span className="text-xs text-caption">
              graded with real qcsim in your browser
            </span>
          )}
        </div>

        {result && (
          <div
            role="status"
            className={`mt-3 rounded-control px-3.5 py-3 text-sm leading-relaxed animate-fade-up ${VERDICT_STYLES[result.status]}`}
          >
            {result.message}
          </div>
        )}

        {scheduled !== null && (
          <p role="status" className="mt-2 text-xs text-caption animate-fade-up">
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
  );
}
