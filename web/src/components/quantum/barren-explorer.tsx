"use client";

import { useId, useMemo, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, LabeledSlider, WidgetCard } from "./widget-ui";
import { gradientVariance, type Cost } from "./barren";
import { mulberry32 } from "./rng";
import { extent, linearScale, plotInner, polylinePoints, type Plot } from "./chart-utils";

/**
 * Inline barren-plateau explorer rendered from a ```qbarren fenced block in a
 * GUIDE. Parses `{ "depth": 2, "samples": 400 }` defensively, then sweeps the
 * hardware-efficient ansatz (RY(pi/4) seed + RY layers + CZ ring) across qubit
 * counts n = 2..8 and computes the variance of the parameter-shift gradient of
 * a fixed probed parameter, for BOTH a global cost (collapses ~2^-n — the McClean
 * barren plateau) and a local cost (stays in a band at shallow depth). The two
 * curves are drawn on a log10 axis so the exponential collapse reads as a line.
 * Pure client, static-export safe, no AWS.
 */

const N_MIN = 2;
const N_MAX = 8;
const SVG: Plot = { w: 320, h: 200, padL: 40, padR: 16, padT: 16, padB: 32 };

interface ParsedConfig {
  depth: number;
  samples: number;
}

interface ParseResult {
  config?: ParsedConfig;
  error?: string;
}

function parseConfig(source: string): ParseResult {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return { config: { depth: 2, samples: 300 } };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { error: "expected JSON like { \"depth\": 2, \"samples\": 400 }" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "expected a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const depth = obj.depth === undefined ? 2 : Number(obj.depth);
  const samples = obj.samples === undefined ? 300 : Number(obj.samples);
  if (!Number.isInteger(depth) || depth < 1 || depth > 5) {
    return { error: `depth must be an integer in 1..5 (got ${String(obj.depth)})` };
  }
  if (!Number.isFinite(samples) || samples < 10 || samples > 2000) {
    return { error: `samples must be a number in 10..2000 (got ${String(obj.samples)})` };
  }
  return { config: { depth, samples: Math.round(samples) } };
}

interface Sweep {
  ns: number[];
  global: number[];
  local: number[];
}

// Frame + n->x scale are module constants — bound once, not per data point.
const { innerW, innerH } = plotInner(SVG);
const nToX = linearScale(N_MIN, N_MAX, SVG.padL, SVG.padL + innerW);

/** Map a (n, log10 variance) point to SVG coordinates. */
function project(
  n: number,
  logVar: number,
  loLog: number,
  hiLog: number
): { x: number; y: number } {
  const span = Math.max(1e-9, hiLog - loLog);
  const ty = (logVar - loLog) / span;
  return { x: nToX(n), y: SVG.padT + (1 - ty) * innerH };
}

export function BarrenExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseConfig(source), [source]);
  const initDepth = parsed.config?.depth ?? 2;
  const samples = parsed.config?.samples ?? 300;

  const [depth, setDepth] = useState(initDepth);
  const titleId = useId();

  // Sweep n = 2..8 for both cost functions. Seeded per-n with mulberry32(n) so
  // the plot is deterministic and the curves are comparable across costs.
  const sweep = useMemo<Sweep>(() => {
    const ns: number[] = [];
    const global: number[] = [];
    const local: number[] = [];
    for (let n = N_MIN; n <= N_MAX; n++) {
      ns.push(n);
      const run = (cost: Cost) => gradientVariance(n, depth, cost, samples, mulberry32(n));
      global.push(run("global"));
      local.push(run("local"));
    }
    return { ns, global, local };
  }, [depth, samples]);

  if (parsed.error || !parsed.config) {
    return <SharedErrorCard label="barren" message={parsed.error} />;
  }

  // log10 of the variance, floored away from log(0) so empty/zero points plot.
  const FLOOR = 1e-12;
  const logG = sweep.global.map((v) => Math.log10(Math.max(v, FLOOR)));
  const logL = sweep.local.map((v) => Math.log10(Math.max(v, FLOOR)));
  const logExtent = extent([...logG, ...logL]);
  const loLog = Math.floor(logExtent.min);
  const hiLog = Math.ceil(logExtent.max);

  const globalPts = sweep.ns.map((n, i) => project(n, logG[i], loLog, hiLog));
  const localPts = sweep.ns.map((n, i) => project(n, logL[i], loLog, hiLog));

  // Y-axis gridline tick decades.
  const ticks: number[] = [];
  for (let d = loLog; d <= hiLog; d++) ticks.push(d);

  return (
    <WidgetCard
      eyebrow="Barren plateaus"
      chips={
        <>
          <Chip>depth = {depth}</Chip>
          <Chip>{samples} samples</Chip>
        </>
      }
    >
      <div className="px-4 py-4">
        {/* Legend */}
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
            <span className="inline-block h-0.5 w-5 rounded-full bg-accent" aria-hidden="true" />
            global cost
          </span>
          <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
            <span className="inline-block h-0.5 w-5 rounded-full bg-amber-500" aria-hidden="true" />
            local cost
          </span>
        </div>

        {/* Log-scale variance plot */}
        <svg
          viewBox={`0 0 ${SVG.w} ${SVG.h}`}
          width={SVG.w}
          height={SVG.h}
          role="img"
          aria-labelledby={titleId}
          className="w-full max-w-[320px] mx-auto block"
        >
          <title id={titleId}>
            Variance of the parameter-shift gradient versus qubit count, log10 scale.
            The accent curve collapses exponentially (barren plateau) while the amber
            curve stays in a band at this depth.
          </title>

          {/* Y gridlines + decade labels */}
          {ticks.map((d) => {
            const { y } = project(N_MIN, d, loLog, hiLog);
            return (
              <g key={d}>
                <line
                  x1={SVG.padL}
                  y1={y}
                  x2={SVG.w - SVG.padR}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={0.5}
                  className="text-gray-200 dark:text-gray-700"
                />
                <text
                  x={SVG.padL - 4}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={7}
                  className="fill-gray-400 dark:fill-gray-500 font-mono"
                  aria-hidden="true"
                >
                  10{d}
                </text>
              </g>
            );
          })}

          {/* X axis labels (qubit count) */}
          {sweep.ns.map((n) => {
            const { x } = project(n, loLog, loLog, hiLog);
            return (
              <text
                key={n}
                x={x}
                y={SVG.h - SVG.padB + 12}
                textAnchor="middle"
                fontSize={7}
                className="fill-gray-400 dark:fill-gray-500 font-mono"
                aria-hidden="true"
              >
                {n}
              </text>
            );
          })}
          <text
            x={SVG.padL + innerW / 2}
            y={SVG.h - 2}
            textAnchor="middle"
            fontSize={7}
            className="fill-gray-500 dark:fill-gray-400 font-mono"
            aria-hidden="true"
          >
            qubits n
          </text>

          {/* Global-cost curve */}
          <polyline
            points={polylinePoints(globalPts)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-accent"
          />
          {globalPts.map(({ x, y }, i) => (
            <circle key={`g-${i}`} cx={x} cy={y} r={2} className="fill-accent" />
          ))}

          {/* Local-cost curve */}
          <polyline
            points={polylinePoints(localPts)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-amber-500 dark:text-amber-400"
          />
          {localPts.map(({ x, y }, i) => (
            <circle
              key={`l-${i}`}
              cx={x}
              cy={y}
              r={2}
              className="fill-amber-500 dark:fill-amber-400"
            />
          ))}
        </svg>

        {/* Variance readout — a live region so the recomputed numbers are
            announced when the depth slider changes. */}
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-center text-xs font-mono tabular-nums text-gray-600 dark:text-gray-300"
        >
          Gradient variance at {N_MAX} qubits — global ≈ 10
          <sup>{logG[logG.length - 1].toFixed(1)}</sup>, local ≈ 10
          <sup>{logL[logL.length - 1].toFixed(1)}</sup>
        </p>

        {/* Depth control */}
        <LabeledSlider
          label="depth"
          value={depth}
          min={1}
          max={5}
          step={1}
          parse={(s) => parseInt(s, 10)}
          onChange={setDepth}
          ariaLabel="Ansatz depth (number of layers)"
          ariaValueText={`${depth} layers`}
          display={depth}
          rowClassName="mt-4 flex items-center gap-3"
          valueWidth="w-8"
        />

        {/* Callout */}
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          The accent curve&rsquo;s gradient variance vanishes roughly like 2
          <sup>&minus;n</sup>: the optimizer faces an exponentially flat plateau. Raise
          the depth slider and even the amber curve flattens (Cerezo 2021).
        </p>
      </div>
    </WidgetCard>
  );
}
