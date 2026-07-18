"use client";

import { useId, useMemo, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, EyebrowLabel, LabeledSlider, WidgetCard } from "./widget-ui";
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
    <div className="rounded-control border border-(--bd) bg-(--field) px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-(--mut)">
          {label}
        </span>
        <span className="text-[11px] text-caption">{note}</span>
      </div>

      <SubBar
        title="wall-clock"
        valueText={formatDuration(wallSec)}
        frac={wallFrac}
        ariaLabel={`${label} wall-clock bar: ${formatDuration(wallSec)}.`}
        barColor={barColor}
        transition={transition}
      />
      <SubBar
        title="total cost"
        valueText={formatUsd(cost)}
        frac={costFrac}
        ariaLabel={`${label} cost bar: ${formatUsd(cost)}.`}
        barColor={barColor}
        transition={transition}
        className="mt-2.5"
      />

      <p className="sr-only">{ariaLabel}</p>
    </div>
  );
}

/**
 * One stacked label-above sub-bar of the compare panel. Not the shared Bar:
 * that contract is a single |label⟩ row with a class-driven fill; this one is
 * inline-styled (color-mix background + the JS transition override that
 * reduced-motion needs for style-driven widths).
 */
function SubBar({
  title,
  valueText,
  frac,
  ariaLabel,
  barColor,
  transition,
  className = "mt-2",
}: {
  title: string;
  valueText: string;
  frac: number;
  ariaLabel: string;
  barColor: string;
  transition: string | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-caption">{title}</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-(--ink)">
          {valueText}
        </span>
      </div>
      <span
        role="img"
        aria-label={ariaLabel}
        className="mt-1 block h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden"
      >
        <span
          className="block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(frac * 100).toFixed(2)}%`, background: barColor, transition }}
        />
      </span>
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
        <div className="flex flex-wrap items-center gap-2 border-b border-(--bd) px-4 py-2">
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
          <LabeledSlider
            labelAbove
            label="iterations"
            value={iterations}
            min={ITER.min}
            max={ITER.max}
            step={1}
            parse={(s) => parseInt(s, 10)}
            onChange={setIterations}
            ariaLabel="Number of iterations (quantum tasks)"
            ariaValueText={`${iterations} iterations`}
            display={iterations}
            rowClassName="flex flex-col gap-1"
            labelClassName="font-mono text-xs text-(--mut)"
            valueWidth="w-12"
          />

          {/* queue wait slider */}
          <LabeledSlider
            labelAbove
            label="queue wait / task"
            value={queueWaitSec}
            min={QUEUE.min}
            max={QUEUE.max}
            step={1}
            onChange={setQueueWaitSec}
            ariaLabel="Illustrative general-queue wait per standalone task, in seconds"
            ariaValueText={`${queueWaitSec.toFixed(0)} seconds`}
            display={`${queueWaitSec.toFixed(0)}s`}
            rowClassName="flex flex-col gap-1"
            labelClassName="font-mono text-xs text-(--mut)"
            valueWidth="w-12"
          />

          {/* iter compute slider */}
          <LabeledSlider
            labelAbove
            label="compute / iteration"
            value={iterSec}
            min={ITERSEC.min}
            max={ITERSEC.max}
            step={0.1}
            onChange={setIterSec}
            ariaLabel="Per-iteration quantum compute time, in seconds"
            ariaValueText={`${iterSec.toFixed(1)} seconds`}
            display={`${iterSec.toFixed(1)}s`}
            rowClassName="flex flex-col gap-1"
            labelClassName="font-mono text-xs text-(--mut)"
            valueWidth="w-12"
          />

          {/* provider + instance selects */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={providerId}
                className="font-mono text-xs text-(--mut)"
              >
                provider
              </label>
              <select
                id={providerId}
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                aria-label="Quantum provider (per-shot QPU rates)"
                className="rounded-control border border-(--bd) bg-(--field) px-2 py-1.5 font-mono text-xs text-(--mut) focus-ring"
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
                className="font-mono text-xs text-(--mut)"
              >
                instance
              </label>
              <select
                id={instanceId}
                value={instance}
                onChange={(e) => setInstance(e.target.value as InstanceType)}
                aria-label="SageMaker ML instance for the Hybrid Job classical code"
                className="rounded-control border border-(--bd) bg-(--field) px-2 py-1.5 font-mono text-xs text-(--mut) focus-ring"
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
        <p role="status" aria-live="polite" className="font-mono text-sm tabular-nums text-(--ink)">
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
        <p className="text-xs leading-relaxed text-caption">
          The queue wait is an{" "}
          <span className="font-medium text-(--mut)">
            illustrative estimate
          </span>{" "}
          — real device queue times vary widely with demand. The cost rates are{" "}
          <span className="font-medium text-(--mut)">real</span>{" "}
          Braket per-task / per-shot and SageMaker hourly rates. The teaching point: a
          Hybrid Job trades a small managed-instance charge for a large wall-clock
          reduction via priority access.
        </p>
      </div>
    </WidgetCard>
  );
}
