"use client";

import { useId, useMemo, useState } from "react";
import { ErrorCard as SharedErrorCard } from "./widget-ui";
import { wastedNoCheckpoint, wastedWithCheckpoint } from "./hybrid";
import { H2 as H } from "./h2-data";
import { usePrefersReducedMotion } from "./use-display-caps";
import { clampInt } from "./parse-utils";

/**
 * Inline checkpointing explorer rendered from a ```qcheckpoint fenced block in
 * the 06-hybrid-jobs GUIDE. A long VQE-style sweep over the H2 bond-length curve
 * runs `iterations` steps; somewhere in the middle a spot instance is reclaimed
 * (a failure). Without checkpointing the restart redoes every completed step;
 * with a checkpoint saved every `every` iterations it resumes from the last
 * save. This is a CONCEPT visualization of Braket Hybrid Jobs'
 * save_job_checkpoint / load_job_checkpoint — the wasted-iteration counts are
 * EXACT from hybrid.ts (wastedNoCheckpoint / wastedWithCheckpoint), not a
 * billing oracle. Pure client, no AWS, static-export safe.
 */

const TIMELINE_W = 320;
const ROW_H = 18;

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

const DEFAULTS = { iterations: 40, failAt: 27, every: 10 } as const;

type ParseOk = {
  ok: true;
  iterations: number;
  failAt: number;
  every: number;
};
type ParseResult = ParseOk | { ok: false; error: string };

function parseSource(source: string): ParseResult {
  const trimmed = source.trim();
  let iterations: number = DEFAULTS.iterations;
  let failAt: number = DEFAULTS.failAt;
  let every: number = DEFAULTS.every;

  if (trimmed.length > 0) {
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
    if (obj["iterations"] !== undefined) {
      if (typeof obj["iterations"] !== "number") {
        return { ok: false, error: '"iterations" must be a number' };
      }
      iterations = obj["iterations"];
    }
    if (obj["failAt"] !== undefined) {
      if (typeof obj["failAt"] !== "number") {
        return { ok: false, error: '"failAt" must be a number' };
      }
      failAt = obj["failAt"];
    }
    if (obj["every"] !== undefined) {
      if (typeof obj["every"] !== "number") {
        return { ok: false, error: '"every" must be a number' };
      }
      every = obj["every"];
    }
  }

  // Clamp iterations first, then derive the dependent bounds from it.
  iterations = clampInt(iterations, 2, 120);
  failAt = clampInt(failAt, 0, iterations);
  every = clampInt(every, 1, iterations);

  return { ok: true, iterations, failAt, every };
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="qcheckpoint" message={message} />;
}

// ---------------------------------------------------------------------------
// Timeline row SVG
// ---------------------------------------------------------------------------

function TimelineRow({
  iterations,
  every,
  failAt,
  redoneFrom,
  label,
  ariaLabel,
  showCheckpoints,
  reduced,
}: {
  iterations: number;
  every: number;
  failAt: number;
  redoneFrom: number;
  label: string;
  ariaLabel: string;
  showCheckpoints: boolean;
  reduced: boolean;
}) {
  const cellW = TIMELINE_W / iterations;
  // Clamp so a failure at the final iteration sits on the right edge instead of
  // clipping to half width (the marker is centered on failX).
  const failX = Math.min(failAt * cellW, TIMELINE_W - 1);

  // Checkpoint multiples of `every` up to iterations (and the implicit 0 start).
  const checkpoints: number[] = [];
  if (showCheckpoints) {
    for (let c = 0; c <= iterations; c += every) checkpoints.push(c);
  }

  return (
    <svg
      viewBox={`0 0 ${TIMELINE_W} ${ROW_H + 8}`}
      width={TIMELINE_W}
      height={ROW_H + 8}
      role="img"
      aria-label={ariaLabel}
      className="w-full max-w-[320px] block"
    >
      {/* base track cells */}
      {Array.from({ length: iterations }, (_, i) => (
        <rect
          key={i}
          x={i * cellW}
          y={4}
          width={Math.max(0, cellW - 0.6)}
          height={ROW_H}
          rx={0.8}
          fill="color-mix(in oklab, var(--accent) 10%, transparent)"
        />
      ))}

      {/* shaded "redone on restart" region: cells redoneFrom .. failAt */}
      {failAt > redoneFrom && (
        <rect
          x={redoneFrom * cellW}
          y={4}
          width={(failAt - redoneFrom) * cellW}
          height={ROW_H}
          rx={0.8}
          fill="color-mix(in oklab, var(--accent) 42%, transparent)"
          className={
            reduced
              ? undefined
              : "transition-[width,x] duration-200 motion-reduce:transition-none"
          }
        />
      )}

      {/* checkpoint tick marks at multiples of `every` */}
      {checkpoints.map((c) => (
        <line
          key={`cp-${c}`}
          x1={c * cellW}
          y1={1}
          x2={c * cellW}
          y2={ROW_H + 6}
          stroke="currentColor"
          strokeWidth={1.2}
          className="text-gray-500 dark:text-gray-400"
        />
      ))}

      {/* FAILURE marker at failAt */}
      <line
        x1={failX}
        y1={0}
        x2={failX}
        y2={ROW_H + 8}
        stroke="currentColor"
        strokeWidth={2}
        className="text-rose-500 dark:text-rose-400"
      />

      <text
        x={2}
        y={ROW_H + 6}
        fontSize={7}
        className="fill-gray-400 dark:fill-gray-500 font-mono"
        aria-hidden="true"
      >
        {label}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CheckpointExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  const iterations = parsed.ok ? parsed.iterations : DEFAULTS.iterations;
  const [failAt, setFailAt] = useState(parsed.ok ? parsed.failAt : DEFAULTS.failAt);
  const [every, setEvery] = useState(parsed.ok ? parsed.every : DEFAULTS.every);
  const failId = useId();
  const everyId = useId();
  const headingId = useId();
  const reduced = usePrefersReducedMotion();

  // Clamp interactive state to the parsed iteration count (source may shrink it).
  const clampedFail = Math.max(0, Math.min(failAt, iterations));
  const clampedEvery = Math.max(1, Math.min(every, iterations));

  const metrics = useMemo(() => {
    const wastedNo = wastedNoCheckpoint(clampedFail);
    const wastedWith = wastedWithCheckpoint(clampedFail, clampedEvery);
    const lastCheckpoint = Math.floor(clampedFail / clampedEvery) * clampedEvery;
    const saving = Math.max(0, wastedNo - wastedWith);
    return { wastedNo, wastedWith, lastCheckpoint, saving };
  }, [clampedFail, clampedEvery]);

  if (!parsed.ok) {
    return <ErrorCard message={parsed.error} />;
  }

  const { wastedNo, wastedWith, lastCheckpoint, saving } = metrics;
  const bondLengths = H.points.length;

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <h3
          id={headingId}
          className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light"
        >
          Checkpointing
        </h3>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          {iterations} iters
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          {bondLengths} bond lengths
        </span>
      </div>

      <div className="px-4 py-4">
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          A long VQE sweep over the H2 curve ({bondLengths} bond lengths) runs as{" "}
          {iterations} job iterations. When the managed instance is reclaimed at
          the failure point, a restart redoes the shaded work.
          save_job_checkpoint resumes from the last checkpoint instead.
        </p>

        {/* Timelines */}
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-gray-600 dark:text-gray-300">
              No checkpoint
            </p>
            <TimelineRow
              iterations={iterations}
              every={clampedEvery}
              failAt={clampedFail}
              redoneFrom={0}
              label="restart redoes 0..fail"
              showCheckpoints={false}
              reduced={reduced}
              ariaLabel={`No-checkpoint timeline of ${iterations} iterations. Failure at iteration ${clampedFail}. A restart redoes all ${wastedNo} completed iterations.`}
            />
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium text-gray-600 dark:text-gray-300">
              Checkpoint every {clampedEvery}
            </p>
            <TimelineRow
              iterations={iterations}
              every={clampedEvery}
              failAt={clampedFail}
              redoneFrom={lastCheckpoint}
              label="restart redoes lastCheckpoint..fail"
              showCheckpoints
              reduced={reduced}
              ariaLabel={`Checkpointed timeline of ${iterations} iterations with a checkpoint every ${clampedEvery}. Failure at iteration ${clampedFail}. The last checkpoint is at ${lastCheckpoint}, so a restart redoes only ${wastedWith} iterations.`}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label
              htmlFor={failId}
              className="w-28 shrink-0 font-mono text-xs text-gray-600 dark:text-gray-300"
            >
              fail at
            </label>
            <input
              id={failId}
              type="range"
              min={0}
              max={iterations}
              step={1}
              value={clampedFail}
              onChange={(e) => setFailAt(parseInt(e.target.value, 10))}
              className="slider flex-1 focus-ring"
              aria-label="Iteration at which the managed instance is reclaimed"
              aria-valuetext={`${clampedFail} iterations`}
            />
            <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {clampedFail}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor={everyId}
              className="w-28 shrink-0 font-mono text-xs text-gray-600 dark:text-gray-300"
            >
              checkpoint every
            </label>
            <input
              id={everyId}
              type="range"
              min={1}
              max={iterations}
              step={1}
              value={clampedEvery}
              onChange={(e) => setEvery(parseInt(e.target.value, 10))}
              className="slider flex-1 focus-ring"
              aria-label="Checkpoint interval in iterations"
              aria-valuetext={`${clampedEvery} iterations`}
            />
            <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {clampedEvery}
            </span>
          </div>
        </div>

        {/* Readout */}
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-control border border-gray-200/70 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
            <p className="font-mono text-lg font-semibold tabular-nums text-gray-800 dark:text-gray-100">
              {wastedNo.toFixed(0)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
              wasted, no checkpoint
            </p>
          </div>
          <div className="rounded-control border border-gray-200/70 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
            <p className="font-mono text-lg font-semibold tabular-nums text-gray-800 dark:text-gray-100">
              {wastedWith.toFixed(0)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
              wasted, with checkpoint
            </p>
          </div>
          <div className="rounded-control border border-gray-200/70 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
            <p className="font-mono text-lg font-semibold tabular-nums text-accent dark:text-accent-light">
              {saving.toFixed(0)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
              iterations saved
            </p>
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
          Concept visualization of save_job_checkpoint / load_job_checkpoint.
          Counts are exact from the model: a restart without checkpointing redoes
          every completed iteration, while a checkpoint every {clampedEvery}{" "}
          iterations bounds the lost work to the steps since the last save.
        </p>
      </div>
    </div>
  );
}
