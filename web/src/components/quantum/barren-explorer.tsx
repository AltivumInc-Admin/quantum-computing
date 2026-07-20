"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { Chip, ErrorCard, LabeledSlider, WidgetCard } from "./widget-ui";
import { gradientVariances } from "./barren";
import { mulberry32 } from "./rng";
import { extent, linearScale, plotInner, polylinePoints, type Plot } from "./chart-utils";

/**
 * Inline barren-plateau explorer rendered from a ```qbarren fenced block in a
 * GUIDE. Parses `{ "depth": 2, "samples": 400 }` defensively, then sweeps the
 * hardware-efficient ansatz (RY(pi/4) seed + RY layers + CZ ring) across qubit
 * counts n = 2..8 and computes the variance of the parameter-shift gradient of
 * a fixed probed parameter, for BOTH a global cost (collapses ~2^-n — the McClean
 * barren plateau) and a local cost (erodes far more slowly at these depths). The
 * two curves are drawn on a log10 axis so the exponential collapse reads as a line.
 * Pure client, static-export safe, no AWS.
 *
 * Shape: `BarrenExplorer` only parses, so a malformed fence renders the error
 * card without paying for the sweep; `BarrenView` owns every hook and receives
 * an already-validated config. (Hooks may not follow a conditional return, so
 * before the split the n=2..8 x 2-cost sweep ran in full on the error path and
 * was then discarded.)
 */

const N_MIN = 2;
const N_MAX = 8;
const DEPTH_MIN = 1;
const DEPTH_MAX = 5;
const SVG: Plot = { w: 320, h: 200, padL: 40, padR: 16, padT: 16, padB: 32 };

interface ParsedConfig {
  depth: number;
  samples: number;
}

/** The single home of the fence defaults — previously restated three times. */
const DEFAULTS: ParsedConfig = { depth: 2, samples: 300 };

type ParseResult = { ok: true; config: ParsedConfig } | { ok: false; error: string };

function parseConfig(source: string): ParseResult {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return { ok: true, config: DEFAULTS };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    // Deliberately bespoke rather than parse-utils' generic "invalid JSON": the
    // example shape is the fastest fix for a lesson author who mistyped a fence.
    return { ok: false, error: "expected JSON like { \"depth\": 2, \"samples\": 400 }" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "expected a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const depth = obj.depth === undefined ? DEFAULTS.depth : Number(obj.depth);
  const samples = obj.samples === undefined ? DEFAULTS.samples : Number(obj.samples);
  if (!Number.isInteger(depth) || depth < DEPTH_MIN || depth > DEPTH_MAX) {
    return {
      ok: false,
      error: `depth must be an integer in ${DEPTH_MIN}..${DEPTH_MAX} (got ${String(obj.depth)})`,
    };
  }
  if (!Number.isFinite(samples) || samples < 10 || samples > 2000) {
    return { ok: false, error: `samples must be a number in 10..2000 (got ${String(obj.samples)})` };
  }
  return { ok: true, config: { depth, samples: Math.round(samples) } };
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
  if (!parsed.ok) {
    return <ErrorCard label="barren" message={parsed.error} />;
  }
  return <BarrenView config={parsed.config} />;
}

function BarrenView({ config }: { config: ParsedConfig }) {
  const { samples } = config;
  const [depth, setDepth] = useState(config.depth);
  // Defer the heavy 7-qubit-count sweep so a depth drag stays responsive; the
  // slider uses the immediate value and every surface that renders sweep output
  // (plot, chip, readout) dims together while it catches up (WS-5c pattern).
  const deferredDepth = useDeferredValue(depth);
  const stale = depth !== deferredDepth;
  const titleId = useId();

  // Sweep n = 2..8. Seeded per-n with mulberry32(n) so the plot is deterministic
  // and the two cost curves are drawn from the same theta draws; gradientVariances
  // builds each state pair once and reads both costs off it.
  const sweep = useMemo<Sweep>(() => {
    const ns: number[] = [];
    const global: number[] = [];
    const local: number[] = [];
    for (let n = N_MIN; n <= N_MAX; n++) {
      const { global: g, local: l } = gradientVariances(n, deferredDepth, samples, mulberry32(n));
      ns.push(n);
      global.push(g);
      local.push(l);
    }
    return { ns, global, local };
  }, [deferredDepth, samples]);

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

  // How far the local curve descends across the whole qubit sweep, in decades —
  // used so the chart's accessible description states what it actually shows at
  // this depth instead of asserting a fixed "stays in a band".
  const localFall = logL[0] - logL[logL.length - 1];
  const localBehaviour =
    localFall < 0.15
      ? "holds a nearly flat band"
      : localFall < 0.5
        ? "tilts down only slightly"
        : "has started to erode, though it is still far from the global collapse";

  const dimClass = stale ? "opacity-60" : "";

  return (
    <WidgetCard
      eyebrow="Barren plateaus"
      chips={
        <>
          <Chip>depth = {deferredDepth}</Chip>
          <Chip>{samples} samples</Chip>
        </>
      }
    >
      <div className="px-4 py-4">
        {/* Legend — the dash pattern, not the hue, is what distinguishes the
            curves (WCAG 1.4.1); it mirrors each polyline's strokeDasharray. */}
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-caption">
            <svg width={20} height={4} aria-hidden="true" className="shrink-0 overflow-visible">
              <line
                x1={0}
                y1={2}
                x2={20}
                y2={2}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                className="text-accent-dark dark:text-accent"
              />
            </svg>
            global cost (solid)
          </span>
          <span className="flex items-center gap-1.5 text-caption">
            <svg width={20} height={4} aria-hidden="true" className="shrink-0 overflow-visible">
              <line
                x1={0}
                y1={2}
                x2={20}
                y2={2}
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray="6 3"
                strokeLinecap="round"
                className="text-amber-600 dark:text-amber-400"
              />
            </svg>
            local cost (dashed)
          </span>
        </div>

        {/* Log-scale variance plot */}
        <svg
          viewBox={`0 0 ${SVG.w} ${SVG.h}`}
          width={SVG.w}
          height={SVG.h}
          role="img"
          aria-labelledby={titleId}
          aria-busy={stale}
          className={`w-full max-w-[320px] mx-auto block transition-opacity ${dimClass}`}
        >
          <title id={titleId}>
            Variance of the parameter-shift gradient versus qubit count, log10 scale.
            The global-cost curve (solid) collapses exponentially — the barren plateau.
            At depth {deferredDepth} the local-cost curve (dashed) {localBehaviour}.
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
                {/* The exponent is a raised tspan, not an inline digit: `10{d}`
                    rendered the d = 0 tick (which every reachable depth emits,
                    since the largest variance is always < 1) as the literal
                    glyphs "100" on a log axis whose value there is 1. */}
                <text
                  x={SVG.padL - 4}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={7}
                  className="fill-gray-500 dark:fill-gray-400 font-mono"
                  aria-hidden="true"
                >
                  10
                  <tspan dy={-2.5} fontSize={5}>
                    {d}
                  </tspan>
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
                className="fill-gray-500 dark:fill-gray-400 font-mono"
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

          {/* Global-cost curve. accent-dark in light theme: the raw light --accent
              is 2.79:1 on the surface, under the 3:1 WCAG 1.4.11 floor for a data
              mark (the pairing PR #172 gave the sibling VQC loss stroke). */}
          <polyline
            points={polylinePoints(globalPts)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-accent-dark dark:text-accent"
          />
          {globalPts.map(({ x, y }, i) => (
            <circle
              key={`g-${i}`}
              cx={x}
              cy={y}
              r={2}
              className="fill-accent-dark dark:fill-accent"
            />
          ))}

          {/* Local-cost curve — dashed so the two series are separable without
              hue (the pes-explorer HF-curve idiom), amber-600 in light theme to
              clear 3:1 (amber-500 measures ~2.15:1 on the light glass). */}
          <polyline
            points={polylinePoints(localPts)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            className="text-amber-600 dark:text-amber-400"
          />
          {localPts.map(({ x, y }, i) => (
            <circle
              key={`l-${i}`}
              cx={x}
              cy={y}
              r={2}
              className="fill-amber-600 dark:fill-amber-400"
            />
          ))}
        </svg>

        {/* Variance readout — a live region so the recomputed numbers are
            announced when the depth slider changes. aria-busy holds the
            announcement (and dims the text) until the deferred sweep settles,
            so the polite region never narrates a value the plot is not showing. */}
        <p
          role="status"
          aria-live="polite"
          aria-busy={stale}
          className={`mt-3 text-center text-xs font-mono tabular-nums text-caption transition-opacity ${dimClass}`}
        >
          Gradient variance at {N_MAX} qubits — global ≈ 10
          <sup>{logG[logG.length - 1].toFixed(1)}</sup>, local ≈ 10
          <sup>{logL[logL.length - 1].toFixed(1)}</sup>
        </p>

        {/* Depth control */}
        <LabeledSlider
          label="depth"
          value={depth}
          min={DEPTH_MIN}
          max={DEPTH_MAX}
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
        <p className="mt-3 text-xs text-caption">
          The global-cost curve&rsquo;s gradient variance vanishes roughly like 2
          <sup>&minus;n</sup>: the optimizer faces an exponentially flat plateau. The
          local cost buys trainability rather than immunity — raise the depth slider
          and watch its band start to tilt as well. (Cerezo 2021 shows it collapses
          too once depth grows past this slider&rsquo;s range.)
        </p>
      </div>
    </WidgetCard>
  );
}
