"use client";

import { useMemo, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, LabeledSlider, WidgetCard } from "./widget-ui";
import { H2 as H } from "./h2-data";
import { h2Energies, oneQubitGroundEnergy } from "./chemistry";
import { parseJsonObject } from "./parse-utils";
import { formatHartree, hartreeSR, angstromSR } from "./format";

/**
 * Inline potential-energy-surface explorer rendered from a ```qpes fenced block.
 * Reads the committed STO-3G H2 dissociation fixture (h2-data.ts) and plots two
 * curves versus bond length R: the STO-3G full-CI (FCI) dissociation curve and
 * the restricted Hartree-Fock (HF) curve. Sparse VQE dots are overlaid at
 * (R, c0 - hypot(cz, cx)) — the analytic ground energy of the tapered
 * single-qubit Hamiltonian c0 I + cz Z + cx X — to show they land on the FCI
 * curve. A draggable scrubber reads out FCI, HF, and the HF-FCI gap (static
 * correlation energy) at the chosen R, and a callout explains why restricted HF
 * fails to dissociate. Fence body (optional) `{ "mark": 0.75 }` sets the initial
 * scrubber; empty marks the equilibrium bond length. Pure client, no SSR/AWS.
 */

const PLOT = { w: 320, h: 200, padL: 40, padR: 12, padT: 12, padB: 28 };
const VQE_STRIDE = 6; // overlay a VQE dot every Nth fixture point

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

type ParseResult = { ok: true; mark: number } | { ok: false; error: string };

function parseSource(source: string): ParseResult {
  const equilibrium = H.equilibrium.R;
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj === null) return { ok: true, mark: equilibrium };
  const obj = base.obj;
  const m = obj["mark"];
  if (m === undefined) return { ok: true, mark: equilibrium };
  if (typeof m !== "number" || !Number.isFinite(m)) {
    return { ok: false, error: '"mark" must be a finite number' };
  }
  const lo = H.points[0].R;
  const hi = H.points[H.points.length - 1].R;
  if (m < lo || m > hi) {
    return { ok: false, error: `"mark" must be within [${lo}, ${hi}] angstrom` };
  }
  return { ok: true, mark: m };
}


// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="qpes" message={message} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PesExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  // Geometry of the curves + axis bounds — keyed on the (static) fixture.
  const geom = useMemo(() => {
    const points = H.points;
    const rs = points.map((p) => p.R);
    const rMin = rs[0];
    const rMax = rs[rs.length - 1];

    const energies = points.flatMap((p) => [p.fci, p.hf]);
    const eMin = Math.min(...energies);
    const eMax = Math.max(...energies);
    const ePad = (eMax - eMin) * 0.06;
    const yLo = eMin - ePad;
    const yHi = eMax + ePad;

    const innerW = PLOT.w - PLOT.padL - PLOT.padR;
    const innerH = PLOT.h - PLOT.padT - PLOT.padB;
    const sx = (R: number) => PLOT.padL + ((R - rMin) / (rMax - rMin)) * innerW;
    const sy = (E: number) => PLOT.padT + ((yHi - E) / (yHi - yLo)) * innerH;

    const toPath = (vals: number[]) =>
      points
        .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.R).toFixed(2)},${sy(vals[i]).toFixed(2)}`)
        .join(" ");

    const fciPath = toPath(points.map((p) => p.fci));
    const hfPath = toPath(points.map((p) => p.hf));

    const vqeDots = points
      .filter((_, i) => i % VQE_STRIDE === 0)
      .map((p) => ({ R: p.R, x: sx(p.R), y: sy(oneQubitGroundEnergy(p.c0, p.cz, p.cx)) }));

    // Equilibrium (minimum FCI) marker.
    const eqR = H.equilibrium.R;
    const eqFci = H.equilibrium.fci;
    // Well depth: right-edge FCI minus minimum FCI (in Ha).
    const rightFci = points[points.length - 1].fci;
    const wellDepth = rightFci - eqFci;
    // Dissociation asymptote: right-edge FCI energy.
    const asymptote = rightFci;

    return {
      points,
      rMin,
      rMax,
      yLo,
      yHi,
      sx,
      sy,
      fciPath,
      hfPath,
      vqeDots,
      eqR,
      eqFci,
      wellDepth,
      asymptote,
    };
  }, []);

  const [mark, setMark] = useState(() =>
    parsed.ok ? parsed.mark : H.equilibrium.R
  );

  // Read FCI/HF/gap at the current scrubber position.
  const readout = useMemo(() => {
    const { fci, hf } = h2Energies(mark, geom.points);
    return { fci, hf, gap: hf - fci };
  }, [mark, geom.points]);

  // The parse/error early-return happens only AFTER all hooks are declared.
  if (!parsed.ok) {
    return <ErrorCard message={parsed.error} />;
  }

  const { sx, sy, rMin, rMax, yLo, yHi } = geom;
  const markX = sx(mark);
  const markFciY = sy(readout.fci);
  const markHfY = sy(readout.hf);

  const plotAria =
    `STO-3G H2 potential energy surface. Bond length from ${angstromSR(rMin)} to ` +
    `${angstromSR(rMax)} on the x axis, energy from ${hartreeSR(yHi, 2)} to ` +
    `${hartreeSR(yLo, 2)} on the y axis. The FCI curve has its minimum near ` +
    `${angstromSR(geom.eqR)}; at the marker ${angstromSR(mark)} the ` +
    `FCI energy is ${hartreeSR(readout.fci, 3)}, the Hartree-Fock energy is ` +
    `${hartreeSR(readout.hf, 3)}, and the correlation gap is ` +
    `${hartreeSR(readout.gap, 3)}.`;

  return (
    <WidgetCard
      eyebrow="Potential energy surface"
      chips={
        <>
          <Chip>H&#8322; dissociation</Chip>
          <span className="rounded-chip bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[11px] font-mono text-amber-700 dark:text-amber-300">
            STO-3G minimal basis
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Plot */}
        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${PLOT.w} ${PLOT.h}`}
            width={PLOT.w}
            height={PLOT.h}
            role="img"
            aria-label={plotAria}
            className="w-full max-w-[360px] mx-auto block"
          >
            {/* axes */}
            <line
              x1={PLOT.padL}
              y1={PLOT.padT}
              x2={PLOT.padL}
              y2={PLOT.h - PLOT.padB}
              stroke="currentColor"
              strokeWidth={1}
              className="text-gray-300 dark:text-gray-600"
            />
            <line
              x1={PLOT.padL}
              y1={PLOT.h - PLOT.padB}
              x2={PLOT.w - PLOT.padR}
              y2={PLOT.h - PLOT.padB}
              stroke="currentColor"
              strokeWidth={1}
              className="text-gray-300 dark:text-gray-600"
            />

            {/* dissociation asymptote */}
            <line
              x1={PLOT.padL}
              y1={sy(geom.asymptote)}
              x2={PLOT.w - PLOT.padR}
              y2={sy(geom.asymptote)}
              stroke="currentColor"
              strokeWidth={0.8}
              strokeDasharray="3 3"
              className="text-gray-400 dark:text-gray-500"
            />

            {/* HF curve */}
            <path
              d={geom.hfPath}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinejoin="round"
              className="text-gray-500 dark:text-gray-400"
            />
            {/* FCI curve */}
            <path
              d={geom.fciPath}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinejoin="round"
              className="text-accent dark:text-accent-light"
            />

            {/* sparse VQE dots — land on the FCI curve */}
            {geom.vqeDots.map((d, i) => (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={2.4}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.2}
                className="text-gray-900 dark:text-white"
              />
            ))}

            {/* equilibrium marker (minimum FCI) */}
            <circle
              cx={sx(geom.eqR)}
              cy={sy(geom.eqFci)}
              r={3}
              className="fill-amber-500 dark:fill-amber-400"
            />

            {/* scrubber position + FCI/HF readout dots */}
            <line
              x1={markX}
              y1={PLOT.padT}
              x2={markX}
              y2={PLOT.h - PLOT.padB}
              stroke="currentColor"
              strokeWidth={1}
              className="text-gray-400/70 dark:text-gray-500/70"
            />
            <circle
              cx={markX}
              cy={markHfY}
              r={3}
              className="fill-gray-600 dark:fill-gray-300"
            />
            <circle
              cx={markX}
              cy={markFciY}
              r={3}
              className="fill-accent dark:fill-accent-light"
            />

            {/* axis labels (decorative) */}
            <text
              x={PLOT.padL + (PLOT.w - PLOT.padL - PLOT.padR) / 2}
              y={PLOT.h - 6}
              textAnchor="middle"
              fontSize={9}
              className="fill-gray-500 dark:fill-gray-400 font-mono"
              aria-hidden="true"
            >
              bond length R (&#8491;)
            </text>
            <text
              x={10}
              y={PLOT.padT + (PLOT.h - PLOT.padT - PLOT.padB) / 2}
              textAnchor="middle"
              fontSize={9}
              transform={`rotate(-90 10 ${PLOT.padT + (PLOT.h - PLOT.padT - PLOT.padB) / 2})`}
              className="fill-gray-500 dark:fill-gray-400 font-mono"
              aria-hidden="true"
            >
              energy (Ha)
            </text>
          </svg>

          {/* legend */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-mono text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-accent dark:bg-accent-light" aria-hidden="true" />
              STO-3G FCI
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-gray-500 dark:bg-gray-400" aria-hidden="true" />
              restricted HF
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full border border-gray-900 dark:border-white" aria-hidden="true" />
              VQE
            </span>
          </div>
        </div>

        {/* Controls + readout */}
        <div className="min-w-0 sm:w-56 sm:shrink-0">
          {/* scrubber */}
          <LabeledSlider
            label="R"
            value={mark}
            min={rMin}
            max={rMax}
            step={0.01}
            onChange={setMark}
            ariaLabel="Bond length scrubber in angstrom"
            ariaValueText={`${angstromSR(mark)}; FCI ${hartreeSR(readout.fci, 3)}, Hartree-Fock ${hartreeSR(readout.hf, 3)}, gap ${hartreeSR(readout.gap, 3)}`}
            display={<>{mark.toFixed(2)} &#8491;</>}
          />

          {/* readout */}
          <dl className="mt-4 space-y-1.5 font-mono text-xs tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-accent dark:text-accent-light">FCI</dt>
              <dd className="text-gray-800 dark:text-gray-100">{formatHartree(readout.fci)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-gray-500 dark:text-gray-400">HF</dt>
              <dd className="text-gray-800 dark:text-gray-100">{formatHartree(readout.hf)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-gray-500 dark:text-gray-400">HF &minus; FCI gap</dt>
              <dd className="font-semibold text-gray-900 dark:text-white">
                {formatHartree(readout.gap)}
              </dd>
            </div>
          </dl>

          {/* equilibrium / well-depth facts */}
          <dl className="mt-3 space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3 font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            <div className="flex items-center justify-between gap-2">
              <dt>equilibrium R</dt>
              <dd className="text-gray-700 dark:text-gray-200">{geom.eqR.toFixed(2)} &#8491;</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt>min FCI</dt>
              <dd className="text-gray-700 dark:text-gray-200">{formatHartree(geom.eqFci)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt>well depth</dt>
              <dd className="text-gray-700 dark:text-gray-200">{formatHartree(geom.wellDepth)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt>asymptote</dt>
              <dd className="text-gray-700 dark:text-gray-200">{formatHartree(geom.asymptote)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Teaching callout */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
          As the bond breaks, the HF&minus;FCI gap (static correlation) widens:
          restricted Hartree-Fock keeps both electrons paired in one spatial
          orbital and cannot describe the two atoms pulling apart, so it fails to
          dissociate. Full CI captures the multi-reference character and bends to
          the correct asymptote. The VQE markers sit on the FCI curve because the
          tapered single-qubit ansatz reaches the exact STO-3G ground energy.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-caption">
          Honesty note: this is the STO-3G FCI curve, not the experimental exact
          PES. A minimal basis recovers full correlation only within its own tiny
          orbital space; the true potential energy surface needs a far larger
          basis.
        </p>
      </div>
    </WidgetCard>
  );
}
