"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { Chip, ErrorCard, LabeledSlider, WidgetCard, fieldClass } from "./widget-ui";
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
import { parseJsonObject } from "./parse-utils";
import { formatPercent } from "./format";

/**
 * Inline quantum-kernel decision-boundary explorer rendered from a ```qkernel
 * fenced block. Parses `{ "dataset": "circles", "map": "iqp" }`, builds a seeded
 * training set, and evaluates the fidelity kernel classifier
 * sign( sum_i y_i K(x, x_i) + bias ) over a 36x36 grid of the plane entirely in
 * the browser. A feature-scale slider stretches the feature map: pushed high the
 * entangling `iqp` map aliases first — its product phases grow quadratically
 * with scale — while the plain `angle` map wraps later and gentler (see
 * SCALE_LESSON). The reported accuracy is IN-SAMPLE and is
 * labeled as such, compared against a linear nearest-mean baseline scored the
 * same way. No backend, no SSR.
 *
 * Shape: `KernelExplorer` only parses, so the guard is a plain `!parsed.ok`;
 * `KernelView` owns every hook with a non-nullable config. (Before the split,
 * both heavy memos had to be nullable, which produced a guard branch that could
 * never be taken and a placeholder message that would have rendered as the
 * doubled string "kernel error: kernel error".)
 */

const GRID = 36;
const SVG = 240; // viewBox px; plane spans [-1.1, 1.1] in both axes
const SPAN = 1.1;
const CELL = SVG / GRID;
// Map plane coordinates [-SPAN, SPAN] to SVG pixels.
const px = (x: number) => ((x + SPAN) / (2 * SPAN)) * SVG;
const py = (y: number) => ((SPAN - y) / (2 * SPAN)) * SVG;

const DATASETS: DatasetName[] = ["circles", "xor"];
const MAPS: FeatureMap[] = ["angle", "iqp"];

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

interface Config {
  dataset: DatasetName;
  map: FeatureMap;
}

function parseSource(source: string): { ok: true; config: Config } | { ok: false; error: string } {
  let dataset: DatasetName = "circles";
  let map: FeatureMap = "iqp";

  const base = parseJsonObject(source);
  if (!base.ok) return { ok: false, error: base.error };
  if (base.obj) {
    const obj = base.obj;
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

  return { ok: true, config: { dataset, map } };
}

// ---------------------------------------------------------------------------
// Linear nearest-mean baseline
//
// Not chance-level, despite what this comment used to claim: with the shipped
// seed it scores 68% in-sample on `circles` and 53% on `xor`. It is the honest
// linear-model reference the quantum kernel is being compared against, scored
// on the same training points so the two numbers are like for like.
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
// Scale lesson
//
// Measured on the shipped dataset (circles, train seed 1 / held-out seed 2)
// over the slider's 0.3-5.0 range under the canonical IQP convention (the one
// lib.ml.feature_maps.iqp_encoding implements, pinned by
// __fixtures__/iqp-states.json): `iqp` in-sample accuracy climbs 73 -> 98 ->
// 100% (scales 0.3 / 1 / 2), holds through ~3, then aliases away — 95% at 4,
// 78% at 5 (held-out peaks 100% near 2-2.5, then 90 -> 75%). `angle` climbs
// later (68 -> 80 -> 98%) and holds longer — 100% at 3, 97% at 4 — before its
// own wrap bites at the top of the range (80% at 5). The contrast is
// structural, not statistical: iqp's ZZ phase carries the feature PRODUCT, so
// it grows with the SQUARE of the scale and folds onto itself first, while the
// angle map's rotation argument grows only linearly. The caption is keyed off
// the selected map so neither map's behaviour is asserted for the other, and
// the slider range extends to 5.0 exactly so the fall-off both captions
// describe is reachable in-widget rather than taken on faith.
// ---------------------------------------------------------------------------

const SCALE_LESSON: Record<FeatureMap, string> = {
  iqp:
    "Push the scale past ~3 and the entangling map over-encodes: its ZZ phase " +
    "carries the feature product, so it grows with the square of the scale — the " +
    "boundary gains structure it cannot justify and accuracy falls away again.",
  angle:
    "This map wraps much later — its rotation angles grow only linearly with " +
    "scale, so accuracy keeps climbing well past where the entangling map has " +
    "already folded onto itself. Only near the top of the slider does it begin " +
    "to alias too.",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KernelExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);
  if (!parsed.ok) {
    return <ErrorCard label="kernel" message={parsed.error} />;
  }
  return <KernelView config={parsed.config} />;
}

function KernelView({ config }: { config: Config }) {
  const [scale, setScale] = useState(1.0);
  // Defer the heavy 36x36 grid recompute so a scale drag stays responsive; the
  // slider uses the immediate value and every surface rendering deferred output
  // (the boundary AND the accuracy readout) dims together while it catches up.
  const deferredScale = useDeferredValue(scale);
  const stale = scale !== deferredScale;
  const [map, setMap] = useState<FeatureMap>(config.map);
  const mapId = useId();

  // Training set depends only on the dataset.
  const train = useMemo<Point[]>(() => makeDataset(config.dataset, 60, 1), [config.dataset]);

  const baseline = useMemo(() => nearestMeanAccuracy(train), [train]);

  const result = useMemo(() => {
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

  // 1296 rects + 60 circles are invariant while deferredScale lags the slider —
  // stable element references let React bail out per-fiber on the drag renders
  // (the qaoa heat-memo treatment from WS-6g #64).
  const boundaryCells = useMemo(
    () =>
      result.cells.map((row, gy) =>
        row.map((sign, gx) => (
          <rect
            key={`${gx}-${gy}`}
            x={gx * CELL}
            y={gy * CELL}
            width={CELL + 0.5}
            height={CELL + 0.5}
            fill={
              sign >= 0
                ? "color-mix(in oklab, var(--accent) 22%, transparent)"
                : "color-mix(in oklab, var(--accent) 4%, transparent)"
            }
          />
        ))
      ),
    [result]
  );

  const trainingPoints = useMemo(
    () =>
      train.map((p, i) => (
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
      )),
    [train]
  );

  const { acc } = result;
  const dimClass = stale ? "opacity-60" : "";

  return (
    <WidgetCard eyebrow="Quantum kernel" chips={<Chip>{config.dataset}</Chip>}>
      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Decision boundary */}
        <div className="flex flex-col gap-2">
          <svg
            viewBox={`0 0 ${SVG} ${SVG}`}
            width={SVG}
            height={SVG}
            role="img"
            /* deferredScale, not scale: the cells in this image were computed
               from the deferred value, so the immediate one would describe a
               boundary that is not on screen for the whole of a drag. */
            aria-label={`Quantum-kernel decision boundary over the plane for the ${config.dataset} dataset with the ${map} feature map at scale ${deferredScale.toFixed(2)}.`}
            aria-busy={stale}
            className={`w-full max-w-[240px] mx-auto block rounded-control transition-opacity ${dimClass}`}
          >
            {/* boundary regions + training points (memoized element arrays) */}
            {boundaryCells}
            {trainingPoints}
          </svg>
          <p className="text-center text-[10px] text-caption font-mono">
            +1 region shaded &middot; class points overlaid
          </p>
        </div>

        {/* Controls + readout */}
        <div className="min-w-0 flex-1">
          {/* Both figures are scored on the training points themselves (each
              point's own kernel term K(x_i, x_i) = 1 is the largest in its sum,
              so it always votes for its own label) — under the canonical IQP
              convention the training-vs-held-out gap is +5.0 points for iqp and
              +13.3 for angle at the default scale 1.0, ranging -3.4 to +13.3
              across the 0.3-5.0 slider (circles, train seed 1 / test seed 2).
              Labeled "training" so the widget does not teach a training score
              as generalization. aria-busy + the dim keep the number visibly
              provisional while the deferred recompute lags. */}
          <div role="status" aria-live="polite" aria-busy={stale} className={`transition-opacity ${dimClass}`}>
            <p className="text-sm text-(--ink)">
              quantum-kernel training accuracy ={" "}
              <span className="font-semibold tabular-nums">{formatPercent(acc * 100, 0)}</span>
            </p>
            <p className="mt-1 text-sm text-caption">
              linear baseline (training) ={" "}
              <span className="font-semibold tabular-nums">{formatPercent(baseline * 100, 0)}</span>
            </p>
          </div>

          {/* map toggle */}
          <div className="mt-4 flex items-center gap-3">
            <label htmlFor={mapId} className="w-16 shrink-0 font-mono text-sm text-caption">
              map
            </label>
            <select
              id={mapId}
              value={map}
              onChange={(e) => setMap(e.target.value as FeatureMap)}
              className={`${fieldClass} flex-1 px-2 py-1 text-sm font-mono`}
              aria-label="Quantum feature map"
            >
              <option value="angle">angle</option>
              <option value="iqp">iqp</option>
            </select>
          </div>

          {/* feature-scale slider */}
          <LabeledSlider
            label="scale"
            value={scale}
            min={0.3}
            max={5.0}
            step={0.05}
            onChange={setScale}
            ariaLabel="Feature-map scale"
            ariaValueText={`${scale.toFixed(2)}`}
            display={scale.toFixed(2)}
            rowClassName="mt-3 flex items-center gap-3"
            labelClassName="w-16 shrink-0 font-mono text-sm text-caption"
            valueWidth="w-12"
          />

          <p className="mt-4 text-xs text-caption">
            The fidelity kernel lifts the data into Hilbert space, so a quantum
            map separates rings a linear baseline cannot. {SCALE_LESSON[map]}
          </p>
        </div>
      </div>
    </WidgetCard>
  );
}
