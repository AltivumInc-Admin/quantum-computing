"use client";

import { useMemo } from "react";
import { ErrorCard as SharedErrorCard, LiveStatus } from "./widget-ui";
import { type Complex, basisLabel } from "./math";
import { qft, basisState, periodicState } from "./qft";

/**
 * Inline Quantum Fourier Transform visualizer rendered from a ```qft fenced
 * block in a GUIDE. Builds either a period-r comb or a single basis state,
 * runs the DFT (qft.ts), and shows input magnitudes (left) feeding output
 * magnitudes (right) — a period-r input produces frequency spikes every N/r.
 *
 * Source JSON: { "qubits": 4, "input": "period:4" } or { "qubits": 4, "basis": 3 }.
 */

interface QftConfig {
  n: number;
  /** "period" comb with the given period, or "basis" single-state index. */
  kind: "period" | "basis";
  value: number;
}

interface ParseResult {
  config?: QftConfig;
  error?: string;
}

function parseConfig(source: string): ParseResult {
  const trimmed = source.trim();
  let raw: unknown = {};
  if (trimmed.length > 0) {
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return { error: "invalid JSON" };
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { error: "expected a JSON object" };
    }
  }
  const obj = raw as Record<string, unknown>;

  const n = typeof obj.qubits === "number" ? obj.qubits : 4;
  if (!Number.isInteger(n) || n < 2 || n > 4) {
    return { error: `qubits must be an integer in 2..4 (got ${String(obj.qubits)})` };
  }
  const N = 1 << n;

  // Single basis state: { "basis": j }
  if (obj.basis !== undefined) {
    const j = obj.basis;
    if (typeof j !== "number" || !Number.isInteger(j) || j < 0 || j >= N) {
      return { error: `basis must be an integer in 0..${N - 1} (got ${String(j)})` };
    }
    return { config: { n, kind: "basis", value: j } };
  }

  // Period comb: { "input": "period:4" }; default to period 4.
  let period = 4;
  if (obj.input !== undefined) {
    if (typeof obj.input !== "string") {
      return { error: `input must be a string like "period:4" (got ${String(obj.input)})` };
    }
    const m = /^period:(\d+)$/.exec(obj.input.trim());
    if (!m) {
      return { error: `input must look like "period:4" (got "${obj.input}")` };
    }
    period = parseInt(m[1], 10);
  }
  if (period < 1 || period > N) {
    return { error: `period must be in 1..${N} (got ${period})` };
  }
  // The DFT of a comb is itself a clean comb only when the period divides N;
  // otherwise the "spikes every N/r" claim and the spike highlighter (idx % N/r)
  // are false. Require divisibility so the displayed teaching note stays correct.
  if (N % period !== 0) {
    return { error: `period must divide N=${N} for a clean spectrum (got ${period})` };
  }
  return { config: { n, kind: "period", value: period } };
}

const mag = (c: Complex) => Math.hypot(c[0], c[1]);

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="qft" className="my-8" message={message} />;
}

function MagnitudeBars({
  values,
  n,
  highlight,
  accent,
}: {
  values: number[];
  n: number;
  highlight?: (idx: number) => boolean;
  accent?: boolean;
}) {
  const peak = Math.max(...values, 1e-12);
  return (
    <div className="space-y-1.5">
      {values.map((v, idx) => {
        const hot = highlight ? highlight(idx) : false;
        return (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-12 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
              |{basisLabel(idx, n)}&#10217;
            </span>
            <span className="relative h-3 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <span
                className={
                  "absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-200 " +
                  (hot
                    ? "bg-warm"
                    : accent
                      ? "bg-accent"
                      : "bg-gray-400 dark:bg-gray-500")
                }
                style={{ width: `${((v / peak) * 100).toFixed(2)}%` }}
              />
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {v.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function QftVisualizer({ source }: { source: string }) {
  const parsed = useMemo(() => parseConfig(source), [source]);

  const result = useMemo(() => {
    if (!parsed.config) return null;
    try {
      const { n, kind, value } = parsed.config;
      const input =
        kind === "basis" ? basisState(n, value) : periodicState(n, value);
      const output = qft(input);
      return { n, kind, value, inMag: input.map(mag), outMag: output.map(mag) };
    } catch {
      return null;
    }
  }, [parsed]);

  if (!parsed.config || !result) {
    return <ErrorCard message={parsed.error ?? "invalid configuration"} />;
  }

  const { n, kind, value, inMag, outMag } = result;
  const N = 1 << n;
  const spacing = kind === "period" ? N / value : null;
  const note =
    kind === "period"
      ? `period r = ${value} → spikes every N/r = ${spacing} (N = ${N})`
      : `basis input |${basisLabel(value, n)}⟩ → uniform spectrum (N = ${N})`;
  const isSpike = (idx: number) =>
    kind === "period" && spacing !== null && idx % spacing === 0;

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      <LiveStatus>{note}</LiveStatus>

      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Fourier
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          {n} qubits · N = {N}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 px-4 py-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Input |x&#10217;
          </p>
          <MagnitudeBars values={inMag} n={n} />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            QFT output (magnitude)
          </p>
          <MagnitudeBars values={outMag} n={n} highlight={isSpike} accent />
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{note}</p>
      </div>
    </div>
  );
}
