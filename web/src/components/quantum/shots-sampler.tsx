"use client";

import { useMemo, useState } from "react";
import { simulate, probabilities, basisLabel } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { sampleCounts } from "./shots";
import { LiveStatus } from "./widget-ui";

/**
 * Inline shots-sampler widget rendered from a ```qshots fenced block in a
 * GUIDE. Parses the shared gate DSL, computes exact Born-rule probabilities,
 * lets the learner fire N measurement shots, and draws an empirical histogram
 * with the exact probability marked on each bar — the law of large numbers,
 * made visible.
 */

const PRESET_SHOTS = [1, 10, 100, 1000, 10000] as const;

export function ShotsSampler({ source }: { source: string }) {
  const program = useMemo(() => parseProgram(source), [source]);
  const probs = useMemo(() => {
    if (program.error) return [];
    return probabilities(simulate(opsFor(program, 0), program.n));
  }, [program]);

  const [counts, setCounts] = useState<number[] | null>(null);
  const [shots, setShots] = useState(1000);
  const [total, setTotal] = useState(0);

  function handleRun() {
    const result = sampleCounts(probs, shots);
    setCounts(result);
    setTotal(shots);
  }

  // Parse-error card — matches the circuit-lab.tsx pattern exactly
  if (program.error) {
    return (
      <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
            Shots sampler
          </span>
        </div>
        <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">
          qsim parse error: {program.error}
        </p>
      </div>
    );
  }

  const empiricalArgmax = counts
    ? counts.reduce((best, c, i, arr) => (c > arr[best] ? i : best), 0)
    : 0;

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      <LiveStatus>
        {total > 0 && counts
          ? `Sampled ${total} shots. Most-probable |${basisLabel(
              empiricalArgmax,
              program.n
            )}⟩: empirical ${((counts[empiricalArgmax] / total) * 100).toFixed(
              1
            )}%, exact ${(probs[empiricalArgmax] * 100).toFixed(1)}%.`
          : ""}
      </LiveStatus>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Shots sampler
        </span>
        {total > 0 && (
          <span className="text-xs tabular-nums text-caption">
            {total} shots
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Shots:</span>
        {PRESET_SHOTS.map((n) => (
          <button
            key={n}
            onClick={() => setShots(n)}
            aria-pressed={shots === n}
            aria-label={`${n} shots`}
            className={[
              "rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors interactive focus-ring",
              shots === n
                ? "bg-accent text-gray-950"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700",
            ].join(" ")}
          >
            {n}
          </button>
        ))}
        <button
          onClick={handleRun}
          className="ml-2 rounded px-3 py-1 text-xs font-semibold surface-accent interactive focus-ring"
        >
          Run
        </button>
      </div>

      {/* Empty-state hint before the first Run */}
      {total === 0 && (
        <p className="border-b border-gray-100 dark:border-gray-800 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
          Press Run to sample {shots.toLocaleString()} shots and compare to the exact probability.
        </p>
      )}

      {/* Histogram */}
      <div className="px-4 py-4 space-y-2">
        {probs.map((p, idx) => {
          const empirical = total > 0 ? counts![idx] / total : 0;
          const exactPct = (p * 100).toFixed(1);
          const empiricalPct = (empirical * 100).toFixed(1);

          return (
            <div
              key={idx}
              className="flex items-center gap-2"
              aria-label={
                total > 0
                  ? `Basis ${basisLabel(idx, program.n)}: empirical ${empiricalPct}%, exact ${exactPct}%`
                  : `Basis ${basisLabel(idx, program.n)}: exact ${exactPct}%`
              }
            >
              {/* Basis label */}
              <span className="w-10 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                |{basisLabel(idx, program.n)}&#10217;
              </span>

              {/* Bar track */}
              <span className="relative h-4 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-visible">
                {/* Empirical fill */}
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-accent/70"
                  style={{ width: `${(empirical * 100).toFixed(2)}%` }}
                />
                {/* Exact probability marker — a thin vertical line */}
                <span
                  className="absolute top-0 bottom-0 w-0.5 bg-accent dark:bg-accent-light"
                  style={{ left: `${(p * 100).toFixed(2)}%` }}
                  title={`Exact: ${exactPct}%`}
                />
              </span>

              {/* Right-hand readout */}
              <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {total > 0 ? (
                  <>
                    <span className="text-gray-700 dark:text-gray-200">{empiricalPct}%</span>
                    <span className="text-gray-400 dark:text-gray-600"> / {exactPct}%</span>
                  </>
                ) : (
                  <span>{exactPct}%</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 border-t border-gray-100 dark:border-gray-800 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-accent/70" />
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Empirical frequency</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-accent dark:bg-accent-light" />
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Exact probability</span>
        </div>
      </div>
    </div>
  );
}
