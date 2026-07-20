"use client";

import { useId, useMemo, useState } from "react";
import {
  ErrorCard as SharedErrorCard,
  fieldClass,
  LiveStatus,
  ProbBars,
  WidgetCard,
} from "./widget-ui";
import { djProbabilities, isConstant, ORACLES, type OracleKey } from "./deutsch-jozsa";
import { percentSR } from "./format";

/**
 * Deutsch-Jozsa oracle demo rendered from a ```qdj fenced block. A single query
 * through a phase oracle distinguishes a constant function (all-zeros with
 * certainty) from a balanced one (never all-zeros) — the canonical proof that
 * quantum interference can beat classical query complexity. Runs the
 * ancilla-free phase-oracle circuit entirely in-browser on the qcsim-parity
 * kernel (math.ts); no backend, static-export safe.
 */

// The kernel owns both halves (function + label), so there is no second map to
// keep in sync and no `??` fallback that could render a raw key.
const ORACLE_KEYS = Object.keys(ORACLES) as OracleKey[];

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
  const [oracleKey, setOracleKey] = useState<OracleKey>("constant0");
  const selectId = useId();

  const result = useMemo(() => {
    if ("error" in config) return null;
    try {
      const probs = djProbabilities(config.n, ORACLES[oracleKey].f);
      return { probs, constant: isConstant(probs), n: config.n };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [config, oracleKey]);

  if ("error" in config) {
    return <SharedErrorCard label="qdj" message={config.error} />;
  }

  if (!result || "error" in result) {
    return (
      <SharedErrorCard label="qdj" message={result?.error ?? "could not evaluate oracle"} />
    );
  }

  const verdict = result.constant ? "Constant" : "Balanced";

  return (
    <WidgetCard
      eyebrow={<>Deutsch&#8211;Jozsa</>}
      headerRight={
        <span
          className={`rounded-chip px-2 py-0.5 text-xs font-semibold ${
            result.constant
              ? "bg-accent/10 text-accent-dark dark:text-accent-light"
              : "bg-warm/10 text-warm-dark dark:text-warm-light"
          }`}
        >
          {verdict}
        </span>
      }
    >
      <LiveStatus>
        {`Verdict: ${verdict}. All-zeros probability ${percentSR(result.probs[0] * 100)}.`}
      </LiveStatus>

      <div className="px-4 py-4 space-y-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={selectId}
            className="text-[11px] font-medium uppercase tracking-wide text-caption"
          >
            Oracle
          </label>
          {/* The visible <label htmlFor> above is the accessible name; an
              aria-label here would redundantly override it. `fieldClass` is the
              shared control recipe (rounded-control + --bd/--field/--ink + the
              site-wide `focus-ring`, whose solid per-theme --focus token on
              focus-visible replaced the alpha `focus:ring-accent/40` this once
              hand-rolled — that composited below the 3:1 WCAG 1.4.11 floor in
              BOTH themes and fired on mouse click too). It carries no sizing, so
              the px/py/text utilities are appended here. */}
          <select
            id={selectId}
            value={oracleKey}
            onChange={(e) => setOracleKey(e.target.value as OracleKey)}
            className={`${fieldClass} px-2 py-1.5 text-sm`}
          >
            {ORACLE_KEYS.map((key) => (
              <option key={key} value={key}>
                {ORACLES[key].label}
              </option>
            ))}
          </select>
        </div>

        {/* The verdict rests entirely on the all-zeros row (100% => constant,
            0% => balanced), and the footnote below sends the reader looking
            for it — so it carries the accent emphasis the sibling widgets use
            for their decisive row. */}
        <ProbBars probs={result.probs} n={result.n} highlightIndex={0} />

        <p className="text-xs text-caption leading-relaxed">
          One query decides it: all-zeros with certainty means the function never
          varies; any other outcome means it splits its inputs evenly.
        </p>
      </div>
    </WidgetCard>
  );
}
