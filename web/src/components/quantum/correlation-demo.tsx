"use client";

import { useMemo, useState } from "react";
import { simulate, probabilities, basisLabel } from "./math";
import { opsFor } from "./qsim-dsl";
import { parseCorrelation, sampleOutcome } from "./correlation";
import { Bar, GateChips, WidgetCard } from "./widget-ui";
import { formatPercent } from "./format";
import type { Program } from "./qsim-dsl";

/**
 * Side-by-side entanglement-correlation demo rendered from a ```qcorr fenced
 * block in a GUIDE. Two 2-qubit circuits — an entangled one and a product one —
 * are sampled jointly each time the learner clicks "Measure". A running tally
 * reveals that the Bell pair only ever yields 00 or 11 while the product state
 * spreads over all four outcomes.
 */

interface PanelProps {
  label: string;
  program: Program;
  tally: number[];
  lastOutcome: number | null;
  measurements: number;
}

function Panel({ label, program, tally, lastOutcome, measurements }: PanelProps) {
  const total = tally.reduce((a, b) => a + b, 0);
  const LABELS = [0, 1, 2, 3].map((i) => basisLabel(i, 2));

  return (
    <div className="flex-1 min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 mr-1">{label}</span>
        <GateChips gates={program.gates} />
      </div>

      {/* Last sampled outcome */}
      <div className="mb-3 font-mono text-sm text-gray-500 dark:text-gray-400">
        {lastOutcome !== null ? (
          <span>
            Last: <span className="text-accent dark:text-accent-light font-semibold">|{basisLabel(lastOutcome, 2)}&rang;</span>
          </span>
        ) : (
          <span className="opacity-40">Last: &mdash;</span>
        )}
      </div>

      {/* Tally table (static visual; per-measure announcement is a single
          component-level live region in CorrelationDemo) */}
      <div className="space-y-1.5">
        {LABELS.map((lbl, idx) => {
          const count = tally[idx] ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <Bar
              key={idx}
              label={lbl}
              fraction={pct / 100}
              valueWidth="w-24"
              valueText={
                measurements > 0 ? (
                  <>
                    <span className="text-gray-700 dark:text-gray-200">{count}</span>
                    <span className="text-caption"> / {formatPercent(pct)}</span>
                  </>
                ) : (
                  "0"
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}

export function CorrelationDemo({ source }: { source: string }) {
  const parsed = useMemo(() => parseCorrelation(source), [source]);

  const [entangledTally, setEntangledTally] = useState<number[]>(() => [0, 0, 0, 0]);
  const [productTally, setProductTally] = useState<number[]>(() => [0, 0, 0, 0]);
  const [entangledLast, setEntangledLast] = useState<number | null>(null);
  const [productLast, setProductLast] = useState<number | null>(null);
  const [measurements, setMeasurements] = useState(0);

  const entangledProbs = useMemo(() => {
    if (!parsed.spec) return [];
    return probabilities(simulate(opsFor(parsed.spec.entangled, 0), 2));
  }, [parsed.spec]);

  const productProbs = useMemo(() => {
    if (!parsed.spec) return [];
    return probabilities(simulate(opsFor(parsed.spec.product, 0), 2));
  }, [parsed.spec]);

  if (!parsed.spec) {
    return (
      <div className="not-prose my-8 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3">
        <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
          correlation error: {parsed.error}
        </p>
      </div>
    );
  }

  function handleMeasure() {
    const ei = sampleOutcome(entangledProbs);
    const pi = sampleOutcome(productProbs);
    setEntangledLast(ei);
    setProductLast(pi);
    setEntangledTally((t) => { const n = [...t]; n[ei]++; return n; });
    setProductTally((t) => { const n = [...t]; n[pi]++; return n; });
    setMeasurements((m) => m + 1);
  }

  function handleReset() {
    setEntangledTally([0, 0, 0, 0]);
    setProductTally([0, 0, 0, 0]);
    setEntangledLast(null);
    setProductLast(null);
    setMeasurements(0);
  }

  return (
    <WidgetCard
      eyebrow="Correlation"
      className="my-8"
      headerRight={
        measurements > 0 ? (
          <span className="text-xs tabular-nums text-caption">
            {measurements} measurement{measurements === 1 ? "" : "s"}
          </span>
        ) : null
      }
    >
      {/* One concise screen-reader announcement per Measure (replaces the two
          competing tally-table live regions that read 8 rows on every click) */}
      <p className="sr-only" role="status" aria-live="polite">
        {measurements > 0 && entangledLast !== null && productLast !== null
          ? `Entangled measured ${basisLabel(entangledLast, 2)}, product measured ${basisLabel(productLast, 2)}; ${measurements} measurement${measurements === 1 ? "" : "s"} total.`
          : ""}
      </p>

      {/* Prompt */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-[0.95rem] leading-relaxed text-gray-800 dark:text-gray-200">
          {parsed.spec.prompt}
        </p>
      </div>

      {/* Two panels */}
      <div className="flex flex-col sm:flex-row gap-6 px-4 py-4">
        <Panel
          label="Entangled"
          program={parsed.spec.entangled}
          tally={entangledTally}
          lastOutcome={entangledLast}
          measurements={measurements}
        />
        <div className="hidden sm:block w-px bg-gray-100 dark:bg-gray-800 self-stretch" />
        <Panel
          label="Product"
          program={parsed.spec.product}
          tally={productTally}
          lastOutcome={productLast}
          measurements={measurements}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <button
          type="button"
          aria-label="Measure"
          onClick={handleMeasure}
          className="rounded-control surface-accent px-3 py-1.5 text-sm font-medium interactive focus-ring"
        >
          Measure
        </button>
        <button
          type="button"
          aria-label="Reset"
          onClick={handleReset}
          className="rounded-control border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 interactive focus-ring"
        >
          Reset
        </button>
      </div>
    </WidgetCard>
  );
}
