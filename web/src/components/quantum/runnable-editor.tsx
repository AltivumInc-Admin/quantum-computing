"use client";

import { useRef, useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { runPython, type RunResult } from "@/lib/pyodide-run";

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
  // Bumped on every run and on reset; a run only commits its result if its token
  // is still current, so resetting (or re-running) discards a stale in-flight run.
  const runToken = useRef(0);

  const run = async () => {
    const token = ++runToken.current;
    setBusy(true);
    setResult(null);
    try {
      const r = await runPython(code);
      if (runToken.current === token) setResult(r);
    } finally {
      if (runToken.current === token) setBusy(false);
    }
  };

  const reset = () => {
    runToken.current++;
    setCode(source);
    setResult(null);
    setBusy(false);
  };

  const showOutput = busy || result;
  const status: "busy" | "ok" | "error" = result?.error
    ? "error"
    : result
      ? "ok"
      : "busy";

  return (
    <div className="not-prose my-8 overflow-hidden rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting)">
      {/* Live-cell accent ribbon — marks this as runnable, not a static block. */}
      <div
        aria-hidden="true"
        className="h-0.5 bg-gradient-to-r from-accent via-accent/40 to-warm/30"
      />

      <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-dark dark:text-accent-light">
            Run it yourself
          </span>
          <span className="rounded-chip bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            python
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-control px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 interactive focus-ring"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-control bg-accent px-3.5 py-1.5 text-sm font-medium text-white shadow-sm shadow-accent/30 hover:bg-accent-dark interactive focus-ring disabled:opacity-60 disabled:shadow-none"
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
      <div className={showOutput ? "border-t border-gray-100 dark:border-gray-800" : ""}>
        {showOutput && (
          <div className="flex items-center gap-2 bg-gray-50 px-4 pt-3 dark:bg-gray-950/40 sm:px-5">
            <StatusDot state={status} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-caption">
              Output
            </span>
          </div>
        )}
        <pre
          role="status"
          aria-live="polite"
          className={
            showOutput
              ? "overflow-x-auto bg-gray-50 px-4 pb-4 pt-2 font-mono text-[13px] leading-relaxed dark:bg-gray-950/40 sm:px-5 animate-fade-up"
              : "sr-only"
          }
        >
          {busy && !result ? (
            <span className="text-caption">
              Booting Python (first run takes a few seconds)…
            </span>
          ) : result ? (
            <Output result={result} />
          ) : null}
        </pre>
      </div>
    </div>
  );
}

function Output({ result }: { result: RunResult }) {
  if (result.error) {
    return (
      <>
        {result.output && (
          <span className="text-gray-700 dark:text-gray-300">{result.output}</span>
        )}
        <span className="text-warm-dark dark:text-warm-light">{result.error}</span>
      </>
    );
  }
  if (!result.output) {
    return <span className="text-caption">(no output)</span>;
  }
  return <span className="text-gray-800 dark:text-gray-200">{result.output}</span>;
}

function StatusDot({ state }: { state: "busy" | "ok" | "error" }) {
  return (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 rounded-full ${
        state === "error" ? "bg-warm" : "bg-accent"
      } ${state === "busy" ? "animate-pulse motion-reduce:animate-none" : ""}`}
    />
  );
}

function PlayIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
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
