"use client";

import { useMemo, useState } from "react";
import { simulate, probabilities, basisLabel } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { sampleCounts } from "./shots";
import { Bar, ErrorCard, LiveStatus, WidgetCard } from "./widget-ui";
import { formatPercent } from "./format";

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

  if (program.error) {
    return <ErrorCard label="qsim parse" message={program.error} />;
  }

  const empiricalArgmax = counts
    ? counts.reduce((best, c, i, arr) => (c > arr[best] ? i : best), 0)
    : 0;

  return (
    <WidgetCard
      eyebrow="Shots sampler"
      headerRight={
        total > 0 ? (
          <span className="text-xs tabular-nums text-caption">{total} shots</span>
        ) : undefined
      }
    >
      <LiveStatus>
        {total > 0 && counts
          ? `Sampled ${total} shots. Most-probable |${basisLabel(
              empiricalArgmax,
              program.n
            )}⟩: empirical ${formatPercent(
              (counts[empiricalArgmax] / total) * 100
            )}, exact ${formatPercent(probs[empiricalArgmax] * 100)}.`
          : ""}
      </LiveStatus>

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
                ? "chip-selected"
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
          const exactPct = formatPercent(p * 100);
          const empiricalPct = formatPercent(empirical * 100);

          return (
            <Bar
              key={idx}
              label={basisLabel(idx, program.n)}
              fraction={empirical}
              fillClass="bg-accent/70"
              valueWidth="w-24"
              marker={{ fraction: p, title: `Exact: ${exactPct}` }}
              ariaLabel={
                total > 0
                  ? `Basis ${basisLabel(idx, program.n)}: empirical ${empiricalPct}, exact ${exactPct}`
                  : `Basis ${basisLabel(idx, program.n)}: exact ${exactPct}`
              }
              valueText={
                total > 0 ? (
                  <>
                    <span className="text-gray-700 dark:text-gray-200">{empiricalPct}</span>
                    <span className="text-caption"> / {exactPct}</span>
                  </>
                ) : (
                  exactPct
                )
              }
            />
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
    </WidgetCard>
  );
}
