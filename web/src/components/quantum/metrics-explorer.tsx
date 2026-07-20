"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, LiveStatus, WidgetCard, primaryActionClass, secondaryActionClass } from "./widget-ui";
import { extent, linearScale, linePath, plotInner, type Plot } from "./chart-utils";
import { H2 as H } from "./h2-data";
import {
  h2OneQubit,
  oneQubitHamiltonian,
  vqeGradientDescent,
} from "./chemistry";
import { usePrefersReducedMotion } from "./use-display-caps";
import { parseJsonObject } from "./parse-utils";
import { formatHartree, formatAngstrom, hartreeSR } from "./format";

/**
 * Inline live-metrics dashboard rendered from a ```qmetrics fenced block in the
 * hybrid-jobs GUIDE. Frames a REAL single-qubit VQE optimization (the verified
 * chemistry kernel from module 05) as CloudWatch-style job monitoring: it runs
 * vqeGradientDescent on the tapered H2 Hamiltonian at bond length R and plots the
 * per-iteration energy trace as a metric line (iteration on x, energy in Ha on
 * y), with a dashed convergence-tolerance line and a current-energy readout.
 * The Stream button reveals points iteration-by-iteration via setTimeout
 * (reduced motion shows the full curve at once); Reset rewinds. The convergence
 * is genuine VQE — only the presentation is "what log_metric -> CloudWatch shows
 * while a Hybrid Job runs". Pure client, static-export safe, no AWS / network.
 *
 * NAMING (this was wrong and is load-bearing): the dashed line is an ENERGY
 * target, so it is a convergence `tol`, NOT Braket's `stopping_condition`.
 * braket.jobs.config.StoppingCondition carries exactly one field —
 * maxRuntimeInSeconds — i.e. a wall-clock cap with no metric-threshold form, so
 * a learner who copied the old label would try to pass an energy to
 * stopping_condition and fail. Module 06's own notebook 03 already teaches the
 * correct split: an in-loop `tol` check returns early, and
 * stopping_condition={"maxRuntimeInSeconds": 600} is the separate backstop.
 *
 * Fence body (optional): { "R": 0.74, "threshold": -1.13 }. Empty defaults R to
 * the equilibrium bond length and the tol to the equilibrium FCI + 0.02 Ha.
 */

const PLOT: Plot = { w: 320, h: 200, padL: 44, padR: 12, padT: 14, padB: 28 };
const { innerW, innerH } = plotInner(PLOT);
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
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj === null) {
    return { ok: true, R: defaultR, threshold: defaultThreshold };
  }
  const obj = base.obj;

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
  // Reset zeroes `shown`, which used to empty the live region rather than
  // update it — and emptying a polite region announces nothing, so the rewind
  // was silent to AT. This flag gives Reset its own one-line announcement while
  // keeping the initial mount silent.
  const [didReset, setDidReset] = useState(false);
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
    const { min: eMin, max: eMax } = extent(history);
    return { history, eMin, eMax };
  }, [parsed]);

  // Put the interaction state back to 'ready' whenever the run identity
  // changes. Tearing down only the timer (below) left `streaming` true with a
  // dead timer chain, and nothing could ever set it false again: the Stream
  // button stuck on "Streaming…" and the phase chip on "running", a dead end
  // with no exit but Reset. This is React's documented adjust-state-during-
  // render pattern rather than an effect, so no cascading render is queued.
  const [runId, setRunId] = useState(run);
  if (run !== runId) {
    setRunId(run);
    setStreaming(false);
    setShown(0);
    setDidReset(false);
  }

  // Clear any pending stream timer on unmount or when the run changes.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [run]);

  // Per-run geometry: the scales and the full-history preview path are
  // invariant across streaming ticks — without this memo the preview curve
  // (and both scales) re-derived on every STREAM_MS setShown re-render.
  const geom = useMemo(() => {
    if (!run) return null;
    const { history, eMin, eMax } = run;
    const total = history.length;
    const ePad = (eMax - eMin) * 0.08 || 0.01;
    const yLo = eMin - ePad;
    const yHi = eMax + ePad;
    // The 1e-9 span floor is LIVE, not defensive: START_THETA can sit on a local
    // maximum of E(theta) (R near 1.82), collapsing the whole history to ~1e-16
    // float noise — the floor renders that as the flat line it physically is
    // instead of amplifying noise to full plot height. ePad's `|| 0.01` only
    // catches eMax === eMin exactly, not a subnormal-but-nonzero span.
    const ySpan = Math.max(1e-9, yHi - yLo);
    const sxScale = linearScale(0, total - 1, PLOT.padL, PLOT.padL + innerW);
    const sx = (i: number) => (total <= 1 ? PLOT.padL : sxScale(i));
    const sy = (e: number) => PLOT.padT + ((yHi - e) / ySpan) * innerH;
    const previewPath = linePath(history.map((e, i) => ({ x: sx(i), y: sy(e) })));
    return { sx, sy, previewPath, yLo, yHi };
  }, [run]);

  // The parse/error early-return happens only AFTER all hooks are declared.
  if (!parsed.ok) {
    return <ErrorCard message={parsed.error} />;
  }
  // Pure narrowing for TypeScript: `run` is null only when !parsed.ok and
  // `geom` only when !run, so both are non-null here. This used to render an
  // ErrorCard reading "qmetrics error: no run" — a compiler artifact dressed up
  // as a user-facing failure mode that could never actually occur.
  if (!run || !geom) return null;

  const { history } = run;
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
    // restarting the run from the first iteration). This guard is exactly
    // co-extensive with `streaming`, which is why the button no longer needs a
    // `disabled` attribute — and why the stopStream() that used to sit on the
    // next line was dead: past this return, timerRef.current is provably null.
    if (timerRef.current !== null) return;
    setDidReset(false);
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
    setDidReset(true);
  };

  const { sx, sy, previewPath, yLo, yHi } = geom;

  const started = shown > 0;
  const visible = history.slice(0, Math.max(0, shown));
  const visiblePath = linePath(visible.map((e, i) => ({ x: sx(i), y: sy(e) })));

  const lastIndex = visible.length > 0 ? visible.length - 1 : 0;
  const lastEnergy = visible.length > 0 ? visible[lastIndex] : history[0];
  const thresholdY = Math.max(PLOT.padT, Math.min(PLOT.h - PLOT.padB, sy(threshold)));
  const belowThreshold = started && lastEnergy <= threshold;
  // "unmet" is reachable only after a full run finishes above the tol — the
  // Stream button cannot pause and Reset returns to "ready" — so the old
  // "stopped" literal named a halt that never happened. It renders as the
  // spelled-out mirror of "tol met", matching the announcement below.
  const phase = streaming ? "running" : started ? (belowThreshold ? "met" : "unmet") : "ready";
  const phaseLabel =
    phase === "met" ? "tol met" : phase === "unmet" ? "tol not met" : phase;

  const streamStatus = streaming
    ? `Streaming ${total} iterations.`
    : shown >= total && shown > 0
      ? `Converged to ${hartreeSR(lastEnergy)} at iteration ${lastIndex}; convergence tol ${belowThreshold ? "met" : "not met"}.`
      : didReset
        ? "Reset; not started."
        : "";

  const plotAria =
    `Live VQE convergence metric. Iteration from 0 to ${total - 1} on the x axis, ` +
    `energy from ${hartreeSR(yHi, 2)} to ${hartreeSR(yLo, 2)} on the y axis. ` +
    `A dashed convergence tolerance sits at ${hartreeSR(threshold, 3)}. ` +
    (started
      ? `At iteration ${lastIndex} the energy is ${hartreeSR(lastEnergy)}.`
      : `Not started; the full curve is previewed.`);

  return (
    <WidgetCard
      eyebrow="Live job metrics"
      eyebrowAs="h3"
      eyebrowId={headingId}
      chips={
        <>
          <Chip>R = {formatAngstrom(parsed.R)}</Chip>
          <Chip>metric: energy</Chip>
          <span
            className={
              phase === "met"
                ? "rounded-chip bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[11px] font-mono text-emerald-700 dark:text-emerald-300"
                : phase === "running"
                  ? "rounded-chip bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[11px] font-mono text-amber-700 dark:text-amber-300"
                  : "rounded-chip border border-(--bd) bg-(--field) px-2 py-0.5 text-[11px] font-mono text-caption"
            }
          >
            {phaseLabel}
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Metric chart */}
        <div className="min-w-0 flex-1">
          {/* The card's eyebrow is now the real h3 (eyebrowAs/eyebrowId), so the
              extra sr-only heading that used to live here would duplicate both
              the heading and its id. */}
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

            {/* convergence tolerance line (an ENERGY target — see the naming
                note at the top of this file; it is not stopping_condition) */}
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
              convergence tol
            </text>

            {/* faint preview when idle */}
            {!started && previewPath && (
              <path
                d={previewPath}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.2}
                strokeDasharray="3 4"
                strokeLinejoin="round"
                className="text-gray-300 dark:text-gray-700"
                aria-hidden="true"
              />
            )}

            {/* metric line */}
            {visiblePath && (
              <path
                data-testid="metric-line"
                d={visiblePath}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="text-accent-dark dark:text-accent-light"
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
          <LiveStatus>{streamStatus}</LiveStatus>
          <dl className="space-y-1.5 font-mono text-xs tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-caption">iteration</dt>
              <dd className="text-(--ink)">
                {lastIndex} / {total - 1}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-accent-dark dark:text-accent-light">energy</dt>
              <dd className="text-(--ink)">
                {formatHartree(lastEnergy)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-caption">tol</dt>
              <dd className="text-(--ink)">
                {formatHartree(threshold)}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {/* Deliberately NOT `disabled` while streaming: the browser drops
                focus to <body> when the focused element disables itself and
                never restores it, so a keyboard user's next Tab restarted from
                the top of the document. The timerRef guard in onStream already
                makes re-clicks no-ops, so `disabled` only ever cost focus.
                aria-disabled keeps AT informed of the unavailable state. */}
            <button
              type="button"
              onClick={onStream}
              aria-disabled={streaming || undefined}
              aria-busy={streaming}
              className={`${primaryActionClass}${streaming ? " opacity-60" : ""}`}
            >
              {streaming ? "Streaming…" : "Stream"}
            </button>
            <button
              type="button"
              onClick={onReset}
              className={secondaryActionClass}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="border-t border-(--bd) px-4 py-3">
        <p className="text-xs leading-relaxed text-caption">
          This is what <span className="font-mono">log_metric</span> &rarr;
          CloudWatch shows while a Hybrid Job runs: each point is one optimizer
          iteration the managed device reports back, and the dashed line is the
          convergence <span className="font-mono">tol</span> your algorithm
          script checks each iteration to return early. That halt is your code —
          Braket&apos;s{" "}
          <span className="font-mono">stopping_condition</span> is a separate
          wall-clock backstop and takes only{" "}
          <span className="font-mono">maxRuntimeInSeconds</span>.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-caption">
          Honesty note: the curve is a genuine single-qubit VQE optimization from
          the verified chemistry kernel (module 05) &mdash; real
          parameter-shift gradient descent on the tapered H&#8322; Hamiltonian.
          Only the framing as job monitoring is illustrative; no AWS call is made.
        </p>
      </div>
    </WidgetCard>
  );
}
