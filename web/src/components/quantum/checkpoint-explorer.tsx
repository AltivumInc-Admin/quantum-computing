"use client";

import { useId, useMemo, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, LabeledSlider, LiveStatus, WidgetCard } from "./widget-ui";
import { wastedNoCheckpoint, wastedWithCheckpoint } from "./hybrid";
import { usePrefersReducedMotion } from "./use-display-caps";
import { clamp, clampInt, parseJsonObject, readNumber } from "./parse-utils";

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
  let iterations: number = DEFAULTS.iterations;
  let failAt: number = DEFAULTS.failAt;
  let every: number = DEFAULTS.every;

  const base = parseJsonObject(source);
  if (!base.ok) return { ok: false, error: base.error };
  if (base.obj) {
    const obj = base.obj;
    // readNumber (not a hand-rolled typeof check) so this widget rejects the
    // same malformed fence bodies its F11 siblings do. A bare `typeof x ===
    // "number"` accepts Infinity — which JSON.parse produces for a literal like
    // 1e999 — and clampInt then silently coerced it to a plausible 120, so the
    // same bad config errored loudly in qjob and rendered a wrong-but-credible
    // timeline here. Bounds are the static outer ones; the failAt/every bounds
    // that DEPEND on the resolved iteration count are still applied below.
    const it = readNumber(obj, "iterations", DEFAULTS.iterations, 2, 120);
    if (!it.ok) return { ok: false, error: it.error };
    const fa = readNumber(obj, "failAt", DEFAULTS.failAt, 0, 120);
    if (!fa.ok) return { ok: false, error: fa.error };
    const ev = readNumber(obj, "every", DEFAULTS.every, 1, 120);
    if (!ev.ok) return { ok: false, error: ev.error };
    iterations = it.value;
    failAt = fa.value;
    every = ev.value;
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
  ariaLabel,
  showCheckpoints,
  reduced,
}: {
  iterations: number;
  every: number;
  failAt: number;
  redoneFrom: number;
  ariaLabel: string;
  showCheckpoints: boolean;
  reduced: boolean;
}) {
  const cellW = TIMELINE_W / iterations;
  const failX = Math.min(failAt * cellW, TIMELINE_W - 1);

  const baseCells = useMemo(
    () => Array.from({ length: iterations }, (_, i) => (
      <rect key={i} x={i * cellW} y={4} width={Math.max(0, cellW - 0.6)} height={ROW_H}
        rx={0.8} fill="color-mix(in oklab, var(--accent) 10%, transparent)" />
    )),
    [iterations, cellW]
  );

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
      {baseCells}

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
  const headingId = useId();
  const reduced = usePrefersReducedMotion();

  // Clamp interactive state to the parsed iteration count (source may shrink it).
  const clampedFail = clamp(failAt, 0, iterations);
  const clampedEvery = clamp(every, 1, iterations);

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

  return (
    <WidgetCard
      eyebrow="Checkpointing"
      eyebrowAs="h3"
      eyebrowId={headingId}
      // No bond-length chip: the H2 fixture's 49 points are fixed while
      // `iterations` is fence-configurable (2..120), so the two numbers have no
      // mapping — and bondLengths never enters the checkpointing model at all
      // (it depends only on failAt and every). Sitting beside the iteration
      // chip it read as a driver and invited a relationship that isn't there.
      chips={<Chip>{iterations} iters</Chip>}
    >
      <LiveStatus>
        {`Failure at iteration ${clampedFail}, checkpoint every ${clampedEvery}: ${saving.toFixed(
          0
        )} iterations saved (${wastedNo.toFixed(0)} redone without, ${wastedWith.toFixed(
          0
        )} with).`}
      </LiveStatus>

      <div className="px-4 py-4">
        <p className="text-xs leading-relaxed text-caption">
          A long VQE sweep over the H2 dissociation curve runs as {iterations}{" "}
          job iterations. When the managed instance is reclaimed at the failure
          point, a restart redoes the shaded work. save_job_checkpoint resumes
          from the last checkpoint instead.
        </p>

        {/* Timelines */}
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-caption">
              No checkpoint
            </p>
            <TimelineRow
              iterations={iterations}
              every={clampedEvery}
              failAt={clampedFail}
              redoneFrom={0}
              showCheckpoints={false}
              reduced={reduced}
              ariaLabel={`No-checkpoint timeline of ${iterations} iterations. Failure at iteration ${clampedFail}. A restart redoes all ${wastedNo} completed iterations.`}
            />
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium text-caption">
              Checkpoint every {clampedEvery}
            </p>
            <TimelineRow
              iterations={iterations}
              every={clampedEvery}
              failAt={clampedFail}
              redoneFrom={lastCheckpoint}
              showCheckpoints
              reduced={reduced}
              ariaLabel={`Checkpointed timeline of ${iterations} iterations with a checkpoint every ${clampedEvery}. Failure at iteration ${clampedFail}. The last checkpoint is at ${lastCheckpoint}, so a restart redoes only ${wastedWith} iterations.`}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="mt-5 flex flex-col gap-3">
          <LabeledSlider
            label="fail at"
            value={clampedFail}
            min={0}
            max={iterations}
            step={1}
            parse={(s) => parseInt(s, 10)}
            onChange={setFailAt}
            ariaLabel="Iteration at which the managed instance is reclaimed"
            ariaValueText={`${clampedFail} iterations`}
            display={clampedFail}
            labelClassName="w-28 shrink-0 font-mono text-xs text-caption"
            valueWidth="w-10"
          />

          <LabeledSlider
            label="checkpoint every"
            value={clampedEvery}
            min={1}
            max={iterations}
            step={1}
            parse={(s) => parseInt(s, 10)}
            onChange={setEvery}
            ariaLabel="Checkpoint interval in iterations"
            ariaValueText={`${clampedEvery} iterations`}
            display={clampedEvery}
            labelClassName="w-28 shrink-0 font-mono text-xs text-caption"
            valueWidth="w-10"
          />
        </div>

        {/* Readout */}
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-control border border-(--bd) bg-(--field) px-3 py-2">
            <p className="font-mono text-lg font-semibold tabular-nums text-(--ink)">
              {wastedNo.toFixed(0)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-caption">
              wasted, no checkpoint
            </p>
          </div>
          <div className="rounded-control border border-(--bd) bg-(--field) px-3 py-2">
            <p className="font-mono text-lg font-semibold tabular-nums text-(--ink)">
              {wastedWith.toFixed(0)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-caption">
              wasted, with checkpoint
            </p>
          </div>
          <div className="rounded-control border border-(--bd) bg-(--field) px-3 py-2">
            <p className="font-mono text-lg font-semibold tabular-nums text-accent-dark dark:text-accent-light">
              {saving.toFixed(0)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-caption">
              iterations saved
            </p>
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-caption">
          Concept visualization of save_job_checkpoint / load_job_checkpoint.
          Counts are exact from the model: a restart without checkpointing redoes
          every completed iteration, while a checkpoint every {clampedEvery}{" "}
          iterations bounds the lost work to the steps since the last save.
        </p>
      </div>
    </WidgetCard>
  );
}
