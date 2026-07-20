"use client";

import { useMemo, useState } from "react";
import { Chip, ErrorCard, WidgetCard, primaryActionClass, secondaryActionClass } from "./widget-ui";
import { linearScale, linePath } from "./chart-utils";
import {
  accuracyOf,
  initTheta,
  makeBlobs,
  mseLoss,
  trainStep,
  vqcOutput,
  type Point,
} from "./vqc";
import { parseJsonObject } from "./parse-utils";
import { formatPercent } from "./format";

/**
 * Inline variational-quantum-classifier trainer rendered from a ```qvqc fenced
 * block in a GUIDE. Parses `{ "dataset": "blobs" }` defensively, builds two
 * separable Gaussian blobs, and trains a 2-qubit angle-encoded PQC live in the
 * browser via full-batch parameter-shift gradient descent (vqc.ts). The Train
 * button runs a burst of steps synchronously so the decision boundary sharpens
 * and the loss curve descends as the learner watches; Reset re-seeds theta.
 * Pure client, static-export safe, no AWS.
 *
 * Shape: `VqcTrainer` only parses; `VqcView` owns every hook with an
 * already-validated config, which is what lets `loss`/`acc` be memoized rather
 * than recomputed (30 forward passes each) on every render.
 */

const GRID = 32; // decision-boundary resolution
// Minimum drawn feature span. The window is widened to fit the data (see
// `plane` below) — makeBlobs clips to [-pi, pi], more than twice this, and with
// the shipped seed one of the 30 points lands at x0 = 1.630, outside the fixed
// [-1.6, 1.6] window this constant used to impose. That point was clipped to a
// sliver at the SVG edge while still being counted in the accuracy readout, so
// the picture and the number were drawn from different populations.
const MIN_PLANE = 3.2;
const POINT_R = 0.7; // scatter marker radius, in viewBox units
const POINT_MARGIN = 0.5; // breathing room past the marker edge, in viewBox units
const STEPS_PER_TRAIN = 40;
const LR = 0.3;
const LOSS_W = 200;
const LOSS_H = 90;
const MAX_HISTORY = 240;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type ParseResult = { ok: true; dataset: "blobs" } | { ok: false; error: string };

function parseSource(source: string): ParseResult {
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj === null) return { ok: true, dataset: "blobs" };
  const obj = base.obj;
  const ds = obj["dataset"];
  if (ds !== undefined && ds !== "blobs") {
    return { ok: false, error: `unknown dataset "${String(ds)}"` };
  }
  return { ok: true, dataset: "blobs" };
}

/**
 * The feature span to draw so every point of `data` lands fully inside the
 * viewBox, marker radius included. Solving cx + r + margin <= GRID for the plane
 * width gives plane >= max|v| / (0.5 - (r + margin)/GRID); the max with
 * MIN_PLANE keeps the framing stable (and non-degenerate) for datasets that
 * already fit.
 */
function planeFor(data: Point[]): number {
  const maxAbs = data.reduce(
    (m, d) => Math.max(m, Math.abs(d.x[0]), Math.abs(d.x[1])),
    0
  );
  return Math.max(MIN_PLANE, maxAbs / (0.5 - (POINT_R + POINT_MARGIN) / GRID));
}

// ---------------------------------------------------------------------------
// Decision-boundary + scatter SVG
// ---------------------------------------------------------------------------

/** g in [0, GRID-1] -> feature coordinate in [-plane/2, +plane/2]. */
function planeToCell(g: number, plane: number): number {
  return -plane / 2 + (plane * (g + 0.5)) / GRID;
}

/** feature coord in [-plane/2, plane/2] -> [0, GRID] viewBox units. */
function featureToSvg(v: number, plane: number): number {
  return ((v + plane / 2) / plane) * GRID;
}

function BoundaryPlot({
  data,
  theta,
  bias,
  plane,
}: {
  data: Point[];
  theta: number[];
  bias: number;
  plane: number;
}) {
  const cells = useMemo(() => {
    const out: { gx: number; gy: number; positive: boolean }[] = [];
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const x0 = planeToCell(gx, plane);
        const x1 = planeToCell(gy, plane);
        out.push({ gx, gy, positive: vqcOutput([x0, x1], theta, bias) >= 0 });
      }
    }
    return out;
  }, [theta, bias, plane]);

  return (
    <svg
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={GRID * 6}
      height={GRID * 6}
      role="img"
      aria-label={`VQC decision boundary over the feature plane with all ${data.length} training points scattered on top.`}
      className="w-full max-w-[200px] mx-auto block rounded-control"
    >
      {cells.map((c) => (
        <rect
          key={`${c.gx}-${c.gy}`}
          x={c.gx}
          y={GRID - 1 - c.gy}
          width={1}
          height={1}
          fill={
            c.positive
              ? "color-mix(in oklab, var(--accent) 26%, transparent)"
              : "color-mix(in oklab, var(--accent) 4%, transparent)"
          }
        />
      ))}
      {data.map((d, i) => (
        <circle
          key={i}
          cx={featureToSvg(d.x[0], plane)}
          cy={GRID - featureToSvg(d.x[1], plane)}
          r={POINT_R}
          className={
            d.y === 1
              ? "fill-accent dark:fill-accent-light"
              : "fill-gray-700 dark:fill-gray-300"
          }
          stroke="currentColor"
          strokeWidth={0.18}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Loss curve SVG
// ---------------------------------------------------------------------------

/**
 * The y-domain is the run's ALL-TIME maximum loss, not the extent of whatever
 * is currently inside the 240-sample window. Auto-fitting the window inverted
 * the plot's meaning: once the initial high loss scrolled out (from the 7th
 * Train click), the domain collapsed onto the converged residual and a fully
 * trained model's flat loss re-scaled to y = 0 — the TOP edge of the box, which
 * reads as "loss is at maximum, nothing is being learned", the opposite of what
 * the caption promises. Anchoring to `max` keeps a converged run pinned flat at
 * the bottom, and the domain ceiling is printed so the reading is falsifiable.
 */
function LossCurve({
  history,
  max,
  step,
}: {
  history: number[];
  max: number;
  step: number;
}) {
  const path = useMemo(() => {
    if (history.length < 2) return "";
    // Ceiling at least 1e-9 so the domain is never degenerate; the floor is 0
    // (MSE is non-negative) so the baseline means the same thing at every scale.
    const toX = linearScale(0, history.length - 1, 0, LOSS_W);
    const toY = linearScale(0, Math.max(max, 1e-9), LOSS_H, 0);
    return linePath(history.map((v, i) => ({ x: toX(i), y: toY(v) })));
  }, [history, max]);

  // history.length - 1 saturates at MAX_HISTORY - 1 while `step` keeps climbing,
  // so past the truncation point the curve is a trailing window of a longer run
  // and the label says so instead of reporting a frozen 239.
  const shown = Math.max(0, history.length - 1);
  const label =
    shown < step
      ? `Mean-squared-error loss over the last ${shown} of ${step} training steps.`
      : `Mean-squared-error loss over ${shown} training steps.`;

  return (
    <svg
      viewBox={`0 0 ${LOSS_W} ${LOSS_H}`}
      width={LOSS_W}
      height={LOSS_H}
      role="img"
      aria-label={label}
      className="w-full max-w-[200px] mx-auto block"
    >
      <rect
        x={0}
        y={0}
        width={LOSS_W}
        height={LOSS_H}
        fill="var(--track)"
        rx={4}
      />
      {path && (
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
          className="text-accent-dark dark:text-accent-light"
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VqcTrainer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);
  if (!parsed.ok) {
    return <ErrorCard label="vqc" message={parsed.error} />;
  }
  return <VqcView />;
}

function VqcView() {
  const data = useMemo(() => makeBlobs(30, 1), []);
  const plane = useMemo(() => planeFor(data), [data]);
  const [theta, setTheta] = useState<number[]>(() => initTheta());
  const [bias, setBias] = useState(0);
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState<number[]>(() => [mseLoss(data, theta, 0)]);
  // The y-domain ceiling for the loss plot: the highest loss this run has ever
  // reached, carried alongside `history` because history is truncated.
  const [lossMax, setLossMax] = useState(() => history[0]);

  const loss = useMemo(() => mseLoss(data, theta, bias), [data, theta, bias]);
  const acc = useMemo(() => accuracyOf(data, theta, bias), [data, theta, bias]);

  const onTrain = () => {
    let t = theta;
    let b = bias;
    const next = history.slice();
    let peak = lossMax;
    for (let i = 0; i < STEPS_PER_TRAIN; i++) {
      ({ theta: t, bias: b } = trainStep(data, t, b, LR));
      const l = mseLoss(data, t, b);
      next.push(l);
      if (l > peak) peak = l;
    }
    setTheta(t);
    setBias(b);
    setStep((s) => s + STEPS_PER_TRAIN);
    setHistory(next.slice(-MAX_HISTORY));
    setLossMax(peak);
  };

  const onReset = () => {
    const t = initTheta();
    const l = mseLoss(data, t, 0);
    setTheta(t);
    setBias(0);
    setStep(0);
    setHistory([l]);
    setLossMax(l);
  };

  return (
    <WidgetCard
      /* eyebrowAs promotes the visible "VQC" eyebrow to the card's heading, at
         the TOP of the card — it replaces a detached sr-only <h3> that sat after
         both plots in DOM order and carried a useId nothing ever referenced. The
         sr-only span gives AT the full name without a second heading. */
      eyebrow={<>VQC<span className="sr-only"> — variational quantum classifier trainer</span></>}
      eyebrowAs="h3"
      chips={<><Chip>2q angle</Chip><Chip>blobs</Chip></>}
    >

      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Boundary + loss */}
        <div className="flex flex-col gap-4">
          <div>
            <BoundaryPlot data={data} theta={theta} bias={bias} plane={plane} />
            <p className="mt-1 text-center text-[10px] text-caption font-mono">
              decision boundary
            </p>
          </div>
          <div>
            <LossCurve history={history} max={lossMax} step={step} />
            <p className="mt-1 text-center text-[10px] text-caption font-mono">
              MSE objective &middot; y max {lossMax.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Readout + controls */}
        <div className="min-w-0 flex-1">
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="font-mono text-sm tabular-nums text-(--ink)"
          >
            {`step ${step} · loss ${loss.toFixed(3)} · accuracy `}
            <span className="text-accent-dark dark:text-accent-light">
              {formatPercent(acc * 100, 0)}
            </span>
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onTrain}
              className={primaryActionClass}
            >
              Train ({STEPS_PER_TRAIN}&times;)
            </button>
            <button
              type="button"
              onClick={onReset}
              className={secondaryActionClass}
            >
              Reset
            </button>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-caption">
            A 2-qubit angle-encoded PQC trained by full-batch parameter-shift
            gradient descent. Each Train burst runs {STEPS_PER_TRAIN} iterations;
            watch the boundary sharpen as the curve descends.
          </p>
        </div>
      </div>
    </WidgetCard>
  );
}
