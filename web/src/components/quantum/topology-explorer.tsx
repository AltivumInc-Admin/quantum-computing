"use client";

import { useMemo, useState } from "react";
import { ErrorCard as SharedErrorCard } from "./widget-ui";
import { adjacency, swapCost, type Topology } from "./topology";

const TOPOLOGIES: Topology[] = ["all-to-all", "line", "ring", "grid"];
const MAX_QUBITS = 16;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function linePositions(n: number, w: number, h: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [
    (w * (i + 1)) / (n + 1),
    h / 2,
  ]);
}

function circlePositions(n: number, w: number, h: number): [number, number][] {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.38;
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
}

function gridPositions(n: number, w: number, h: number): [number, number][] {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const padX = w * 0.12;
  const padY = h * 0.12;
  const colStep = cols > 1 ? (w - 2 * padX) / (cols - 1) : 0;
  const rowStep = rows > 1 ? (h - 2 * padY) / (rows - 1) : 0;
  return Array.from({ length: n }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return [padX + col * colStep, padY + row * rowStep];
  });
}

function nodePositions(
  topo: Topology,
  n: number,
  w: number,
  h: number
): [number, number][] {
  if (topo === "line") return linePositions(n, w, h);
  if (topo === "grid") return gridPositions(n, w, h);
  // ring and all-to-all both use circle layout
  return circlePositions(n, w, h);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ParsedConfig {
  topology: Topology;
  qubits: number;
  gate: [number, number];
}

function parseSource(
  source: string
): { ok: true; config: ParsedConfig } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "expected a JSON object" };
  }
  const obj = raw as Record<string, unknown>;

  const topo = obj["topology"];
  if (!TOPOLOGIES.includes(topo as Topology)) {
    return {
      ok: false,
      error: `"topology" must be one of: ${TOPOLOGIES.join(", ")}`,
    };
  }

  const qubits = obj["qubits"];
  if (
    typeof qubits !== "number" ||
    !Number.isInteger(qubits) ||
    qubits < 2
  ) {
    return { ok: false, error: '"qubits" must be a positive integer >= 2' };
  }
  if (qubits > MAX_QUBITS) {
    return {
      ok: false,
      error: `"qubits" must be <= ${MAX_QUBITS}`,
    };
  }

  const gate = obj["gate"];
  if (
    !Array.isArray(gate) ||
    gate.length !== 2 ||
    typeof gate[0] !== "number" ||
    typeof gate[1] !== "number"
  ) {
    return { ok: false, error: '"gate" must be a 2-element array of integers' };
  }
  const [a, b] = gate as [number, number];
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return { ok: false, error: '"gate" indices must be integers' };
  }
  if (a < 0 || a >= qubits || b < 0 || b >= qubits) {
    return {
      ok: false,
      error: `"gate" indices must be in range [0, ${qubits - 1}]`,
    };
  }
  if (a === b) {
    return { ok: false, error: '"gate" indices must be distinct' };
  }

  return {
    ok: true,
    config: { topology: topo as Topology, qubits, gate: [a, b] },
  };
}

// ---------------------------------------------------------------------------
// SVG graph
// ---------------------------------------------------------------------------

const SVG_W = 300;
const SVG_H = 200;
const NODE_R = 10;

interface GraphProps {
  topo: Topology;
  n: number;
  gateA: number;
  gateB: number;
  path: number[];
}

function TopologyGraph({ topo, n, gateA, gateB, path }: GraphProps) {
  const positions = useMemo(
    () => nodePositions(topo, n, SVG_W, SVG_H),
    [topo, n]
  );

  const adj = useMemo(() => adjacency(topo, n), [topo, n]);

  // Build a set of path edges for quick lookup
  const pathEdgeSet = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i < path.length - 1; i++) {
      const u = Math.min(path[i], path[i + 1]);
      const v = Math.max(path[i], path[i + 1]);
      s.add(`${u}-${v}`);
    }
    return s;
  }, [path]);

  const edges = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; highlighted: boolean }[] = [];
    for (let u = 0; u < n; u++) {
      for (const v of adj[u]) {
        if (v > u) {
          const [x1, y1] = positions[u];
          const [x2, y2] = positions[v];
          out.push({ x1, y1, x2, y2, highlighted: pathEdgeSet.has(`${u}-${v}`) });
        }
      }
    }
    return out;
  }, [positions, adj, pathEdgeSet, n]);

  const swaps = Math.max(0, path.length - 2);
  const ariaLabel = `${topo} topology with ${n} qubits. Gate targets q${gateA} and q${gateB}. Shortest path requires ${swaps} SWAP${swaps !== 1 ? "s" : ""}.`;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width={SVG_W}
      height={SVG_H}
      role="img"
      aria-label={ariaLabel}
      className="w-full max-w-xs mx-auto block"
    >
      {/* Faint edges */}
      {edges
        .filter((e) => !e.highlighted)
        .map((e, i) => (
          <line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="currentColor"
            strokeWidth={1}
            className="text-gray-300 dark:text-gray-600"
            strokeOpacity={0.5}
          />
        ))}
      {/* Highlighted path edges */}
      {edges
        .filter((e) => e.highlighted)
        .map((e, i) => (
          <line
            key={`h-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="currentColor"
            strokeWidth={2.5}
            className="text-accent dark:text-accent-light"
          />
        ))}
      {/* Nodes */}
      {positions.map(([cx, cy], i) => {
        const isGate = i === gateA || i === gateB;
        return (
          <g key={i}>
            <circle
              cx={cx}
              cy={cy}
              r={NODE_R}
              className={
                isGate
                  ? "fill-accent dark:fill-accent-light stroke-white dark:stroke-gray-900"
                  : "fill-gray-100 dark:fill-gray-700 stroke-gray-400 dark:stroke-gray-500"
              }
              strokeWidth={isGate ? 2 : 1}
            />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={7}
              className={
                isGate
                  ? "fill-white dark:fill-gray-900 font-semibold"
                  : "fill-gray-600 dark:fill-gray-300"
              }
              aria-hidden="true"
            >
              {i}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="topology" message={message} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TopologyExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  const [qaOverride, setQaOverride] = useState<number | null>(null);
  const [qbOverride, setQbOverride] = useState<number | null>(null);

  // Compute everything in one memo BEFORE any early return, so the hooks above
  // always run in the same order (react-hooks/rules-of-hooks). Null on parse error.
  const view = useMemo(() => {
    if (!parsed.ok) return null;
    const { topology, qubits, gate } = parsed.config;
    const gateA = qaOverride !== null ? qaOverride : gate[0];
    const gateB = qbOverride !== null ? qbOverride : gate[1];
    // Keep the two selects distinct by clamping if they collide.
    const safeA = gateA === gateB ? (gateB + 1) % qubits : gateA;
    const safeB = safeA === gateB ? (safeA + 1) % qubits : gateB;
    const { path, swaps } = swapCost(topology, qubits, safeA, safeB);
    return { topology, qubits, safeA, safeB, path, swaps };
  }, [parsed, qaOverride, qbOverride]);

  if (!view) {
    return <ErrorCard message={parsed.ok ? "topology error" : parsed.error} />;
  }

  const { topology, qubits, safeA, safeB, path, swaps } = view;
  const qubitOptions = Array.from({ length: qubits }, (_, i) => i);

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Connectivity
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          {topology}
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          {qubits}q
        </span>
      </div>

      {/* Graph */}
      <div className="px-4 pt-4">
        <TopologyGraph
          topo={topology}
          n={qubits}
          gateA={safeA}
          gateB={safeB}
          path={path}
        />
      </div>

      {/* Readout */}
      <div className="px-4 pt-3 pb-1" role="status" aria-live="polite">
        <p className="text-sm text-gray-800 dark:text-gray-200">
          <span className="font-semibold">
            {swaps} SWAP{swaps !== 1 ? "s" : ""}
          </span>{" "}
          to make q{safeA} and q{safeB} adjacent{" "}
          <span className="text-gray-500 dark:text-gray-400">
            (+{swaps * 3} two-qubit gates)
          </span>
        </p>
        {path.length > 0 && (
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 font-mono">
            path: {path.join(" - ")}
          </p>
        )}
      </div>

      {/* Qubit selectors */}
      <div className="flex items-center gap-3 px-4 pb-4 pt-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          q1
          <select
            value={safeA}
            onChange={(e) => setQaOverride(Number(e.target.value))}
            className="rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 focus-ring"
          >
            {qubitOptions
              .filter((i) => i !== safeB)
              .map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          q2
          <select
            value={safeB}
            onChange={(e) => setQbOverride(Number(e.target.value))}
            className="rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 focus-ring"
          >
            {qubitOptions
              .filter((i) => i !== safeA)
              .map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
          </select>
        </label>
      </div>
    </div>
  );
}
