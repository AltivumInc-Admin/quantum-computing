"use client";

import { useMemo, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, WidgetCard, fieldClass } from "./widget-ui";
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

/**
 * The drawn node radius. Only the line layout scales its spacing with n while
 * the radius stays fixed: nodes sit SVG_W/(n+1) apart, which drops below the
 * 2*NODE_R diameter at n >= 15 — inside the widget's own advertised ceiling
 * (MAX_QUBITS = 16, where the spacing is 17.6px against 20px of node), so a
 * legal `{"topology":"line","qubits":16}` fence rendered as overlapping disks
 * with an unreadable SWAP path. Capping the radius at 45% of the spacing leaves
 * a visible gap at every legal n. The circle layout (r = 0.38*min(w,h) gives a
 * 29.7px chord at n = 16) and the grid layout (76 x 50.7 steps) never collide,
 * so they keep the full radius.
 */
function nodeRadius(topo: Topology, n: number): number {
  if (topo !== "line") return NODE_R;
  return Math.min(NODE_R, (SVG_W / (n + 1)) * 0.45);
}

interface GraphProps {
  topo: Topology;
  n: number;
  gateA: number;
  gateB: number;
  path: number[];
  swaps: number;
}

function TopologyGraph({ topo, n, gateA, gateB, path, swaps }: GraphProps) {
  const positions = useMemo(
    () => nodePositions(topo, n, SVG_W, SVG_H),
    [topo, n]
  );

  const adj = useMemo(() => adjacency(topo, n), [topo, n]);

  const r = nodeRadius(topo, n);

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

  const ariaLabel = `${topo} topology with ${n} qubits. Gate targets q${gateA} and q${gateB}. Shortest path requires ${swaps} SWAP${swaps !== 1 ? "s" : ""}.`;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
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
            className="text-accent-dark dark:text-accent-light"
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
              r={r}
              className={
                isGate
                  ? // fill-accent-dark, not fill-accent: the white numeral on
                    // the raw light accent computes 3.04:1, below the 4.5:1 AA
                    // floor for this ~7.5px label. accent-dark takes it to
                    // 5.38:1. (Dark theme's accent-light/gray-900 is 12.2:1.)
                    "fill-accent-dark dark:fill-accent-light stroke-white dark:stroke-gray-900"
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
    <WidgetCard
      eyebrow="Connectivity"
      chips={
        <>
          <Chip>{topology}</Chip>
          <Chip>{qubits}q</Chip>
        </>
      }
    >
      {/* Graph */}
      <div className="px-4 pt-4">
        <TopologyGraph
          topo={topology}
          n={qubits}
          gateA={safeA}
          gateB={safeB}
          path={path}
          swaps={swaps}
        />
      </div>

      {/* Readout */}
      <div className="px-4 pt-3 pb-1" role="status" aria-live="polite">
        <p className="text-sm text-(--ink)">
          <span className="font-semibold">
            {swaps} SWAP{swaps !== 1 ? "s" : ""}
          </span>{" "}
          to make q{safeA} and q{safeB} adjacent{" "}
          <span className="text-caption">
            (+{swaps * 3} two-qubit gates)
          </span>
        </p>
        {path.length > 0 && (
          <p className="mt-0.5 text-xs text-caption font-mono">
            path: {path.join(" - ")}
          </p>
        )}
      </div>

      {/* Qubit selectors */}
      <div className="flex items-center gap-3 px-4 pb-4 pt-2">
        <label className="flex items-center gap-1.5 text-xs text-caption">
          Qubit A
          <select
            value={safeA}
            onChange={(e) => setQaOverride(Number(e.target.value))}
            className={`${fieldClass} px-2 py-1 text-xs`}
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
        <label className="flex items-center gap-1.5 text-xs text-caption">
          Qubit B
          <select
            value={safeB}
            onChange={(e) => setQbOverride(Number(e.target.value))}
            className={`${fieldClass} px-2 py-1 text-xs`}
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
    </WidgetCard>
  );
}
