"use client";

import { useId, useMemo, useState } from "react";
import { basisLabel } from "./math";
import { djProbabilities, isConstant, ORACLES } from "./deutsch-jozsa";

/**
 * Deutsch-Jozsa oracle demo rendered from a ```qdj fenced block. A single query
 * through a phase oracle distinguishes a constant function (all-zeros with
 * certainty) from a balanced one (never all-zeros) — the canonical proof that
 * quantum interference can beat classical query complexity. Runs the
 * ancilla-free phase-oracle circuit entirely in-browser on the qcsim-parity
 * kernel (math.ts); no backend, static-export safe.
 */

const ORACLE_LABELS: Record<string, string> = {
  constant0: "f(x) = 0 (always)",
  constant1: "f(x) = 1 (always)",
  parity: "f(x) = parity of x",
  lowbit: "f(x) = lowest bit of x",
};

const ORACLE_KEYS = Object.keys(ORACLES);

function parseSource(source: string): { n: number } | { error: string } {
  try {
    const trimmed = source.trim();
    const parsed = trimmed ? (JSON.parse(trimmed) as Record<string, unknown>) : {};
    const n = typeof parsed.qubits === "number" ? parsed.qubits : 3;
    if (!Number.isInteger(n) || n < 2 || n > 3) {
      return { error: `qubits must be 2 or 3 (got ${String(parsed.qubits)})` };
    }
    return { n };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function DjDemo({ source }: { source: string }) {
  const config = useMemo(() => parseSource(source), [source]);
  const [oracleKey, setOracleKey] = useState("constant0");
  const selectId = useId();

  const result = useMemo(() => {
    if ("error" in config) return null;
    try {
      const probs = djProbabilities(config.n, ORACLES[oracleKey] ?? ORACLES.constant0);
      return { probs, constant: isConstant(probs), n: config.n };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [config, oracleKey]);

  if ("error" in config) {
    return (
      <div className="not-prose my-8 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3">
        <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
          qdj error: {config.error}
        </p>
      </div>
    );
  }

  if (!result || "error" in result) {
    return (
      <div className="not-prose my-8 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3">
        <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
          qdj error: {result?.error ?? "could not evaluate oracle"}
        </p>
      </div>
    );
  }

  const verdict = result.constant ? "Constant" : "Balanced";

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Deutsch&#8211;Jozsa
        </span>
        <span
          className={`rounded-chip px-2 py-0.5 text-xs font-semibold ${
            result.constant
              ? "bg-accent/10 text-accent-dark dark:text-accent-light"
              : "bg-warm/10 text-warm-dark dark:text-warm-light"
          }`}
        >
          {verdict}
        </span>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={selectId}
            className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Oracle
          </label>
          <select
            id={selectId}
            aria-label="Oracle"
            value={oracleKey}
            onChange={(e) => setOracleKey(e.target.value)}
            className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {ORACLE_KEYS.map((key) => (
              <option key={key} value={key}>
                {ORACLE_LABELS[key] ?? key}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          {result.probs.map((p, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-16 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                |{basisLabel(idx, result.n)}&#10217;
              </span>
              <span className="relative h-3 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${(p * 100).toFixed(2)}%` }}
                />
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {(p * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
          One query decides it: all-zeros with certainty means the function never
          varies; any other outcome means it splits its inputs evenly.
        </p>
      </div>
    </div>
  );
}
