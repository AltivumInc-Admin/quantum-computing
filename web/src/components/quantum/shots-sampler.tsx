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

/**
 * The shot count, formatted once. The empty-state hint used a bare
 * toLocaleString() (grouped, implicit locale) while the header chip and the
 * screen-reader announcement rendered the raw number, so the top two presets
 * — including the 1000 default — read "1,000 shots" before Run and "1000
 * shots" after, in the one widget whose entire subject is the shot count.
 * "en-US" matches the codebase's explicit-locale idiom.
 */
const formatShots = (n: number) => n.toLocaleString("en-US");

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

  // Fail loud instead of silently pinning theta to 0. The DSL accepts the
  // slider-bound `theta` token in ANY fence, but this widget renders no slider
  // and evaluates at opsFor(program, 0) — so a `RY 0 theta` block would show a
  // chip reading "RY(θ) q0" and label a flat P(0)=100% as the "Exact
  // probability". A plausible-looking wrong number is worse than an error card.
  if (program.hasTheta) {
    return (
      <ErrorCard
        label="qshots"
        message="a slider-bound theta is not supported here; use a literal angle"
      />
    );
  }

  const empiricalArgmax = counts
    ? counts.reduce((best, c, i, arr) => (c > arr[best] ? i : best), 0)
    : 0;

  return (
    <WidgetCard
      eyebrow="Shots sampler"
      headerRight={
        total > 0 ? (
          <span className="text-xs tabular-nums text-caption">{formatShots(total)} shots</span>
        ) : undefined
      }
    >
      <LiveStatus>
        {total > 0 && counts
          ? `Sampled ${formatShots(total)} shots. Most-probable |${basisLabel(
              empiricalArgmax,
              program.n
            )}⟩: empirical ${formatPercent(
              (counts[empiricalArgmax] / total) * 100
            )}, exact ${formatPercent(probs[empiricalArgmax] * 100)}.`
          : ""}
      </LiveStatus>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-(--bd) px-4 py-3">
        <span className="text-xs text-caption mr-1">Shots:</span>
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
                : "border border-(--bd) bg-(--field) text-caption hover:text-(--ink)",
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
        <p className="border-b border-(--bd) px-4 py-2 text-xs text-caption">
          Press Run to sample {formatShots(shots)} shots and compare to the exact probability.
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
                    <span className="text-caption">{empiricalPct}</span>
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
      <div className="flex items-center gap-4 border-t border-(--bd) px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-accent/70" />
          <span className="text-[11px] text-caption">Empirical frequency</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Matches Bar's marker exactly — including the light-theme pair-down
              to --accent-dark for the 3:1 non-text floor. */}
          <span className="inline-block h-3 w-0.5 bg-accent-dark dark:bg-accent-light" />
          <span className="text-[11px] text-caption">Exact probability</span>
        </div>
      </div>
    </WidgetCard>
  );
}
