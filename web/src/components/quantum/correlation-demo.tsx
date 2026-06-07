"use client";

import { useMemo, useState } from "react";
import { simulate, probabilities, basisLabel } from "./math";
import { opsFor } from "./qsim-dsl";
import { parseCorrelation, sampleOutcome } from "./correlation";
import type { Program } from "./qsim-dsl";

/**
 * Side-by-side entanglement-correlation demo rendered from a ```qcorr fenced
 * block in a GUIDE. Two 2-qubit circuits — an entangled one and a product one —
 * are sampled jointly each time the learner clicks "Measure". A running tally
 * reveals that the Bell pair only ever yields 00 or 11 while the product state
 * spreads over all four outcomes.
 */

function gateChips(program: Program) {
  return program.gates.map((g, i) => {
    const label =
      g.gate === "CNOT"
        ? `CNOT ${g.control}→${g.target}`
        : g.bound
          ? `${g.gate}(θ) q${g.target}`
          : g.angle !== undefined
            ? `${g.gate}(${g.angle.toFixed(2)}) q${g.target}`
            : `${g.gate} q${g.target}`;
    return (
      <span
        key={i}
        className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300"
      >
        {label}
      </span>
    );
  });
}

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
        {gateChips(program)}
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

      {/* Tally table */}
      <div role="status" className="space-y-1.5">
        {LABELS.map((lbl, idx) => {
          const count = tally[idx] ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-10 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                |{lbl}&rang;
              </span>
              <span className="relative h-3 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-150"
                  style={{ width: `${pct.toFixed(2)}%` }}
                />
              </span>
              <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {measurements > 0 ? (
                  <>
                    <span className="text-gray-700 dark:text-gray-200">{count}</span>
                    <span className="text-gray-400 dark:text-gray-600"> / {pct.toFixed(1)}%</span>
                  </>
                ) : (
                  <span>0</span>
                )}
              </span>
            </div>
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
    <div className="not-prose my-8 overflow-hidden rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting)">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Correlation
        </span>
        {measurements > 0 && (
          <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
            {measurements} measurement{measurements === 1 ? "" : "s"}
          </span>
        )}
      </div>

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
          className="rounded-control bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark interactive focus-ring"
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
    </div>
  );
}
