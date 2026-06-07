"use client";

import { useId, useMemo, useState } from "react";
import { basisLabel } from "./math";
import {
  cutValue,
  qaoaDistribution,
  qaoaExpectedCut,
  qaoaLandscape,
  verticesIn,
  type Edge,
} from "./qaoa";

/**
 * Inline QAOA / variational-landscape explorer rendered from a ```qoptim fenced
 * block. Parses a MaxCut graph `{ "edges": [[0,1],[1,2],[2,0]] }`, runs the p=1
 * QAOA circuit (cost-phase e^{-i gamma cut(x)} + RX(2 beta) mixer) entirely in
 * the browser, and shows: the graph, gamma/beta sliders with a live expected-cut
 * readout, a 24x24 expected-cut heatmap with the current (gamma, beta) point and
 * the grid-max cell marked, and the bitstring distribution. No backend, no SSR.
 */

const RES = 24;
const SVG = { w: 220, h: 160, r: 12 };

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

const DEFAULT_EDGES: Edge[] = [
  [0, 1],
  [1, 2],
  [2, 0],
];

function parseSource(
  source: string
): { ok: true; edges: Edge[]; n: number } | { ok: false; error: string } {
  const trimmed = source.trim();
  let edges: Edge[] = DEFAULT_EDGES;

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
    const rawEdges = obj["edges"];
    if (rawEdges !== undefined) {
      if (!Array.isArray(rawEdges) || rawEdges.length === 0) {
        return { ok: false, error: '"edges" must be a non-empty array' };
      }
      const parsed: Edge[] = [];
      for (const e of rawEdges) {
        if (
          !Array.isArray(e) ||
          e.length !== 2 ||
          typeof e[0] !== "number" ||
          typeof e[1] !== "number" ||
          !Number.isInteger(e[0]) ||
          !Number.isInteger(e[1])
        ) {
          return { ok: false, error: "each edge must be [int, int]" };
        }
        const [a, b] = e as [number, number];
        if (a < 0 || b < 0) {
          return { ok: false, error: "edge indices must be >= 0" };
        }
        if (a === b) {
          return { ok: false, error: "edge endpoints must be distinct" };
        }
        parsed.push([a, b]);
      }
      edges = parsed;
    }
  }

  const n = verticesIn(edges);
  if (n < 2 || n > 5) {
    return { ok: false, error: "graph must have 2 to 5 vertices" };
  }
  for (const [a, b] of edges) {
    if (a >= n || b >= n) {
      return { ok: false, error: `edge index out of range [0, ${n - 1}]` };
    }
  }
  return { ok: true, edges, n };
}

// ---------------------------------------------------------------------------
// Heatmap color
// ---------------------------------------------------------------------------

function heatColor(t: number): string {
  // t in [0,1]: low = faint, high = accent. Interpolate lightness/opacity.
  const clamped = Math.max(0, Math.min(1, t));
  return `color-mix(in oklab, var(--accent) ${(clamped * 100).toFixed(0)}%, transparent)`;
}

// ---------------------------------------------------------------------------
// Graph SVG
// ---------------------------------------------------------------------------

function GraphSvg({ edges, n }: { edges: Edge[]; n: number }) {
  const positions = useMemo<[number, number][]>(() => {
    const cx = SVG.w / 2;
    const cy = SVG.h / 2;
    const radius = Math.min(SVG.w, SVG.h) * 0.36;
    return Array.from({ length: n }, (_, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
  }, [n]);

  const ariaLabel = `MaxCut graph with ${n} vertices and ${edges.length} edges.`;

  return (
    <svg
      viewBox={`0 0 ${SVG.w} ${SVG.h}`}
      width={SVG.w}
      height={SVG.h}
      role="img"
      aria-label={ariaLabel}
      className="w-full max-w-[220px] mx-auto block"
    >
      {edges.map(([a, b], i) => {
        const [x1, y1] = positions[a];
        const [x2, y2] = positions[b];
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-gray-300 dark:text-gray-600"
          />
        );
      })}
      {positions.map(([cx, cy], i) => (
        <g key={i}>
          <circle
            cx={cx}
            cy={cy}
            r={SVG.r}
            className="fill-accent dark:fill-accent-light stroke-white dark:stroke-gray-900"
            strokeWidth={2}
          />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            className="fill-white dark:fill-gray-900 font-semibold"
            aria-hidden="true"
          >
            {i}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3">
      <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
        qaoa error: {message}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function QaoaExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  const [gamma, setGamma] = useState(Math.PI / 4);
  const [beta, setBeta] = useState(Math.PI / 8);
  const gammaId = useId();
  const betaId = useId();

  // Landscape depends only on the graph, so it is memoized on the parse result.
  const landscape = useMemo(() => {
    if (!parsed.ok) return null;
    return qaoaLandscape(parsed.n, parsed.edges, RES);
  }, [parsed]);

  // Grid-max cell over the landscape.
  const gridMax = useMemo(() => {
    if (!landscape) return null;
    let best = -Infinity;
    let gi = 0;
    let bi = 0;
    let lo = Infinity;
    for (let g = 0; g < landscape.length; g++) {
      for (let b = 0; b < landscape[g].length; b++) {
        const v = landscape[g][b];
        if (v > best) {
          best = v;
          gi = g;
          bi = b;
        }
        if (v < lo) lo = v;
      }
    }
    return { value: best, gi, bi, lo };
  }, [landscape]);

  const live = useMemo(() => {
    if (!parsed.ok) return null;
    const { n, edges } = parsed;
    const expected = qaoaExpectedCut(n, edges, gamma, beta);
    const distribution = qaoaDistribution(n, edges, gamma, beta);
    let maxCut = 0;
    for (let x = 0; x < 1 << n; x++) maxCut = Math.max(maxCut, cutValue(x, edges));
    return { n, edges, expected, distribution, maxCut };
  }, [parsed, gamma, beta]);

  if (!parsed.ok || !landscape || !gridMax || !live) {
    return <ErrorCard message={parsed.ok ? "qaoa error" : parsed.error} />;
  }

  const { n, edges, expected, distribution, maxCut } = live;

  // Current (gamma, beta) cell on the heatmap grid.
  const curGi = Math.round((gamma / Math.PI) * (RES - 1));
  const curBi = Math.round((beta / (Math.PI / 2)) * (RES - 1));

  const span = Math.max(1e-9, gridMax.value - gridMax.lo);

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          QAOA
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          {n}q
        </span>
      </div>

      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Graph + landscape */}
        <div className="flex flex-col gap-4">
          <GraphSvg edges={edges} n={n} />

          {/* Landscape heatmap */}
          <div>
            <svg
              viewBox={`0 0 ${RES} ${RES}`}
              width={RES * 6}
              height={RES * 6}
              role="img"
              aria-label={`Expected-cut landscape over gamma in [0, pi] and beta in [0, pi/2]. Grid maximum ${gridMax.value.toFixed(2)}.`}
              className="w-full max-w-[160px] mx-auto block rounded-control"
            >
              {landscape.map((row, gi) =>
                row.map((v, bi) => (
                  <rect
                    key={`${gi}-${bi}`}
                    x={bi}
                    y={RES - 1 - gi}
                    width={1}
                    height={1}
                    fill={heatColor((v - gridMax.lo) / span)}
                  />
                ))
              )}
              {/* grid-max cell marker */}
              <rect
                x={gridMax.bi}
                y={RES - 1 - gridMax.gi}
                width={1}
                height={1}
                fill="none"
                stroke="currentColor"
                strokeWidth={0.5}
                className="text-amber-500 dark:text-amber-400"
              />
              {/* current (gamma, beta) marker */}
              <circle
                cx={curBi + 0.5}
                cy={RES - 1 - curGi + 0.5}
                r={0.9}
                className="fill-gray-900 dark:fill-white"
                stroke="currentColor"
                strokeWidth={0.4}
              />
            </svg>
            <p className="mt-1 text-center text-[10px] text-gray-400 dark:text-gray-500 font-mono">
              &#947; horizontal &middot; &#946; vertical
            </p>
          </div>
        </div>

        {/* Controls + readout + distribution */}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-800 dark:text-gray-200">
            expected cut ={" "}
            <span className="font-semibold tabular-nums">{expected.toFixed(2)}</span>{" "}
            <span className="text-gray-500 dark:text-gray-400">(max = {maxCut})</span>
          </p>

          {/* gamma slider */}
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor={gammaId} className="w-8 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300">
              &#947;
            </label>
            <input
              id={gammaId}
              type="range"
              min={0}
              max={Math.PI}
              step={Math.PI / 60}
              value={gamma}
              onChange={(e) => setGamma(parseFloat(e.target.value))}
              className="slider flex-1 focus-ring"
              aria-label="QAOA cost angle gamma in radians"
              aria-valuetext={`${gamma.toFixed(2)} radians`}
            />
            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {gamma.toFixed(2)}
            </span>
          </div>

          {/* beta slider */}
          <div className="mt-2 flex items-center gap-3">
            <label htmlFor={betaId} className="w-8 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300">
              &#946;
            </label>
            <input
              id={betaId}
              type="range"
              min={0}
              max={Math.PI / 2}
              step={Math.PI / 60}
              value={beta}
              onChange={(e) => setBeta(parseFloat(e.target.value))}
              className="slider flex-1 focus-ring"
              aria-label="QAOA mixer angle beta in radians"
              aria-valuetext={`${beta.toFixed(2)} radians`}
            />
            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {beta.toFixed(2)}
            </span>
          </div>

          {/* distribution bars */}
          <div className="mt-4 space-y-1.5">
            {distribution.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-12 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                  |{basisLabel(idx, n)}&#10217;
                </span>
                <span className="relative h-3 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
                    style={{ width: `${(p * 100).toFixed(2)}%` }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {(p * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
