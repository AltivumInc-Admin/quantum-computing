"use client";

import { useId, useMemo, useState } from "react";
import {
  N_PARAMS,
  makeBlobs,
  mseLoss,
  trainStep,
  vqcOutput,
  type Pt,
} from "./vqc";

/**
 * Inline variational-quantum-classifier trainer rendered from a ```qvqc fenced
 * block in a GUIDE. Parses `{ "dataset": "blobs" }` defensively, builds two
 * separable Gaussian blobs, and trains a 2-qubit angle-encoded PQC live in the
 * browser via full-batch parameter-shift gradient descent (vqc.ts). The Train
 * button runs a burst of steps synchronously so the decision boundary sharpens
 * and the loss curve descends as the learner watches; Reset re-seeds theta.
 * Pure client, static-export safe, no AWS.
 */

const GRID = 32; // decision-boundary resolution
const PLANE = 3.2; // [-PLANE/2, +PLANE/2] feature span shown on the scatter
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
  const trimmed = source.trim();
  if (trimmed.length === 0) return { ok: true, dataset: "blobs" };
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
  const ds = obj["dataset"];
  if (ds !== undefined && ds !== "blobs") {
    return { ok: false, error: `unknown dataset "${String(ds)}"` };
  }
  return { ok: true, dataset: "blobs" };
}

function initTheta(): number[] {
  // Small random init in roughly [-0.1, 0.3].
  return Array.from({ length: N_PARAMS }, () => -0.1 + 0.4 * Math.random());
}

function accuracyOf(data: Pt[], theta: number[], bias: number): number {
  let correct = 0;
  for (const d of data) {
    const pred = vqcOutput(d.x, theta, bias) >= 0 ? 1 : -1;
    if (pred === d.y) correct++;
  }
  return correct / data.length;
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3">
      <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
        vqc error: {message}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision-boundary + scatter SVG
// ---------------------------------------------------------------------------

function planeToCell(g: number): number {
  // g in [0, GRID-1] -> feature coordinate in [-PLANE/2, +PLANE/2].
  return -PLANE / 2 + (PLANE * (g + 0.5)) / GRID;
}

function featureToSvg(v: number): number {
  // feature coord in [-PLANE/2, PLANE/2] -> [0, GRID] viewBox units.
  return ((v + PLANE / 2) / PLANE) * GRID;
}

function BoundaryPlot({
  data,
  theta,
  bias,
}: {
  data: Pt[];
  theta: number[];
  bias: number;
}) {
  const cells = useMemo(() => {
    const out: { gx: number; gy: number; positive: boolean }[] = [];
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const x0 = planeToCell(gx);
        const x1 = planeToCell(gy);
        out.push({ gx, gy, positive: vqcOutput([x0, x1], theta, bias) >= 0 });
      }
    }
    return out;
  }, [theta, bias]);

  return (
    <svg
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={GRID * 6}
      height={GRID * 6}
      role="img"
      aria-label="VQC decision boundary over the feature plane with the training blobs scattered on top."
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
          cx={featureToSvg(d.x[0])}
          cy={GRID - featureToSvg(d.x[1])}
          r={0.7}
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

function LossCurve({ history }: { history: number[] }) {
  const path = useMemo(() => {
    if (history.length < 2) return "";
    const max = Math.max(...history, 1e-9);
    const min = Math.min(...history, 0);
    const span = Math.max(1e-9, max - min);
    const n = history.length;
    return history
      .map((v, i) => {
        const x = (i / (n - 1)) * LOSS_W;
        const y = LOSS_H - ((v - min) / span) * LOSS_H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [history]);

  return (
    <svg
      viewBox={`0 0 ${LOSS_W} ${LOSS_H}`}
      width={LOSS_W}
      height={LOSS_H}
      role="img"
      aria-label={`Mean-squared-error loss over ${Math.max(0, history.length - 1)} training steps.`}
      className="w-full max-w-[200px] mx-auto block"
    >
      <rect x={0} y={0} width={LOSS_W} height={LOSS_H} className="fill-gray-50 dark:fill-gray-900/40" rx={4} />
      {path && (
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
          className="text-accent dark:text-accent-light"
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

  const data = useMemo(() => makeBlobs(30, 1), []);
  const [theta, setTheta] = useState<number[]>(() => initTheta());
  const [bias, setBias] = useState(0);
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState<number[]>(() => [mseLoss(makeBlobs(30, 1), initTheta(), 0)]);
  const headingId = useId();

  if (!parsed.ok) {
    return <ErrorCard message={parsed.error} />;
  }

  const loss = mseLoss(data, theta, bias);
  const acc = accuracyOf(data, theta, bias);

  const onTrain = () => {
    let t = theta;
    let b = bias;
    const next = history.slice();
    for (let i = 0; i < STEPS_PER_TRAIN; i++) {
      ({ theta: t, bias: b } = trainStep(data, t, b, LR));
      next.push(mseLoss(data, t, b));
    }
    setTheta(t);
    setBias(b);
    setStep((s) => s + STEPS_PER_TRAIN);
    setHistory(next.slice(-MAX_HISTORY));
  };

  const onReset = () => {
    const t = initTheta();
    setTheta(t);
    setBias(0);
    setStep(0);
    setHistory([mseLoss(data, t, 0)]);
  };

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          VQC
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          2q angle
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          blobs
        </span>
      </div>

      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Boundary + loss */}
        <div className="flex flex-col gap-4">
          <div>
            <BoundaryPlot data={data} theta={theta} bias={bias} />
            <p className="mt-1 text-center text-[10px] text-gray-400 dark:text-gray-500 font-mono">
              decision boundary
            </p>
          </div>
          <div>
            <LossCurve history={history} />
            <p className="mt-1 text-center text-[10px] text-gray-400 dark:text-gray-500 font-mono">
              MSE objective
            </p>
          </div>
        </div>

        {/* Readout + controls */}
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="sr-only">
            Variational quantum classifier trainer
          </h3>

          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="font-mono text-sm tabular-nums text-gray-800 dark:text-gray-100"
          >
            {`step ${step} · loss ${loss.toFixed(3)} · accuracy `}
            <span className="text-accent dark:text-accent-light">
              {(acc * 100).toFixed(0)}%
            </span>
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onTrain}
              className="rounded-control bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-(--shadow-resting) hover:bg-accent-dark focus-ring transition-colors motion-reduce:transition-none"
            >
              Train ({STEPS_PER_TRAIN}&times;)
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus-ring transition-colors motion-reduce:transition-none"
            >
              Reset
            </button>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            A 2-qubit angle-encoded PQC trained by full-batch parameter-shift
            gradient descent. Each Train burst runs {STEPS_PER_TRAIN} iterations;
            watch the boundary sharpen as the curve descends.
          </p>
        </div>
      </div>
    </div>
  );
}
