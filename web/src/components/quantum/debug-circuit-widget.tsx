"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { parseDebugCircuit } from "@/lib/debug-circuit-schema";
import { debugTruth, gradeDebug } from "@/lib/debug-circuit-grade";
import type { GradeResult } from "@/lib/challenge-grade";
import { gradeCardIfDue, setCardContent } from "@/lib/review-store";
import { debugCardId, ratingForSolve, challengeReviewAnswer } from "@/lib/challenge-review";
import { nextIntervalDays } from "@/lib/review-schedule";
import { recordBest, getBest } from "@/lib/skill-measure";

/**
 * A debug-a-circuit Rep rendered from a ```qdebug fenced block. The editor is
 * PREFILLED with a broken circuit; the learner repairs it and clicks Check.
 * Grading is the challenge kernel (state equality up to global phase) with a
 * debug-specific diagnostic: an answer still state-equal to the original
 * broken circuit is told "you haven't changed the bug yet" instead of burning
 * the hint. Retryable like a challenge, so a solve rates via ratingForSolve
 * (clean first Check "good", any genuine miss first "hard").
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

export function DebugCircuitWidget({
  source,
  surface = "lesson",
}: {
  source: string;
  /**
   * "review" when mounted on /review: the persistent solved-once-ever badge is
   * suppressed (this surface asks for a fresh re-attempt) and the schedule
   * note reads "Reviewed" instead of "Added to your review".
   */
  surface?: "lesson" | "review";
}) {
  const parsed = useMemo(() => parseDebugCircuit(source), [source]);
  const spec = parsed.spec;
  // Author-time validation + both reference states, computed once per spec.
  const truth = useMemo(() => (spec ? debugTruth(spec) : undefined), [spec]);

  const [code, setCode] = useState(spec?.broken.program ?? "");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [resetNote, setResetNote] = useState(false);
  // Session-sticky solve so a post-solve Reset on /review can't un-complete
  // the badge while the "Reviewed" schedule note (accurately) stands.
  const [sessionSolved, setSessionSolved] = useState(false);
  const [solved, markSolved] = usePersistentSolved(`qc:debug:${spec?.id ?? "invalid"}`);
  const editorId = useId();

  const cardId = debugCardId(spec?.id ?? "invalid");
  // Miss counter in SESSIONSTORAGE, not a ref and not localStorage: a ref
  // resets on reload (Check wrong N times, reload, paste the fix -> a
  // laundered "good"), while a localStorage qc:* key would enter the ADDITIVE
  // cross-device sync and resurrect cleared counters from the server copy.
  // sessionStorage survives the reload that constitutes the laundering move,
  // never syncs, and expires with the tab.
  const attemptsKey = `qc-session:attempts:${cardId}`;
  const readAttempts = () => {
    try {
      return Number(sessionStorage.getItem(attemptsKey)) || 0;
    } catch {
      return 0;
    }
  };
  const [scheduled, setScheduled] = useState<number | null>(null);
  const [solvedGates, setSolvedGates] = useState<number | null>(null);
  const [bestGates, setBestGates] = useState<number | null>(null);

  // Cache content — including the raw fence source — so /review can re-mount
  // this exact Rep as a LIVE re-attempt. The recall answer reuses the
  // challenge formatter: for a debug Rep too, "the answer" IS a correct
  // circuit, collapsed onto one inline-code line.
  useEffect(() => {
    if (spec && truth && !truth.error) {
      setCardContent(cardId, {
        prompt: spec.prompt,
        answer: challengeReviewAnswer(spec.target.program),
        kind: "debug",
        source,
      });
    }
  }, [spec, truth, cardId, source]);

  if (!spec || !truth) {
    return (
      <div className="not-prose my-8 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3">
        <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
          debug error: {parsed.error}
        </p>
      </div>
    );
  }
  if (truth.error) {
    return (
      <div className="not-prose my-8 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3">
        <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
          debug error: {truth.error}
        </p>
      </div>
    );
  }

  const onCheck = () => {
    const r = gradeDebug(code, spec, truth);
    setResult(r);
    setResetNote(false);
    if (r.status === "wrong") {
      // Only a genuine wrong answer counts toward difficulty: an "error"
      // (parse or disallowed gate) is a malformed attempt, and a Check of the
      // UNTOUCHED seed is reproducing the symptom, not answering — neither
      // may push the eventual clean fix from "good" to "hard".
      if (code !== spec.broken.program) {
        try {
          sessionStorage.setItem(attemptsKey, String(readAttempts() + 1));
        } catch {
          /* storage unavailable — difficulty inference degrades gracefully */
        }
      }
    } else if (r.status === "solved") {
      const graded = gradeCardIfDue(cardId, ratingForSolve(readAttempts()));
      if (graded) setScheduled(nextIntervalDays(graded));
      try {
        sessionStorage.removeItem(attemptsKey);
      } catch {
        /* ignore */
      }
      setSessionSolved(true);
      markSolved();
      if (r.metrics) {
        recordBest(cardId, { gates: r.metrics.gates });
        setSolvedGates(r.metrics.gates);
        setBestGates(getBest(cardId)?.gates ?? r.metrics.gates);
      }
    }
  };

  // Restore the original buggy circuit after the editor gets mangled. Keeps
  // the miss counter — a reset is part of the same struggle, not a fresh
  // session. The note swaps into the persistent status region so screen
  // readers hear the restore (a removed/unmounted verdict is never announced).
  const onReset = () => {
    setCode(spec.broken.program);
    setResult(null);
    setResetNote(true);
    setSolvedGates(null); // clear the "Fixed in N gates" caption with the verdict
  };

  const showSolved =
    (surface !== "review" && solved) || sessionSolved || result?.status === "solved";

  return (
    <div className="not-prose my-8 overflow-hidden rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting)">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 px-4 py-3 sm:px-5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-dark dark:text-accent-light">
          Fix the circuit
        </span>
        {showSolved && (
          <span className="inline-flex items-center gap-1.5 rounded-chip bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-dark dark:text-accent-light">
            <CheckIcon />
            Fixed
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
          The circuit to fix
        </label>
        <textarea
          id={editorId}
          value={code}
          spellCheck={false}
          onChange={(e) => {
            setCode(e.target.value);
            // The verdict described the OLD code — especially "you haven't
            // changed the bug yet", which becomes a false claim the moment
            // the learner types (mirrors bloch-target's stale-readout clear).
            if (result !== null) setResult(null);
            if (resetNote) setResetNote(false);
            if (solvedGates !== null) setSolvedGates(null); // clear the stale "Fixed in N" caption
          }}
          rows={Math.max(3, code.split("\n").length + 1)}
          className="mt-3 w-full rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 font-mono text-sm text-gray-800 dark:text-gray-200 focus-ring resize-y"
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onCheck}
            className="inline-flex items-center gap-1.5 rounded-control surface-accent px-3 py-1.5 text-sm font-medium interactive focus-ring"
          >
            <CheckIcon />
            Check
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-control border border-gray-200 dark:border-gray-700/50 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 interactive focus-ring"
          >
            Reset to the broken circuit
          </button>
        </div>

        {/* Persistent outcome region — verdicts (and the reset note) are
            announced by TEXT SWAP inside an always-mounted role="status";
            mounting a fresh region per verdict is not reliably announced
            (the same fix bloch-target/cost-estimate/predict carry). */}
        <div role="status">
          {result && (
            <div
              className={`mt-3 rounded-control px-3.5 py-3 text-sm leading-relaxed animate-fade-up ${VERDICT_STYLES[result.status]}`}
            >
              {result.message}
            </div>
          )}
          {!result && resetNote && (
            <p className="mt-3 text-sm text-caption animate-fade-up">
              Editor restored to the original broken circuit.
            </p>
          )}
        </div>

        <div role="status">
          {scheduled !== null && (
            <p className="mt-2 text-xs text-caption animate-fade-up">
              {surface === "review"
                ? scheduled <= 1
                  ? "Reviewed — next review tomorrow."
                  : `Reviewed — next review in ${scheduled} days.`
                : scheduled <= 1
                  ? "Added to your review — back tomorrow."
                  : `Added to your review — back in ${scheduled} days.`}
            </p>
          )}
          {solvedGates !== null && (
            <p className="mt-2 text-xs text-caption tabular-nums animate-fade-up">
              Fixed in {solvedGates} gate{solvedGates === 1 ? "" : "s"}
              {bestGates !== null && bestGates < solvedGates
                ? ` — your best is ${bestGates}. Can you match it?`
                : " — your best."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
