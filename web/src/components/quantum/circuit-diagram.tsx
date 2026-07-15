"use client";

import { memo } from "react";
import { ROT, type Program } from "./qsim-dsl";
import { gateLabel } from "./widget-ui";
import { layoutCircuit, type GateFamily } from "./circuit-layout";

/**
 * A read-only, live-updating SVG rendering of the LAST-GOOD program under the
 * playground editor (the Quirk principle — a broken keystroke never blanks it;
 * the bench passes `stale` instead). Presentational and memo'd: it holds no
 * state and re-renders only when `program` or `stale` change.
 *
 * Every circuit here is measured on all qubits at submit, so a measure stage is
 * ALWAYS appended and the classical register is drawn — the diagram teaches the
 * full "prepare |0>, apply gates, measure" arc, not just the unitary.
 */

// Geometry (px). Wire i sits at TOP + i*PITCH_Y; the classical rail one pitch
// below the last wire.
const GUTTER = 52; // wire-label column (q{i} + initial ket)
const TOP = 26;
const PITCH_Y = 48;
const BOX = 32; // single-qubit / measure box (square)
const BOX_RX = 4;
const W_ROT = 52; // wider box for the two-line RX/RY/RZ label
const COL_GAP = 20; // added to the widest box in a column
const RIGHT_PAD = 12; // between the measure column and the SVG right edge
const BOTTOM_PAD = 22; // below the classical rail

// The default Qiskit "iqp" / "iqp-dark" palette (IBM Carbon), the syntax
// highlighting a learner meets in every Qiskit doc. These hexes are the
// domain's convention — do NOT harmonize them with the site accent.
// Source: qiskit/visualization/circuit/styles/iqp.json and iqp-dark.json.
const FAMILY_STYLE: Record<GateFamily, { box: string; text: string }> = {
  h: { box: "fill-[#FA4D56]", text: "fill-black" },
  x: { box: "fill-[#002D9C] dark:fill-[#4589FF]", text: "fill-white dark:fill-black" },
  rot: { box: "fill-[#9F1853] dark:fill-[#FF7EB6]", text: "fill-white dark:fill-black" },
  phase: { box: "fill-[#33B1FF] dark:fill-[#BAE6FF]", text: "fill-black" },
};
// The x-family color also strokes the CNOT dot, connector, and target disk.
const CNOT_FILL = "fill-[#002D9C] dark:fill-[#4589FF]";
const CNOT_STROKE = "stroke-[#002D9C] dark:stroke-[#4589FF]";
const MEASURE_BOX = "fill-[#A8A8A8] dark:fill-[#8D8D8D]";

const isRot = (name: string) => ROT.has(name);
const boxWidthFor = (name: string) => (isRot(name) ? W_ROT : BOX);

/** The angle glyph inside a rotation box — mirrors gateLabel() so chips and the
 * diagram never drift: a slider-bound angle shows θ, a literal its 2-dp value. */
function angleText(theta: number | undefined, bound: boolean | undefined): string {
  return bound ? "θ" : (theta ?? 0).toFixed(2);
}

function ariaSentence(program: Program, n: number, depth: number): string {
  const s = n === 1 ? "" : "s";
  if (program.gates.length === 0) {
    return `Quantum circuit: ${n} qubit${s}, no gates. All qubits measured.`;
  }
  const list = program.gates.map((g) => gateLabel(g)).join("; ");
  return `Quantum circuit: ${n} qubit${s}, depth ${depth}. ${list}. All qubits measured.`;
}

export const CircuitDiagram = memo(function CircuitDiagram({
  program,
  stale = false,
}: {
  program: Program;
  stale?: boolean;
}) {
  const layout = layoutCircuit(program);
  const { n, cols, depth, gates } = layout;

  // Column widths: widest box in the column + a fixed gap. Cumulative left
  // edges from the gutter; every gate is centered in its column slot. Geometry
  // runs on `cols` (visual columns); only the aria sentence speaks of `depth`.
  const colWidths = new Array<number>(cols).fill(0);
  for (const p of gates) {
    colWidths[p.col] = Math.max(colWidths[p.col], boxWidthFor(p.g.gate));
  }
  for (let c = 0; c < cols; c++) colWidths[c] += COL_GAP;

  const colCenterX = new Array<number>(cols).fill(0);
  let cursor = GUTTER;
  for (let c = 0; c < cols; c++) {
    colCenterX[c] = cursor + colWidths[c] / 2;
    cursor += colWidths[c];
  }
  const measureWidth = BOX + COL_GAP;
  const measureCenterX = cursor + measureWidth / 2;

  const wireY = (i: number) => TOP + i * PITCH_Y;
  const yRail = TOP + n * PITCH_Y;
  const W = cursor + measureWidth + RIGHT_PAD;
  const H = yRail + BOTTOM_PAD;
  const wireX2 = W - 8;

  const wires = Array.from({ length: n }, (_, i) => i);
  const sentence = ariaSentence(program, n, depth);

  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Circuit diagram, scrollable"
      className={`mt-3 overflow-x-auto rounded-control border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700/50 dark:bg-gray-900/50 focus-ring ${
        stale ? "opacity-50" : ""
      } transition-opacity motion-reduce:transition-none`}
    >
      <svg role="img" aria-label={sentence} width={W} height={H} className="block">
        {/* Layer 1: wires + gutter labels */}
        {wires.map((i) => (
          <line
            key={`wire-${i}`}
            x1={GUTTER}
            y1={wireY(i)}
            x2={wireX2}
            y2={wireY(i)}
            className="stroke-gray-700 dark:stroke-gray-300 stroke-[1.5]"
          />
        ))}
        {wires.map((i) => (
          <g key={`label-${i}`} aria-hidden="true">
            <text
              x={5}
              y={wireY(i)}
              dominantBaseline="central"
              className="fill-gray-500 dark:fill-gray-400 font-mono text-[10px]"
            >
              q{i}
            </text>
            <text
              x={24}
              y={wireY(i)}
              dominantBaseline="central"
              className="fill-gray-500 dark:fill-gray-400 font-mono text-[9px]"
            >
              |0&#10217;
            </text>
          </g>
        ))}

        {/* Classical rail: a doubled line one pitch below the last wire, with
            the bundled-register slash + bit count. */}
        <line
          x1={GUTTER}
          y1={yRail - 1.5}
          x2={wireX2}
          y2={yRail - 1.5}
          className="stroke-gray-400 dark:stroke-gray-500 stroke-[1.5]"
        />
        <line
          x1={GUTTER}
          y1={yRail + 1.5}
          x2={wireX2}
          y2={yRail + 1.5}
          className="stroke-gray-400 dark:stroke-gray-500 stroke-[1.5]"
        />
        <line
          x1={GUTTER + 4}
          y1={yRail + 4}
          x2={GUTTER + 12}
          y2={yRail - 4}
          className="stroke-gray-400 dark:stroke-gray-500 stroke-[1.5]"
          aria-hidden="true"
        />
        <text
          x={5}
          y={yRail}
          dominantBaseline="central"
          aria-hidden="true"
          className="fill-gray-500 dark:fill-gray-400 font-mono text-[10px]"
        >
          c
        </text>
        <text
          x={GUTTER + 15}
          y={yRail - 5}
          aria-hidden="true"
          className="fill-gray-500 dark:fill-gray-400 font-mono text-[9px]"
        >
          {n}
        </text>

        {/* Layer 2: connectors — CNOT verticals + meter drops to the rail. */}
        {gates
          .filter((p) => p.g.gate === "CNOT")
          .map((p, i) => (
            <line
              key={`conn-${i}`}
              x1={colCenterX[p.col]}
              y1={wireY(p.g.control ?? 0)}
              x2={colCenterX[p.col]}
              y2={wireY(p.g.target)}
              className={`${CNOT_STROKE} stroke-[2]`}
            />
          ))}
        {wires.map((i) => {
          const top = wireY(i) + BOX / 2;
          const base = yRail - 6;
          return (
            <g key={`drop-${i}`} aria-hidden="true">
              <line
                x1={measureCenterX - 1.5}
                y1={top}
                x2={measureCenterX - 1.5}
                y2={base}
                className="stroke-gray-400 dark:stroke-gray-500 stroke-[1.5]"
              />
              <line
                x1={measureCenterX + 1.5}
                y1={top}
                x2={measureCenterX + 1.5}
                y2={base}
                className="stroke-gray-400 dark:stroke-gray-500 stroke-[1.5]"
              />
              <polygon
                points={`${measureCenterX - 4},${base} ${measureCenterX + 4},${base} ${measureCenterX},${yRail}`}
                className="fill-gray-400 dark:fill-gray-500"
              />
            </g>
          );
        })}

        {/* Layer 3: boxes and disks. */}
        {gates.map((p, i) => {
          if (p.g.gate === "CNOT") {
            return (
              <g key={`disk-${i}`}>
                <circle
                  cx={colCenterX[p.col]}
                  cy={wireY(p.g.control ?? 0)}
                  r={4.5}
                  className={CNOT_FILL}
                />
                <circle
                  cx={colCenterX[p.col]}
                  cy={wireY(p.g.target)}
                  r={11}
                  className={CNOT_FILL}
                />
              </g>
            );
          }
          const w = boxWidthFor(p.g.gate);
          return (
            <rect
              key={`box-${i}`}
              x={colCenterX[p.col] - w / 2}
              y={wireY(p.g.target) - BOX / 2}
              width={w}
              height={BOX}
              rx={BOX_RX}
              className={FAMILY_STYLE[p.family].box}
            />
          );
        })}
        {wires.map((i) => (
          <rect
            key={`meter-box-${i}`}
            data-testid="meter"
            x={measureCenterX - BOX / 2}
            y={wireY(i) - BOX / 2}
            width={BOX}
            height={BOX}
            rx={BOX_RX}
            className={MEASURE_BOX}
          />
        ))}

        {/* Layer 4: glyphs — gate labels, CNOT plus, meter dials. */}
        {gates.map((p, i) => {
          const cx = colCenterX[p.col];
          if (p.g.gate === "CNOT") {
            const cy = wireY(p.g.target);
            return (
              <g key={`plus-${i}`} aria-hidden="true" className="stroke-white dark:stroke-gray-900 stroke-[2]">
                <line x1={cx - 6.5} y1={cy} x2={cx + 6.5} y2={cy} />
                <line x1={cx} y1={cy - 6.5} x2={cx} y2={cy + 6.5} />
              </g>
            );
          }
          const cy = wireY(p.g.target);
          if (isRot(p.g.gate)) {
            return (
              <g key={`glyph-${i}`} aria-hidden="true" textAnchor="middle" className={FAMILY_STYLE[p.family].text}>
                <text x={cx} y={cy - 6} className="font-mono text-[11px]">
                  {p.g.gate}
                </text>
                <text x={cx} y={cy + 8} className="font-mono text-[9px]">
                  {angleText(p.g.theta, p.g.bound)}
                </text>
              </g>
            );
          }
          return (
            <text
              key={`glyph-${i}`}
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              aria-hidden="true"
              className={`${FAMILY_STYLE[p.family].text} font-mono text-[12px]`}
            >
              {p.g.gate}
            </text>
          );
        })}
        {wires.map((i) => (
          // Local coords translated to the meter box center: a 180-degree dial
          // arc plus a needle, the standard measurement glyph.
          <g
            key={`meter-glyph-${i}`}
            aria-hidden="true"
            transform={`translate(${measureCenterX} ${wireY(i)})`}
            className="stroke-black fill-none stroke-[1.8]"
          >
            <path d="M -9,5 A 9,7 0 0 1 9,5" />
            <line x1={0} y1={5} x2={7} y2={-5} />
          </g>
        ))}
      </svg>
    </div>
  );
});
