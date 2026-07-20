"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { Chip, ErrorCard as SharedErrorCard, LabeledSlider, WidgetCard, fieldClass } from "./widget-ui";
import { parseJsonObject, readNumber } from "./parse-utils";
import {
  INSTANCES,
  hybridWallClockSec,
  jobTotalCost,
  qpuCost,
  standaloneWallClockSec,
  type InstanceType,
} from "./hybrid";
import { isPerShot, type Provider } from "./cost";
import { DEVICES } from "./devices";
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

/**
 * The per-shot QPU providers a Hybrid Job can actually target — DERIVED, not
 * hand-listed, from the two catalogs that already own this knowledge: the
 * device table (devices.ts, the fleet a learner can reach) intersected with the
 * per-shot rates in cost.ts. The previous literal list had gone stale against
 * both: it offered Rigetti, which cost.ts/lib.utils.cost price as reference-only
 * because no Rigetti device is dispatchable (devices.test.ts asserts that
 * carve-out), so the picker advertised a backend the platform's own catalog
 * says you cannot submit to. Deriving means the next fleet change moves one
 * file and this select, its chips, and the parse-error string follow.
 */
const PROVIDERS: Provider[] = Array.from(
  new Set(DEVICES.map((d) => d.provider))
).filter(isPerShot);
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
  // Carry the rounded minute into the hour. Without this, any remainder in
  // [3570s, 3599s] rounds to 60 and renders the impossible "1h 60m" (reachable
  // from the widget's own sliders: 10 iterations x (600s queue + 119.9s) = 7199s).
  if (m === 60) return `${h + 1}h`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * USD with sub-cent resolution where two decimals would round a real charge to
 * zero. The delta line's `addedCost` is pure instance charge (the QPU term
 * cancels between the two panels), and ml.m5.large at $0.115/hour needs ~156s
 * of wall-clock to reach one displayed cent — so plain toFixed(2) printed
 * "$0.00" across the entire low-iteration range the GUIDE explicitly teaches.
 * Same reasoning as the sibling qcost widget, which itemizes at 4 decimals.
 */
function formatUsd(v: number): string {
  if (v !== 0 && Math.abs(v) < 0.005) return `$${v.toFixed(4)}`;
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
  const barColor = accent
    ? "color-mix(in oklab, var(--accent) 70%, transparent)"
    : "color-mix(in oklab, var(--accent) 24%, transparent)";

  return (
    <div className="rounded-control border border-(--bd) bg-(--field) px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-caption">
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
        className="mt-1 block h-2.5 w-full rounded-full bg-(--track) overflow-hidden"
      >
        <span
          className="block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(frac * 100).toFixed(2)}%`, background: barColor, transition }}
        />
      </span>
    </div>
  );
}

/**
 * One labeled select. The provider and instance controls were two structurally
 * identical 20-line blocks that each repeated the field chrome inline; this
 * collapses them onto the shared `fieldClass` token (which WS-B7 moved onto the
 * same --bd/--field/--ink tier this widget already used) plus the caller's own
 * sizing, per that token's no-sizing contract.
 */
function SelectField({
  label,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  label: ReactNode;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-mono text-xs text-caption">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={`${fieldClass} px-2 py-1.5 font-mono text-xs`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
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

  const headingId = useId();

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

  return (
    <WidgetCard
      eyebrow="Standalone vs Hybrid Job"
      eyebrowAs="h3"
      eyebrowId={headingId}
      chips={
        <>
          <Chip>{iterations} iter</Chip>
          {/* shots drives ~99.6% of every dollar on screen at the GUIDE's
              1000-shot default, so it cannot stay an invisible config value. */}
          <Chip>{shots} shots</Chip>
          <Chip>{provider}</Chip>
        </>
      }
    >
      <div className="flex flex-col gap-6 px-4 py-4">
        {/* Screen-reader exposure is deliberately one layer per level: the
            visible label/value text carries each figure, each bar carries a
            role="img" name, and the delta line below is the single live region.
            A card-level sr-only summary and a per-panel one used to restate the
            same four numbers, so every figure was announced three to four
            times before the sentence that carries the teaching point. */}

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
            labelClassName="font-mono text-xs text-caption"
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
            labelClassName="font-mono text-xs text-caption"
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
            labelClassName="font-mono text-xs text-caption"
            valueWidth="w-12"
          />

          {/* provider + instance selects */}
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="provider"
              value={provider}
              options={PROVIDERS}
              onChange={(v) => setProvider(v as Provider)}
              ariaLabel="Quantum provider (per-shot QPU rates)"
            />
            <SelectField
              label="instance"
              value={instance}
              options={INSTANCE_KEYS}
              onChange={(v) => setInstance(v as InstanceType)}
              ariaLabel="SageMaker ML instance for the Hybrid Job classical code"
            />
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
            // Naming the startup here is what makes the legitimate
            // "hybrid is slower" state (queue wait at 0, or very few
            // iterations) self-explanatory rather than looking broken.
            note={`priority access, ${STARTUP_SEC}s startup + instance`}
            reduced={reduced}
          />
        </div>

        {/* Delta line */}
        <p role="status" aria-live="polite" className="font-mono text-sm tabular-nums text-(--ink)">
          priority access saves{" "}
          <span className="font-semibold text-accent-dark dark:text-accent-light">
            {formatDuration(result.savedWall)}
          </span>{" "}
          of wall-clock; the managed instance adds{" "}
          <span className="font-semibold text-accent-dark dark:text-accent-light">
            {formatUsd(result.addedCost)}
          </span>
          .
        </p>

        {/* Honesty notes */}
        <p className="text-xs leading-relaxed text-caption">
          Two inputs are{" "}
          <span className="font-medium text-(--ink)">illustrative</span>: the
          queue wait (real device queue times vary widely with demand) and the
          one-time {STARTUP_SEC}s container startup this model assumes for the
          Hybrid Job — that startup is what sets the break-even, so a short run
          can legitimately finish sooner standalone. The QPU per-task /
          per-shot rates are{" "}
          <span className="font-medium text-(--ink)">Braket&apos;s published</span>{" "}
          rates; the ML-instance hourly rates are representative on-demand prices.
          The teaching point: a Hybrid Job trades a small managed-instance charge
          for a large wall-clock reduction via priority access.
        </p>
      </div>
    </WidgetCard>
  );
}
