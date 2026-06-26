"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, WidgetCard } from "./widget-ui";
import {
  accuracy,
  featureState,
  kernelBiasS,
  kernelScoreS,
  makeDataset,
  type DatasetName,
  type FeatureMap,
  type Point,
} from "./kernel";

/**
 * Inline quantum-kernel decision-boundary explorer rendered from a ```qkernel
 * fenced block. Parses `{ "dataset": "circles", "map": "iqp" }`, builds a seeded
 * training set, and evaluates the fidelity kernel classifier
 * sign( sum_i y_i K(x, x_i) + bias ) over a 36x36 grid of the plane entirely in
 * the browser. A feature-scale slider stretches the feature map: pushed high it
 * visibly aliases the boundary. The reported accuracy is compared against a
 * linear nearest-mean baseline. No backend, no SSR.
 */

const GRID = 36;
const SVG = 240; // viewBox px; plane spans [-1.1, 1.1] in both axes
const SPAN = 1.1;

const DATASETS: DatasetName[] = ["circles", "xor"];
const MAPS: FeatureMap[] = ["angle", "iqp"];

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

function parseSource(
  source: string
): { ok: true; dataset: DatasetName; map: FeatureMap } | { ok: false; error: string } {
  const trimmed = source.trim();
  let dataset: DatasetName = "circles";
  let map: FeatureMap = "iqp";

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
    if (obj["dataset"] !== undefined) {
      if (typeof obj["dataset"] !== "string" || !DATASETS.includes(obj["dataset"] as DatasetName)) {
        return { ok: false, error: '"dataset" must be "circles" or "xor"' };
      }
      dataset = obj["dataset"] as DatasetName;
    }
    if (obj["map"] !== undefined) {
      if (typeof obj["map"] !== "string" || !MAPS.includes(obj["map"] as FeatureMap)) {
        return { ok: false, error: '"map" must be "angle" or "iqp"' };
      }
      map = obj["map"] as FeatureMap;
    }
  }

  return { ok: true, dataset, map };
}

// ---------------------------------------------------------------------------
// Linear nearest-mean baseline (chance-level on circles/xor)
// ---------------------------------------------------------------------------

function nearestMeanAccuracy(train: Point[]): number {
  const mean = (label: -1 | 1): [number, number] => {
    let sx = 0,
      sy = 0,
      c = 0;
    for (const p of train) {
      if (p.y === label) {
        sx += p.x[0];
        sy += p.x[1];
        c++;
      }
    }
    return c === 0 ? [0, 0] : [sx / c, sy / c];
  };
  const mPos = mean(1);
  const mNeg = mean(-1);
  const d2 = (a: [number, number], b: [number, number]) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const preds = train.map((p) => (d2(p.x, mPos) <= d2(p.x, mNeg) ? 1 : -1));
  return accuracy(preds, train.map((p) => p.y));
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="kernel" message={message} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KernelExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  const [scale, setScale] = useState(1.0);
  // Defer the heavy 36x36 grid recompute so a scale drag stays responsive; the
  // slider/label use the immediate value and the boundary dims while it catches up.
  const deferredScale = useDeferredValue(scale);
  const [map, setMap] = useState<FeatureMap>(parsed.ok ? parsed.map : "iqp");
  const scaleId = useId();
  const mapId = useId();

  // Training set depends only on the dataset, so it is memoized on the parse result.
  const train = useMemo<Point[] | null>(() => {
    if (!parsed.ok) return null;
    return makeDataset(parsed.dataset, 60, 1);
  }, [parsed]);

  const baseline = useMemo(() => (train ? nearestMeanAccuracy(train) : 0), [train]);

  const result = useMemo(() => {
    if (!train) return null;
    const trainStates = train.map((p) => featureState(p.x, map, deferredScale));
    const bias = kernelBiasS(trainStates, train);

    const cells: number[][] = [];
    for (let gy = 0; gy < GRID; gy++) {
      const row: number[] = [];
      const cy = SPAN - (2 * SPAN * (gy + 0.5)) / GRID;
      for (let gx = 0; gx < GRID; gx++) {
        const cx = -SPAN + (2 * SPAN * (gx + 0.5)) / GRID;
        row.push(kernelScoreS([cx, cy], trainStates, train, map, deferredScale, bias) >= 0 ? 1 : -1);
      }
      cells.push(row);
    }

    const preds = train.map((p) => (kernelScoreS(p.x, trainStates, train, map, deferredScale, bias) >= 0 ? 1 : -1));
    const acc = accuracy(preds, train.map((p) => p.y));

    return { cells, acc };
  }, [train, map, deferredScale]);

  if (!parsed.ok || !train || !result) {
    return <ErrorCard message={parsed.ok ? "kernel error" : parsed.error} />;
  }

  const { cells, acc } = result;
  const cell = SVG / GRID;

  // Map plane coordinates [-SPAN, SPAN] to SVG pixels.
  const px = (x: number) => ((x + SPAN) / (2 * SPAN)) * SVG;
  const py = (y: number) => ((SPAN - y) / (2 * SPAN)) * SVG;

  return (
    <WidgetCard eyebrow="Quantum kernel" chips={<Chip>{parsed.dataset}</Chip>}>
      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Decision boundary */}
        <div className="flex flex-col gap-2">
          <svg
            viewBox={`0 0 ${SVG} ${SVG}`}
            width={SVG}
            height={SVG}
            role="img"
            aria-label={`Quantum-kernel decision boundary over the plane for the ${parsed.dataset} dataset with the ${map} feature map at scale ${scale.toFixed(2)}.`}
            aria-busy={scale !== deferredScale}
            className={`w-full max-w-[240px] mx-auto block rounded-control transition-opacity ${scale !== deferredScale ? "opacity-60" : ""}`}
          >
            {/* boundary regions */}
            {cells.map((row, gy) =>
              row.map((sign, gx) => (
                <rect
                  key={`${gx}-${gy}`}
                  x={gx * cell}
                  y={gy * cell}
                  width={cell + 0.5}
                  height={cell + 0.5}
                  fill={
                    sign >= 0
                      ? "color-mix(in oklab, var(--accent) 22%, transparent)"
                      : "color-mix(in oklab, var(--accent) 4%, transparent)"
                  }
                />
              ))
            )}
            {/* training points */}
            {train.map((p, i) => (
              <circle
                key={i}
                cx={px(p.x[0])}
                cy={py(p.x[1])}
                r={3}
                className={
                  p.y === 1
                    ? "fill-accent dark:fill-accent-light stroke-white dark:stroke-gray-900"
                    : "fill-gray-400 dark:fill-gray-500 stroke-white dark:stroke-gray-900"
                }
                strokeWidth={0.75}
              />
            ))}
          </svg>
          <p className="text-center text-[10px] text-caption font-mono">
            +1 region shaded &middot; class points overlaid
          </p>
        </div>

        {/* Controls + readout */}
        <div className="min-w-0 flex-1">
          <div role="status" aria-live="polite">
            <p className="text-sm text-gray-800 dark:text-gray-200">
              quantum-kernel accuracy ={" "}
              <span className="font-semibold tabular-nums">{(acc * 100).toFixed(0)}%</span>
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              linear baseline ={" "}
              <span className="font-semibold tabular-nums">{(baseline * 100).toFixed(0)}%</span>
            </p>
          </div>

          {/* map toggle */}
          <div className="mt-4 flex items-center gap-3">
            <label htmlFor={mapId} className="w-16 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300">
              map
            </label>
            <select
              id={mapId}
              value={map}
              onChange={(e) => setMap(e.target.value as FeatureMap)}
              className="flex-1 rounded-control border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 text-sm font-mono focus-ring"
              aria-label="Quantum feature map"
            >
              <option value="angle">angle</option>
              <option value="iqp">iqp</option>
            </select>
          </div>

          {/* feature-scale slider */}
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor={scaleId} className="w-16 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300">
              scale
            </label>
            <input
              id={scaleId}
              type="range"
              min={0.3}
              max={2.0}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="slider flex-1 focus-ring"
              aria-label="Feature-map scale"
              aria-valuetext={`${scale.toFixed(2)}`}
            />
            <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {scale.toFixed(2)}
            </span>
          </div>

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            The fidelity kernel lifts the data into Hilbert space, so a quantum
            map separates rings a linear baseline cannot. Push the scale high and
            the boundary starts to alias.
          </p>
        </div>
      </div>
    </WidgetCard>
  );
}
