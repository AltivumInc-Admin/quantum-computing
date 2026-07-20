"use client";

import { useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { runPython, type RunResult } from "@/lib/pyodide-run";
import {
  isPyodideBooted,
  PY_BOOT_NOTICE,
  PY_BOOT_SLOW_NOTICE,
  PY_RUNNING_NOTICE,
  PY_RUNNING_SLOW_NOTICE,
  PY_SLOW_NOTICE_MS,
} from "@/lib/pyodide-runtime";
import { useScrollRegion } from "@/hooks/use-scroll-region";
import {
  cardShell,
  EyebrowLabel,
  PlayIcon,
} from "./widget-ui";

/**
 * A live Python sandbox rendered from a ```runnable fenced block. The learner
 * edits real Braket-style Python in a Monaco editor and clicks Run; the code
 * executes in-browser via the shared Pyodide runtime (qcsim wheel installed), and
 * stdout/errors stream into the output panel. No backend, no login.
 */
export function RunnableEditor({ source }: { source: string }) {
  const [code, setCode] = useState(source);
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  // Whether the CURRENT wait includes an interpreter boot (asked at click time,
  // structurally — see isPyodideBooted). Runs 2..N of a session boot nothing and
  // finish in milliseconds, so promising "first run takes a few seconds" there
  // described something that was not happening.
  const [booting, setBooting] = useState(true);
  // Set once the wait outlives PY_SLOW_NOTICE_MS, so the copy escalates instead
  // of sitting. The waits behind it are real: 30s for a runaway loop, up to 150s
  // if both boot origins stall.
  const [slow, setSlow] = useState(false);
  // Bumped on every run and on reset; a run only commits its result if its token
  // is still current, so resetting (or re-running) discards a stale in-flight run.
  const runToken = useRef(0);

  const run = async () => {
    const token = ++runToken.current;
    setBooting(!isPyodideBooted());
    setSlow(false);
    setBusy(true);
    setResult(null);
    try {
      const r = await runPython(code);
      if (runToken.current === token) setResult(r);
    } finally {
      // Unconditional, unlike the result commit: `busy` tracks whether the
      // interpreter is occupied, not whether this component still wants the
      // answer. Run is disabled while busy, so at most one run is ever in
      // flight and no stale settle can clear a newer run's busy state.
      setBusy(false);
    }
  };

  /**
   * Reset restores the source and clears the panel. It deliberately does NOT
   * clear `busy`: there is no way to cancel an in-flight run (the interpreter is
   * a shared worker, and interrupting it means terminating the worker), so
   * re-enabling Run would only queue the next run behind the abandoned one on
   * the module-global FIFO — the learner would watch a trivial snippet hang for
   * the remainder of the first run's 30s budget and then be told an "earlier
   * run timed out". Leaving Run disabled until the run actually settles is the
   * state that already exists, told honestly.
   */
  const reset = () => {
    runToken.current++;
    setCode(source);
    setResult(null);
  };

  // Arms the escalation while a run is in flight (`slow` is cleared by `run`
  // itself, not here — a synchronous setState in an effect body cascades).
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setSlow(true), PY_SLOW_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [busy]);

  // One three-state machine, derived once. Every branch below (border, status
  // dot, panel visibility, panel body) reads this rather than re-deriving its
  // own split from `busy`/`result`.
  const phase: "idle" | "running" | "ok" | "error" = busy
    ? "running"
    : result?.error
      ? "error"
      : result
        ? "ok"
        : "idle";
  const showOutput = phase !== "idle";

  const notice = booting
    ? slow
      ? PY_BOOT_SLOW_NOTICE
      : PY_BOOT_NOTICE
    : slow
      ? PY_RUNNING_SLOW_NOTICE
      : PY_RUNNING_NOTICE;

  // Tracebacks and long print lines overflow horizontally, so the panel is a
  // scroll region: the house measure-then-expose hook adds the tab stop and
  // focus ring only when it actually overflows. It goes on a WRAPPER, not on
  // the <pre> — the <pre> is the live region (role="status") and cannot also
  // carry role="region".
  const outputScroll = useScrollRegion<HTMLDivElement>("Python output");

  return (
    <div className={`not-prose my-8 overflow-hidden ${cardShell}`}>
      {/* Live-cell accent ribbon — marks this as runnable, not a static block. */}
      <div
        aria-hidden="true"
        className="h-0.5 bg-gradient-to-r from-accent via-accent/40 to-warm/30"
      />

      {/* py-3 (not py-2.5) is the activity-card header recipe challenge, quiz,
          predict, debug and review-card all render; this row used to be 4px
          shorter than its siblings in the same lesson. */}
      <div className="flex items-center justify-between gap-3 border-b border-(--bd) px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <EyebrowLabel strong>
            Run it yourself
          </EyebrowLabel>
          <span className="rounded-chip border border-(--bd) bg-(--field) px-1.5 py-0.5 font-mono text-[10px] text-caption">
            python
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-control px-2.5 py-1 text-xs font-medium text-caption hover:text-(--ink) interactive focus-ring"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-control surface-accent px-3.5 py-1.5 text-sm font-medium interactive focus-ring disabled:opacity-60"
          >
            {busy ? (
              <>
                <Spinner />
                Running…
              </>
            ) : (
              <>
                <PlayIcon />
                Run
              </>
            )}
          </button>
        </div>
      </div>

      <CodeEditor value={code} onChange={setCode} language="python" />

      {/* The output panel's live region stays mounted (sr-only when idle) so a
          screen reader announces results as they appear, not just when the box
          is first inserted. */}
      <div className={showOutput ? "border-t border-(--bd)" : ""}>
        {showOutput && (
          <div className="flex items-center gap-2 bg-(--field) px-4 pt-3 sm:px-5">
            <StatusDot phase={phase} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-caption">
              Output
            </span>
          </div>
        )}
        <div
          {...outputScroll.regionProps}
          className={
            showOutput
              ? `${outputScroll.regionProps.className} bg-(--field) px-4 pb-4 pt-2 sm:px-5 animate-fade-up`
              : "sr-only"
          }
        >
          <pre
            role="status"
            aria-live="polite"
            className="font-mono text-[13px] leading-relaxed"
          >
            {phase === "running" ? (
              <span className="text-caption">{notice}</span>
            ) : result ? (
              <Output result={result} />
            ) : null}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Output({ result }: { result: RunResult }) {
  if (result.error) {
    return (
      <>
        {result.output && (
          <span className="text-(--mut)">{result.output}</span>
        )}
        <span className="text-warm-dark dark:text-warm-light">{result.error}</span>
      </>
    );
  }
  if (!result.output) {
    return <span className="text-caption">(no output)</span>;
  }
  return <span className="text-(--ink)">{result.output}</span>;
}

function StatusDot({ phase }: { phase: "running" | "ok" | "error" }) {
  return (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 rounded-full ${
        phase === "error" ? "bg-warm" : "bg-accent"
      } ${phase === "running" ? "animate-pulse motion-reduce:animate-none" : ""}`}
    />
  );
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
