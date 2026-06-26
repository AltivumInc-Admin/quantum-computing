"use client";

import { useId, useMemo, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, LiveStatus, WidgetCard } from "./widget-ui";
import { paramSavedSec, paramTimeNaive, paramTimeReused } from "./hybrid";
import { usePrefersReducedMotion } from "./use-display-caps";
import { clamp, readNumber } from "./parse-utils";

/**
 * Inline parametric-compilation explorer rendered from a ```qparam fenced block in
 * the 06-hybrid-jobs GUIDE. Parses an optional
 * `{ "iterations": 50, "compileSec": 8, "runSec": 2 }` config (empty -> defaults),
 * then contrasts two wall-clock strategies for an n-iteration variational loop:
 * recompiling the circuit every iteration vs. compiling a FreeParameter circuit
 * once and reusing it across iterations. Sliders drive iterations / per-circuit
 * compile seconds / per-circuit run seconds; two to-scale horizontal time bars,
 * the seconds saved and percent saved update live. Pure client, static-export
 * safe, no AWS calls.
 *
 * Honesty: the per-circuit compile time is an illustrative input that varies by
 * device and circuit; the compile-once-and-reuse behavior is a real Amazon Braket
 * feature for FreeParameter circuits on transpiled / superconducting QPUs.
 */

const ITER_MIN = 1;
const ITER_MAX = 500;
const SEC_MIN = 0;
const SEC_MAX = 120;

const DEFAULTS = { iterations: 50, compileSec: 8, runSec: 2 } as const;

const BAR_W = 220;
const BAR_H = 18;

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

type Config = { iterations: number; compileSec: number; runSec: number };
type ParseResult = { ok: true; config: Config } | { ok: false; error: string };

function parseSource(source: string): ParseResult {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return { ok: true, config: { ...DEFAULTS } };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "expected a JSON object" };
  }
  const obj = raw as Record<string, unknown>;

  const iterations = readNumber(obj, "iterations", DEFAULTS.iterations, ITER_MIN, ITER_MAX);
  if (!iterations.ok) return iterations;
  const compileSec = readNumber(obj, "compileSec", DEFAULTS.compileSec, SEC_MIN, SEC_MAX);
  if (!compileSec.ok) return compileSec;
  const runSec = readNumber(obj, "runSec", DEFAULTS.runSec, SEC_MIN, SEC_MAX);
  if (!runSec.ok) return runSec;

  return {
    ok: true,
    config: {
      iterations: Math.round(iterations.value),
      compileSec: compileSec.value,
      runSec: runSec.value,
    },
  };
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="qparam" message={message} />;
}

// ---------------------------------------------------------------------------
// Time bar
// ---------------------------------------------------------------------------

function formatSec(s: number): string {
  return `${s.toFixed(1)}s`;
}

function TimeBar({
  label,
  seconds,
  maxSeconds,
  tone,
  reduced,
}: {
  label: string;
  seconds: number;
  maxSeconds: number;
  tone: "naive" | "reused";
  reduced: boolean;
}) {
  const frac = maxSeconds > 0 ? clamp(seconds / maxSeconds, 0, 1) : 0;
  const fill =
    tone === "naive"
      ? "color-mix(in oklab, var(--accent) 32%, transparent)"
      : "var(--accent)";

  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-xs text-gray-600 dark:text-gray-300">
        {label}
      </span>
      <svg
        viewBox={`0 0 ${BAR_W} ${BAR_H}`}
        width={BAR_W}
        height={BAR_H}
        role="img"
        aria-label={`${label}: ${formatSec(seconds)} wall-clock.`}
        className="flex-1 max-w-[220px]"
        preserveAspectRatio="none"
      >
        <rect
          x={0}
          y={0}
          width={BAR_W}
          height={BAR_H}
          rx={4}
          className="fill-gray-100 dark:fill-gray-800"
        />
        <rect
          x={0}
          y={0}
          width={Math.max(0, frac * BAR_W)}
          height={BAR_H}
          rx={4}
          fill={fill}
          className="transition-[width] duration-200 motion-reduce:transition-none"
          style={reduced ? { transition: "none" } : undefined}
        />
      </svg>
      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-700 dark:text-gray-200">
        {formatSec(seconds)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slider row
// ---------------------------------------------------------------------------

function SliderRow({
  id,
  label,
  unitLabel,
  value,
  min,
  max,
  step,
  display,
  ariaLabel,
  ariaValueText,
  onChange,
}: {
  id: string;
  label: string;
  unitLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  ariaLabel: string;
  ariaValueText: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <label
        htmlFor={id}
        className="w-32 shrink-0 font-mono text-xs text-gray-600 dark:text-gray-300"
      >
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider flex-1 focus-ring"
        aria-label={ariaLabel}
        aria-valuetext={ariaValueText}
      />
      <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
        {display}
        <span className="ml-1 text-caption">{unitLabel}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ParamCompileExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  const reduced = usePrefersReducedMotion();
  const base = parsed.ok ? parsed.config : DEFAULTS;
  const [iterations, setIterations] = useState(base.iterations);
  const [compileSec, setCompileSec] = useState(base.compileSec);
  const [runSec, setRunSec] = useState(base.runSec);
  const iterId = useId();
  const compileId = useId();
  const runId = useId();

  const metrics = useMemo(() => {
    const n = clamp(Math.round(iterations), ITER_MIN, ITER_MAX);
    const c = clamp(compileSec, SEC_MIN, SEC_MAX);
    const r = clamp(runSec, SEC_MIN, SEC_MAX);
    const naive = paramTimeNaive(n, c, r);
    const reused = paramTimeReused(n, c, r);
    const saved = paramSavedSec(n, c);
    const percent = naive > 0 ? (saved / naive) * 100 : 0;
    return { n, c, r, naive, reused, saved, percent };
  }, [iterations, compileSec, runSec]);

  if (!parsed.ok) {
    return <ErrorCard message={parsed.error} />;
  }

  const { n, c, r, naive, reused, saved, percent } = metrics;
  const maxSeconds = Math.max(naive, reused, 1e-9);

  return (
    <WidgetCard eyebrow="Parametric compilation" chips={<Chip>{n} iter</Chip>}>
      <LiveStatus>
        {`Compile once and reuse saves ${formatSec(saved)} (${percent.toFixed(
          1
        )}% less wall-clock) over ${n} iterations.`}
      </LiveStatus>

      <div className="px-4 py-4">
        {/* Time bars */}
        <div className="space-y-2.5">
          <TimeBar
            label="recompile every iteration"
            seconds={naive}
            maxSeconds={maxSeconds}
            tone="naive"
            reduced={reduced}
          />
          <TimeBar
            label="compile once, reuse"
            seconds={reused}
            maxSeconds={maxSeconds}
            tone="reused"
            reduced={reduced}
          />
        </div>

        {/* Saved readout */}
        <p className="mt-4 text-sm text-gray-800 dark:text-gray-100">
          saved{" "}
          <span className="font-semibold tabular-nums text-accent dark:text-accent-light">
            {formatSec(saved)}
          </span>{" "}
          <span className="text-gray-500 dark:text-gray-400">
            ({percent.toFixed(1)}% less wall-clock)
          </span>
        </p>

        {/* Sliders */}
        <div className="mt-4">
          <SliderRow
            id={iterId}
            label="iterations"
            unitLabel="iter"
            value={iterations}
            min={ITER_MIN}
            max={ITER_MAX}
            step={1}
            display={String(n)}
            ariaLabel="Number of loop iterations"
            ariaValueText={`${n} iterations`}
            onChange={(v) => setIterations(clamp(Math.round(v), ITER_MIN, ITER_MAX))}
          />
          <SliderRow
            id={compileId}
            label="compile / circuit"
            unitLabel="s"
            value={compileSec}
            min={SEC_MIN}
            max={SEC_MAX}
            step={0.5}
            display={c.toFixed(1)}
            ariaLabel="Per-circuit compile time in seconds"
            ariaValueText={`${c.toFixed(1)} seconds`}
            onChange={(v) => setCompileSec(clamp(v, SEC_MIN, SEC_MAX))}
          />
          <SliderRow
            id={runId}
            label="run / circuit"
            unitLabel="s"
            value={runSec}
            min={SEC_MIN}
            max={SEC_MAX}
            step={0.5}
            display={r.toFixed(1)}
            ariaLabel="Per-circuit run time in seconds"
            ariaValueText={`${r.toFixed(1)} seconds`}
            onChange={(v) => setRunSec(clamp(v, SEC_MIN, SEC_MAX))}
          />
        </div>

        {/* Note */}
        <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Braket compiles a FreeParameter circuit once and reuses it across
          iterations on transpiled / superconducting QPUs. Per-circuit compile time
          is an illustrative input that varies by device and circuit; the
          compile-once-and-reuse behavior is a real Braket feature.
        </p>
      </div>
    </WidgetCard>
  );
}
