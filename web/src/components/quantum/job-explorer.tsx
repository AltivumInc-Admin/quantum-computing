"use client";

import { useId, useMemo, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, EyebrowLabel, WidgetCard } from "./widget-ui";
import { parseJsonObject, readNumber } from "./parse-utils";
import {
  INSTANCES,
  hybridWallClockSec,
  jobTotalCost,
  qpuCost,
  standaloneWallClockSec,
  type InstanceType,
} from "./hybrid";
import { type Provider } from "./cost";
import { usePrefersReducedMotion } from "./use-display-caps";

/**
 * Inline standalone-vs-hybrid job explorer rendered from a ```qjob fenced block
 * in the 06-hybrid-jobs GUIDE. Parses an optional JSON config (iterations, shots,
 * provider, instance, queue wait, per-iteration compute) and contrasts running an
 * iterative variational algorithm two ways:
 *
 *   STANDALONE — every iteration is its own quantum task that waits in the device's
 *   general queue (illustrative queue estimate) and pays only the QPU per-task /
 *   per-shot rate (no managed instance).
 *
 *   HYBRID JOB — tasks get priority access and run back-to-back after a one-time
 *   container startup, trading a small SageMaker instance charge for a large
 *   wall-clock reduction.
 *
 * All math comes from hybrid.ts / cost.ts (the single source of truth). Pure
 * client, static-export safe, no AWS calls.
 */

const STARTUP_SEC = 60; // one-time Hybrid Job container startup

// --- per-shot QPU providers usable for a Hybrid Job (cost.ts) -------------
const PROVIDERS: Provider[] = ["IonQ", "IQM", "QuEra", "Rigetti"];
const INSTANCE_KEYS = Object.keys(INSTANCES) as InstanceType[];

// --- clamp ranges (contract) ----------------------------------------------
const ITER = { min: 1, max: 500 } as const;
const SHOTS = { min: 1, max: 100000 } as const;
const QUEUE = { min: 0, max: 600 } as const;
const ITERSEC = { min: 0.1, max: 120 } as const;

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

type Config = {
  iterations: number;
  shots: number;
  provider: Provider;
  instance: InstanceType;
  queueWaitSec: number;
  iterSec: number;
};

type ParseResult = { ok: true; config: Config } | { ok: false; error: string };

const DEFAULTS: Config = {
  iterations: 60,
  shots: 1000,
  provider: "IonQ",
  instance: "ml.m5.large",
  queueWaitSec: 45,
  iterSec: 6,
};

function parseSource(source: string): ParseResult {
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj === null) return { ok: true, config: { ...DEFAULTS } };
  const obj = base.obj;

  let provider: Provider = DEFAULTS.provider;
  if (obj["provider"] !== undefined) {
    if (typeof obj["provider"] !== "string" || !PROVIDERS.includes(obj["provider"] as Provider)) {
      return { ok: false, error: `provider must be one of ${PROVIDERS.join(", ")}` };
    }
    provider = obj["provider"] as Provider;
  }

  let instance: InstanceType = DEFAULTS.instance;
  if (obj["instance"] !== undefined) {
    if (typeof obj["instance"] !== "string" || !INSTANCE_KEYS.includes(obj["instance"] as InstanceType)) {
      return { ok: false, error: `instance must be one of ${INSTANCE_KEYS.join(", ")}` };
    }
    instance = obj["instance"] as InstanceType;
  }

  const it = readNumber(obj, "iterations", DEFAULTS.iterations, ITER.min, ITER.max);
  if (!it.ok) return { ok: false, error: it.error };
  const sh = readNumber(obj, "shots", DEFAULTS.shots, SHOTS.min, SHOTS.max);
  if (!sh.ok) return { ok: false, error: sh.error };
  const qw = readNumber(obj, "queueWaitSec", DEFAULTS.queueWaitSec, QUEUE.min, QUEUE.max);
  if (!qw.ok) return { ok: false, error: qw.error };
  const isec = readNumber(obj, "iterSec", DEFAULTS.iterSec, ITERSEC.min, ITERSEC.max);
  if (!isec.ok) return { ok: false, error: isec.error };

  const config: Config = {
    iterations: Math.round(it.value),
    shots: Math.round(sh.value),
    provider,
    instance,
    queueWaitSec: qw.value,
    iterSec: isec.value,
  };
  return { ok: true, config };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Wall-clock seconds -> compact "Xh Ym", "Xm Ys", or "Xs". */
function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatUsd(v: number): string {
  return `$${v.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="qjob" message={message} />;
}

// ---------------------------------------------------------------------------
// Compared bar (one mode: wall-clock + cost)
// ---------------------------------------------------------------------------

function CompareBar({
  label,
  wallSec,
  cost,
  wallFrac,
  costFrac,
  accent,
  note,
  reduced,
}: {
  label: string;
  wallSec: number;
  cost: number;
  wallFrac: number;
  costFrac: number;
  accent: boolean;
  note: string;
  reduced: boolean;
}) {
  // Reduced motion: also skip the JS-driven width transition entirely (the
  // motion-reduce:transition-none class covers CSS, this guards inline styles).
  const transition = reduced ? "none" : undefined;
  const ariaLabel = `${label}: wall-clock ${formatDuration(wallSec)}, total cost ${formatUsd(
    cost
  )}. ${note}`;
  const barColor = accent
    ? "color-mix(in oklab, var(--accent) 70%, transparent)"
    : "color-mix(in oklab, var(--accent) 24%, transparent)";

  return (
    <div className="rounded-control border border-gray-200/80 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-900/40 px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
          {label}
        </span>
        <span className="text-[11px] text-caption">{note}</span>
      </div>

      {/* wall-clock */}
      <div className="mt-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">wall-clock</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-100">
            {formatDuration(wallSec)}
          </span>
        </div>
        <span
          role="img"
          aria-label={`${label} wall-clock bar: ${formatDuration(wallSec)}.`}
          className="mt-1 block h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden"
        >
          <span
            className="block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${(wallFrac * 100).toFixed(2)}%`, background: barColor, transition }}
          />
        </span>
      </div>

      {/* cost */}
      <div className="mt-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">total cost</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-100">
            {formatUsd(cost)}
          </span>
        </div>
        <span
          role="img"
          aria-label={`${label} cost bar: ${formatUsd(cost)}.`}
          className="mt-1 block h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden"
        >
          <span
            className="block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${(costFrac * 100).toFixed(2)}%`, background: barColor, transition }}
          />
        </span>
      </div>

      <p className="sr-only">{ariaLabel}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function JobExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  const reduced = usePrefersReducedMotion();
  const initial = parsed.ok ? parsed.config : DEFAULTS;

  const [iterations, setIterations] = useState(initial.iterations);
  const [queueWaitSec, setQueueWaitSec] = useState(initial.queueWaitSec);
  const [iterSec, setIterSec] = useState(initial.iterSec);
  const [provider, setProvider] = useState<Provider>(initial.provider);
  const [instance, setInstance] = useState<InstanceType>(initial.instance);

  const iterId = useId();
  const queueId = useId();
  const iterSecId = useId();
  const providerId = useId();
  const instanceId = useId();

  const shots = initial.shots;

  const result = useMemo(() => {
    const n = iterations;

    // Standalone: general-queue wall-clock; QPU cost only (no instance charge).
    const standaloneWall = standaloneWallClockSec(n, queueWaitSec, iterSec);
    const standaloneCost = qpuCost(provider, n, shots);

    // Hybrid Job: priority back-to-back after a one-time container startup; QPU
    // cost + the managed instance charge over the job's wall-clock.
    const hybridWall = hybridWallClockSec(n, STARTUP_SEC, iterSec);
    const hybridCost = jobTotalCost(provider, instance, n, shots, hybridWall);

    const savedWall = Math.max(0, standaloneWall - hybridWall);
    const addedCost = Math.max(0, hybridCost - standaloneCost);

    const maxWall = Math.max(standaloneWall, hybridWall, 1e-9);
    const maxCost = Math.max(standaloneCost, hybridCost, 1e-9);

    return {
      standaloneWall,
      standaloneCost,
      hybridWall,
      hybridCost,
      savedWall,
      addedCost,
      maxWall,
      maxCost,
    };
  }, [iterations, queueWaitSec, iterSec, provider, instance, shots]);

  // Parse/error early-return happens only AFTER all hooks are called.
  if (!parsed.ok) {
    return <ErrorCard message={parsed.error} />;
  }

  const headerAria = `Standalone tasks take ${formatDuration(
    result.standaloneWall
  )} at ${formatUsd(result.standaloneCost)}; the Hybrid Job takes ${formatDuration(
    result.hybridWall
  )} at ${formatUsd(result.hybridCost)}.`;

  return (
    <WidgetCard
      header={
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
          <EyebrowLabel>Standalone vs Hybrid Job</EyebrowLabel>
          <Chip>{iterations} iter</Chip>
          <Chip>{provider}</Chip>
        </div>
      }
    >
      <div className="flex flex-col gap-6 px-4 py-4">
        <p className="sr-only">{headerAria}</p>

        {/* Controls */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* iterations slider */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={iterId}
              className="font-mono text-xs text-gray-600 dark:text-gray-300"
            >
              iterations
            </label>
            <div className="flex items-center gap-3">
              <input
                id={iterId}
                type="range"
                min={ITER.min}
                max={ITER.max}
                step={1}
                value={iterations}
                onChange={(e) => setIterations(parseInt(e.target.value, 10))}
                className="slider flex-1 focus-ring"
                aria-label="Number of iterations (quantum tasks)"
                aria-valuetext={`${iterations} iterations`}
              />
              <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {iterations}
              </span>
            </div>
          </div>

          {/* queue wait slider */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={queueId}
              className="font-mono text-xs text-gray-600 dark:text-gray-300"
            >
              queue wait / task
            </label>
            <div className="flex items-center gap-3">
              <input
                id={queueId}
                type="range"
                min={QUEUE.min}
                max={QUEUE.max}
                step={1}
                value={queueWaitSec}
                onChange={(e) => setQueueWaitSec(parseFloat(e.target.value))}
                className="slider flex-1 focus-ring"
                aria-label="Illustrative general-queue wait per standalone task, in seconds"
                aria-valuetext={`${queueWaitSec.toFixed(0)} seconds`}
              />
              <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {queueWaitSec.toFixed(0)}s
              </span>
            </div>
          </div>

          {/* iter compute slider */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={iterSecId}
              className="font-mono text-xs text-gray-600 dark:text-gray-300"
            >
              compute / iteration
            </label>
            <div className="flex items-center gap-3">
              <input
                id={iterSecId}
                type="range"
                min={ITERSEC.min}
                max={ITERSEC.max}
                step={0.1}
                value={iterSec}
                onChange={(e) => setIterSec(parseFloat(e.target.value))}
                className="slider flex-1 focus-ring"
                aria-label="Per-iteration quantum compute time, in seconds"
                aria-valuetext={`${iterSec.toFixed(1)} seconds`}
              />
              <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {iterSec.toFixed(1)}s
              </span>
            </div>
          </div>

          {/* provider + instance selects */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={providerId}
                className="font-mono text-xs text-gray-600 dark:text-gray-300"
              >
                provider
              </label>
              <select
                id={providerId}
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                aria-label="Quantum provider (per-shot QPU rates)"
                className="rounded-control border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/50 px-2 py-1.5 font-mono text-xs text-gray-700 dark:text-gray-200 focus-ring"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={instanceId}
                className="font-mono text-xs text-gray-600 dark:text-gray-300"
              >
                instance
              </label>
              <select
                id={instanceId}
                value={instance}
                onChange={(e) => setInstance(e.target.value as InstanceType)}
                aria-label="SageMaker ML instance for the Hybrid Job classical code"
                className="rounded-control border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/50 px-2 py-1.5 font-mono text-xs text-gray-700 dark:text-gray-200 focus-ring"
              >
                {INSTANCE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Compared cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CompareBar
            label="Standalone tasks"
            wallSec={result.standaloneWall}
            cost={result.standaloneCost}
            wallFrac={result.standaloneWall / result.maxWall}
            costFrac={result.standaloneCost / result.maxCost}
            accent={false}
            note="general queue, no instance"
            reduced={reduced}
          />
          <CompareBar
            label="Hybrid Job"
            wallSec={result.hybridWall}
            cost={result.hybridCost}
            wallFrac={result.hybridWall / result.maxWall}
            costFrac={result.hybridCost / result.maxCost}
            accent
            note="priority access + instance"
            reduced={reduced}
          />
        </div>

        {/* Delta line */}
        <p role="status" aria-live="polite" className="font-mono text-sm tabular-nums text-gray-800 dark:text-gray-100">
          priority access saves{" "}
          <span className="font-semibold text-accent dark:text-accent-light">
            {formatDuration(result.savedWall)}
          </span>{" "}
          of wall-clock; the managed instance adds{" "}
          <span className="font-semibold text-accent dark:text-accent-light">
            {formatUsd(result.addedCost)}
          </span>
          .
        </p>

        {/* Honesty notes */}
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          The queue wait is an{" "}
          <span className="font-medium text-gray-600 dark:text-gray-300">
            illustrative estimate
          </span>{" "}
          — real device queue times vary widely with demand. The cost rates are{" "}
          <span className="font-medium text-gray-600 dark:text-gray-300">real</span>{" "}
          Braket per-task / per-shot and SageMaker hourly rates. The teaching point: a
          Hybrid Job trades a small managed-instance charge for a large wall-clock
          reduction via priority access.
        </p>
      </div>
    </WidgetCard>
  );
}
