"use client";

import { useMemo, useState } from "react";
import { Chip, ErrorCard, LabeledSlider, WidgetCard } from "./widget-ui";
import { extent, linearScale, linePath, plotInner, type Plot } from "./chart-utils";
import { H2, R_MAX, R_MIN, R_PITCH } from "./h2-data";
import { h2Energies, oneQubitGroundEnergy } from "./chemistry";
import { parseJsonObject, readNumberInRange } from "./parse-utils";
import { formatFixed, formatHartree, formatAngstrom, hartreeSR, angstromSR } from "./format";

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

const PLOT: Plot = { w: 320, h: 200, padL: 40, padR: 12, padT: 12, padB: 28 };
const { innerW, innerH } = plotInner(PLOT);
const VQE_STRIDE = 6; // overlay a VQE dot every Nth fixture point

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

type ParseResult = { ok: true; mark: number } | { ok: false; error: string };

function parseSource(source: string): ParseResult {
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj === null) return { ok: true, mark: H2.equilibrium.R };
  const m = readNumberInRange(
    base.obj,
    "mark",
    H2.equilibrium.R,
    R_MIN,
    R_MAX,
    "angstrom"
  );
  if (!m.ok) return m;
  return { ok: true, mark: m.value };
}

/** Snap onto the fixture's sampling grid — the lattice the scrubber steps on. */
function snapR(R: number): number {
  const n = Math.round((R - R_MIN) / R_PITCH);
  return Math.min(R_MAX, Math.max(R_MIN, R_MIN + n * R_PITCH));
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PesExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  // Geometry of the curves + axis bounds — keyed on the (static) fixture.
  const geom = useMemo(() => {
    const points = H2.points;
    const rMin = R_MIN;
    const rMax = R_MAX;

    const energies = points.flatMap((p) => [p.fci, p.hf]);
    const { min: eMin, max: eMax } = extent(energies);
    const ePad = (eMax - eMin) * 0.06;
    const yLo = eMin - ePad;
    const yHi = eMax + ePad;

    const sx = linearScale(rMin, rMax, PLOT.padL, PLOT.padL + innerW);
    const sy = linearScale(yHi, yLo, PLOT.padT, PLOT.padT + innerH);

    const toPath = (vals: number[]) =>
      linePath(points.map((p, i) => ({ x: sx(p.R), y: sy(vals[i]) })));

    const fciPath = toPath(points.map((p) => p.fci));
    const hfPath = toPath(points.map((p) => p.hf));

    const vqeDots = points
      .filter((_, i) => i % VQE_STRIDE === 0)
      .map((p) => ({ R: p.R, x: sx(p.R), y: sy(oneQubitGroundEnergy(p.c0, p.cz, p.cx)) }));

    // Minimum-FCI marker. loadH2Curve pins `equilibrium` to the argmin of
    // `points`, so this coordinate pair is guaranteed to sit ON the FCI path.
    const eqR = H2.equilibrium.R;
    const eqFci = H2.equilibrium.fci;
    // The FCI energy at the RIGHT EDGE of the sampled domain — deliberately not
    // called the dissociation asymptote. H2 is not dissociated at R = 2.70 A:
    // the curve is still climbing 0.28 mHa over the final 0.05 A step, and it
    // sits 1.42 mHa BELOW its own STO-3G limit 2*E(H, STO-3G) = -0.933164 Ha
    // (computed from the STO-3G hydrogen contraction). So `rightDepth` is a
    // lower bound on the well depth, not the well depth.
    const rightFci = points[points.length - 1].fci;
    const rightDepth = rightFci - eqFci;

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
      rightFci,
      rightDepth,
    };
  }, []);

  // Seeded onto the scrubber's own lattice so the thumb, the readout and the
  // aria-valuetext cannot disagree from first paint.
  const [mark, setMark] = useState(() =>
    snapR(parsed.ok ? parsed.mark : H2.equilibrium.R)
  );

  // Read FCI/HF/gap at the current scrubber position.
  const readout = useMemo(() => {
    const { fci, hf } = h2Energies(mark, geom.points);
    return { fci, hf, gap: hf - fci };
  }, [mark, geom.points]);

  // The parse/error early-return happens only AFTER all hooks are declared.
  if (!parsed.ok) {
    return <ErrorCard label="qpes" message={parsed.error} />;
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
          <Chip tone="warn">STO-3G minimal basis</Chip>
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

            {/* right-edge FCI reference (NOT the true dissociation asymptote —
                see the honesty note below) */}
            <line
              x1={PLOT.padL}
              y1={sy(geom.rightFci)}
              x2={PLOT.w - PLOT.padR}
              y2={sy(geom.rightFci)}
              stroke="currentColor"
              strokeWidth={0.8}
              strokeDasharray="3 3"
              className="text-gray-400 dark:text-gray-500"
            />

            {/* HF curve — dashed ("6 3", distinct from the asymptote's "3 3") so the
                two primary curves differ by more than hue (WCAG 1.4.1) */}
            <path
              d={geom.hfPath}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeDasharray="6 3"
              className="text-gray-500 dark:text-gray-400"
            />
            {/* FCI curve */}
            <path
              d={geom.fciPath}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinejoin="round"
              className="text-accent-dark dark:text-accent-light"
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
                className="text-(--ink)"
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

            {/* axis ticks. The plot's aria-label already spells the domain and
                range out for AT; without these a sighted learner could not tell
                where 1 A sits or how deep the well is. Matches the qvqe ticks. */}
            {[rMin, rMax].map((r, i) => (
              <text
                key={`tx-${i}`}
                x={sx(r)}
                y={PLOT.h - PLOT.padB + 9}
                textAnchor={i === 0 ? "start" : "end"}
                fontSize={7}
                className="fill-gray-500 dark:fill-gray-400 font-mono"
                aria-hidden="true"
              >
                {formatFixed(r, 1)}
              </text>
            ))}
            {[yHi, yLo].map((e, i) => (
              <text
                key={`ty-${i}`}
                x={PLOT.padL - 3}
                y={i === 0 ? PLOT.padT + 6 : PLOT.h - PLOT.padB - 1}
                textAnchor="end"
                fontSize={7}
                className="fill-gray-500 dark:fill-gray-400 font-mono"
                aria-hidden="true"
              >
                {formatFixed(e, 2)}
              </text>
            ))}

            {/* axis labels (decorative) */}
            <text
              x={PLOT.padL + innerW / 2}
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
              y={PLOT.padT + innerH / 2}
              textAnchor="middle"
              fontSize={9}
              transform={`rotate(-90 10 ${PLOT.padT + innerH / 2})`}
              className="fill-gray-500 dark:fill-gray-400 font-mono"
              aria-hidden="true"
            >
              energy (Ha)
            </text>
          </svg>

          {/* legend */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-mono text-caption">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-accent dark:bg-accent-light" aria-hidden="true" />
              STO-3G FCI
            </span>
            <span className="inline-flex items-center gap-1.5">
              {/* mini-SVG swatch mirrors the HF curve's dash pattern */}
              <svg width="16" height="2" viewBox="0 0 16 2" aria-hidden="true" className="inline-block">
                <line
                  x1="0"
                  y1="1"
                  x2="16"
                  y2="1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="6 3"
                  className="text-gray-500 dark:text-gray-400"
                />
              </svg>
              restricted HF
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full border border-gray-900 dark:border-white" aria-hidden="true" />
              VQE
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400" aria-hidden="true" />
              equilibrium
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
            // The fixture's own sampling pitch, as the sibling qham slider uses:
            // 0.01 needed ~240 arrow presses to cross the domain and put 4 of
            // every 5 stops on a pure interpolant dressed up as a data point.
            step={R_PITCH}
            onChange={setMark}
            ariaLabel="Bond length scrubber in angstrom"
            ariaValueText={`${angstromSR(mark)}; FCI ${hartreeSR(readout.fci, 3)}, Hartree-Fock ${hartreeSR(readout.hf, 3)}, gap ${hartreeSR(readout.gap, 3)}`}
            display={formatAngstrom(mark)}
          />

          {/* readout */}
          <dl className="mt-4 space-y-1.5 font-mono text-xs tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-accent-dark dark:text-accent-light">FCI</dt>
              <dd className="text-(--ink)">{formatHartree(readout.fci)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-caption">HF</dt>
              <dd className="text-(--ink)">{formatHartree(readout.hf)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-caption">HF &minus; FCI gap</dt>
              <dd className="font-semibold text-(--ink)">
                {formatHartree(readout.gap)}
              </dd>
            </div>
          </dl>

          {/* equilibrium / well-depth facts */}
          <dl className="mt-3 space-y-1.5 border-t border-(--bd) pt-3 font-mono text-xs tabular-nums text-caption">
            {/* Labelled for what these numbers ARE: readings off a curve
                sampled on a 0.05 A grid between 0.30 and 2.70 A, not converged
                molecular constants. */}
            <div className="flex items-center justify-between gap-2">
              <dt>lowest sampled R</dt>
              <dd className="text-(--mut)">{formatAngstrom(geom.eqR)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt>min FCI</dt>
              <dd className="text-(--mut)">{formatHartree(geom.eqFci)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt>FCI at {formatAngstrom(rMax)}</dt>
              <dd className="text-(--mut)">{formatHartree(geom.rightFci)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt>depth to {formatAngstrom(rMax)}</dt>
              <dd className="text-(--mut)">{formatHartree(geom.rightDepth)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Teaching callout */}
      <div className="border-t border-(--bd) px-4 py-3">
        <p className="text-xs leading-relaxed text-(--mut)">
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
          basis. Two limits are visible above. The molecule is not yet
          dissociated at the right edge &mdash; the curve is still climbing, and
          its own STO-3G limit 2&#183;E(H) = &minus;0.9332 Ha sits 1.4 mHa
          <em> above</em> the reading at 2.70 &#8491;, so the dashed line and the
          &ldquo;depth to 2.70 &#8491;&rdquo; figure are a lower bound rather
          than a dissociation energy. And STO-3G overbinds: its full well depth
          is 0.204 Ha (5.55 eV) against the measured 0.174 Ha (4.75 eV), with
          its own minimum near 0.737 &#8491; against the measured 0.741 &#8491;
          &mdash; the 0.75 &#8491; above is simply the lowest point on this
          0.05 &#8491; grid.
        </p>
      </div>
    </WidgetCard>
  );
}
