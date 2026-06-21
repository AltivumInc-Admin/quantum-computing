"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ErrorCard as SharedErrorCard } from "./widget-ui";
import { H2 as H } from "./h2-data";
import {
  h2OneQubit,
  oneQubitHamiltonian,
  vqeGradientDescent,
} from "./chemistry";
import { usePrefersReducedMotion } from "./use-display-caps";

/**
 * Inline live-metrics dashboard rendered from a ```qmetrics fenced block in the
 * hybrid-jobs GUIDE. Frames a REAL single-qubit VQE optimization (the verified
 * chemistry kernel from module 05) as CloudWatch-style job monitoring: it runs
 * vqeGradientDescent on the tapered H2 Hamiltonian at bond length R and plots the
 * per-iteration energy trace as a metric line (iteration on x, energy in Ha on
 * y), with a dashed "stopping_condition" threshold line and a current-energy
 * readout. The Stream button reveals points iteration-by-iteration via setTimeout
 * (reduced motion shows the full curve at once); Reset rewinds. The convergence
 * is genuine VQE — only the presentation is "what log_metric -> CloudWatch shows
 * while a Hybrid Job runs". Pure client, static-export safe, no AWS / network.
 *
 * Fence body (optional): { "R": 0.74, "threshold": -1.13 }. Empty defaults R to
 * the equilibrium bond length and the threshold to the equilibrium FCI + 0.02 Ha.
 */

const PLOT = { w: 320, h: 200, padL: 44, padR: 12, padT: 14, padB: 28 };
const START_THETA = 1.0;
const LR = 0.3;
const STEPS = 40;
const STREAM_MS = 60; // delay between revealed iterations

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

type ParseResult =
  | { ok: true; R: number; threshold: number }
  | { ok: false; error: string };

function clampR(R: number): number {
  const lo = H.points[0].R;
  const hi = H.points[H.points.length - 1].R;
  return Math.min(hi, Math.max(lo, R));
}

function parseSource(source: string): ParseResult {
  const defaultR = H.equilibrium.R;
  const defaultThreshold = H.equilibrium.fci + 0.02;
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return { ok: true, R: defaultR, threshold: defaultThreshold };
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

  let R = defaultR;
  const rawR = obj["R"];
  if (rawR !== undefined) {
    if (typeof rawR !== "number" || !Number.isFinite(rawR)) {
      return { ok: false, error: '"R" must be a finite number' };
    }
    R = clampR(rawR);
  }

  let threshold = defaultThreshold;
  const rawThreshold = obj["threshold"];
  if (rawThreshold !== undefined) {
    if (typeof rawThreshold !== "number" || !Number.isFinite(rawThreshold)) {
      return { ok: false, error: '"threshold" must be a finite number' };
    }
    threshold = rawThreshold;
  }

  return { ok: true, R, threshold };
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="qmetrics" message={message} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MetricsExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);
  const reducedMotion = usePrefersReducedMotion();

  const headingId = useId();
  const [shown, setShown] = useState(0); // number of iterations revealed
  const [streaming, setStreaming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run the REAL VQE optimization once per parsed R. history[i] is the energy at
  // iteration i; the chemistry kernel is the same one verified in module 05.
  const run = useMemo(() => {
    if (!parsed.ok) return null;
    const { c0, cz, cx } = h2OneQubit(parsed.R, H.points);
    const H_ = oneQubitHamiltonian(c0, cz, cx);
    const { history } = vqeGradientDescent(H_, [START_THETA], LR, STEPS);
    // Seed the y-extent from the DATA, not the user threshold — an out-of-band
    // threshold must not squeeze the real convergence curve. The threshold LINE
    // is kept on-canvas by clamping it to the plot band (see thresholdY below).
    let eMin = history[0];
    let eMax = history[0];
    for (const e of history) {
      if (e < eMin) eMin = e;
      if (e > eMax) eMax = e;
    }
    return { history, eMin, eMax };
  }, [parsed]);

  // Clear any pending stream timer on unmount or when the run changes.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [run]);

  // The parse/error early-return happens only AFTER all hooks are declared.
  if (!parsed.ok || !run) {
    return <ErrorCard message={parsed.ok ? "no run" : parsed.error} />;
  }

  const { history, eMin, eMax } = run;
  const { threshold } = parsed;
  const total = history.length;

  const stopStream = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onStream = () => {
    // Ignore re-clicks while a stream is already in flight (was silently
    // restarting the run from the first iteration).
    if (timerRef.current !== null) return;
    stopStream();
    if (reducedMotion) {
      setShown(total);
      return;
    }
    // Reveal points iteration-by-iteration. Start from the first sample so the
    // line begins drawing immediately, then schedule the rest.
    setStreaming(true);
    setShown(1);
    let i = 1;
    const tick = () => {
      i += 1;
      setShown(Math.min(i, total));
      if (i < total) {
        timerRef.current = setTimeout(tick, STREAM_MS);
      } else {
        timerRef.current = null;
        setStreaming(false);
      }
    };
    timerRef.current = setTimeout(tick, STREAM_MS);
  };

  const onReset = () => {
    stopStream();
    setStreaming(false);
    setShown(0);
  };

  // Plot geometry: iteration on x, energy (Ha) on y (lower energy = lower line).
  const ePad = (eMax - eMin) * 0.08 || 0.01;
  const yLo = eMin - ePad;
  const yHi = eMax + ePad;
  const span = Math.max(1e-9, yHi - yLo);
  const innerW = PLOT.w - PLOT.padL - PLOT.padR;
  const innerH = PLOT.h - PLOT.padT - PLOT.padB;
  const sx = (i: number) =>
    PLOT.padL + (total <= 1 ? 0 : (i / (total - 1)) * innerW);
  const sy = (e: number) => PLOT.padT + ((yHi - e) / span) * innerH;

  const visible = history.slice(0, Math.max(0, shown));
  const linePath = visible
    .map((e, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(2)},${sy(e).toFixed(2)}`)
    .join(" ");

  const lastIndex = visible.length > 0 ? visible.length - 1 : 0;
  const lastEnergy = visible.length > 0 ? visible[lastIndex] : history[0];
  // Pin the dashed threshold line to the plot band so an out-of-band threshold
  // sits on the edge rather than driving the data scale.
  const thresholdY = Math.max(PLOT.padT, Math.min(PLOT.h - PLOT.padB, sy(threshold)));
  const belowThreshold = visible.length > 0 && lastEnergy <= threshold;

  // One concise live-region update on stream start / finish (not per tick): the
  // text only changes at those two transitions, so a polite region announces
  // twice rather than ~40 times during the stream.
  const streamStatus = streaming
    ? `Streaming ${total} iterations.`
    : shown >= total && shown > 0
      ? `Converged to ${lastEnergy.toFixed(4)} hartree at iteration ${lastIndex}; stopping_condition ${belowThreshold ? "met" : "not met"}.`
      : "";

  const plotAria =
    `Live VQE convergence metric. Iteration from 0 to ${total - 1} on the x axis, ` +
    `energy from ${yHi.toFixed(2)} to ${yLo.toFixed(2)} hartree on the y axis. ` +
    `A dashed stopping_condition threshold sits at ${threshold.toFixed(3)} hartree. ` +
    (visible.length > 0
      ? `At iteration ${lastIndex} the energy is ${lastEnergy.toFixed(4)} hartree.`
      : `No iterations streamed yet.`);

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Live job metrics
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          R = {parsed.R.toFixed(2)} &#8491;
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          metric: energy
        </span>
        <span
          className={
            belowThreshold
              ? "rounded-chip bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[11px] font-mono text-emerald-700 dark:text-emerald-300"
              : "rounded-chip bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[11px] font-mono text-amber-700 dark:text-amber-300"
          }
        >
          {belowThreshold ? "stopping_condition met" : "running"}
        </span>
      </div>

      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Metric chart */}
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="sr-only">
            Live job metrics: VQE energy per iteration
          </h3>
          <svg
            viewBox={`0 0 ${PLOT.w} ${PLOT.h}`}
            width={PLOT.w}
            height={PLOT.h}
            role="img"
            aria-label={plotAria}
            className="w-full max-w-[360px] mx-auto block"
          >
            {/* axes */}
            <line
              x1={PLOT.padL}
              y1={PLOT.padT}
              x2={PLOT.padL}
              y2={PLOT.h - PLOT.padB}
              stroke="currentColor"
              strokeWidth={1}
              className="text-gray-300 dark:text-gray-600"
            />
            <line
              x1={PLOT.padL}
              y1={PLOT.h - PLOT.padB}
              x2={PLOT.w - PLOT.padR}
              y2={PLOT.h - PLOT.padB}
              stroke="currentColor"
              strokeWidth={1}
              className="text-gray-300 dark:text-gray-600"
            />

            {/* stopping_condition threshold line */}
            <line
              x1={PLOT.padL}
              y1={thresholdY}
              x2={PLOT.w - PLOT.padR}
              y2={thresholdY}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="4 3"
              className="text-amber-500 dark:text-amber-400"
            />
            <text
              x={PLOT.w - PLOT.padR}
              y={thresholdY - 3}
              textAnchor="end"
              fontSize={8}
              className="fill-amber-600 dark:fill-amber-400 font-mono"
              aria-hidden="true"
            >
              stopping_condition
            </text>

            {/* metric line */}
            {linePath && (
              <path
                data-testid="metric-line"
                d={linePath}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="text-accent dark:text-accent-light"
              />
            )}

            {/* current / last datapoint */}
            {visible.length > 0 && (
              <circle
                cx={sx(lastIndex)}
                cy={sy(lastEnergy)}
                r={3}
                className="fill-accent dark:fill-accent-light"
              />
            )}

            {/* axis labels (decorative) */}
            <text
              x={PLOT.padL + innerW / 2}
              y={PLOT.h - 6}
              textAnchor="middle"
              fontSize={9}
              className="fill-gray-500 dark:fill-gray-400 font-mono"
              aria-hidden="true"
            >
              iteration
            </text>
            <text
              x={11}
              y={PLOT.padT + innerH / 2}
              textAnchor="middle"
              fontSize={9}
              transform={`rotate(-90 11 ${PLOT.padT + innerH / 2})`}
              className="fill-gray-500 dark:fill-gray-400 font-mono"
              aria-hidden="true"
            >
              energy (Ha)
            </text>
          </svg>
        </div>

        {/* Readout + controls */}
        <div className="min-w-0 sm:w-56 sm:shrink-0">
          <p className="sr-only" role="status" aria-live="polite">
            {streamStatus}
          </p>
          <dl className="space-y-1.5 font-mono text-xs tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-gray-500 dark:text-gray-400">iteration</dt>
              <dd className="text-gray-800 dark:text-gray-100">
                {lastIndex} / {total - 1}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-accent dark:text-accent-light">energy</dt>
              <dd className="text-gray-800 dark:text-gray-100">
                {lastEnergy.toFixed(4)} Ha
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-gray-500 dark:text-gray-400">threshold</dt>
              <dd className="text-gray-800 dark:text-gray-100">
                {threshold.toFixed(4)} Ha
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onStream}
              aria-busy={streaming}
              className="rounded-control bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-(--shadow-resting) hover:bg-accent-dark focus-ring transition-colors motion-reduce:transition-none"
            >
              Stream
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus-ring transition-colors motion-reduce:transition-none"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
          This is what <span className="font-mono">log_metric</span> &rarr;
          CloudWatch shows while a Hybrid Job runs: each point is one optimizer
          iteration the managed device reports back, and the dashed line is the
          job&apos;s stopping_condition.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
          Honesty note: the curve is a genuine single-qubit VQE optimization from
          the verified chemistry kernel (module 05) &mdash; real
          parameter-shift gradient descent on the tapered H&#8322; Hamiltonian.
          Only the framing as job monitoring is illustrative; no AWS call is made.
        </p>
      </div>
    </div>
  );
}
