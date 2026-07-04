"use client";

import { useMemo, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, LabeledSlider, LiveStatus, WidgetCard, secondaryActionClass } from "./widget-ui";
import { h2OneQubit, type H2Point } from "./chemistry";
import { H2 as H } from "./h2-data";
import { usePrefersReducedMotion } from "./use-display-caps";
import { parseJsonObject } from "./parse-utils";
import { formatFixed, formatAngstrom, angstromSR, hartreeSR } from "./format";

/**
 * Inline H2 Hamiltonian + symmetry-tapering explorer rendered from a ```qham
 * fenced block. Parses an optional `{ "R": 0.75, "tapered": false }` body, picks
 * the nearest committed fixture point for the chosen bond length, and shows the
 * full 15-term Jordan-Wigner Hamiltonian as live magnitude bars. The tapered
 * toggle folds the 4-qubit / 15-term operator down to the Z2-tapered single
 * qubit H = c0 I + cz Z + cx X (h2OneQubit), with a qubit-budget readout that
 * motivates active-space reduction for larger molecules.
 *
 * Coefficients come exclusively from H (the committed PennyLane DHF STO-3G
 * fixture, see scripts/gen_h2_fixture.py) and are never invented. Pure client,
 * static-export safe, no AWS / network / SSR-only calls.
 */

const BAR_PRECISION = 4; // signed coefficient digits

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

type ParseResult =
  | { ok: true; R: number; tapered: boolean }
  | { ok: false; error: string };

function parseSource(source: string): ParseResult {
  const minR = H.points[0].R;
  const maxR = H.points[H.points.length - 1].R;
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj === null) {
    return { ok: true, R: H.equilibrium.R, tapered: false };
  }
  const obj = base.obj;

  let R = H.equilibrium.R;
  const rawR = obj["R"];
  if (rawR !== undefined) {
    if (typeof rawR !== "number" || Number.isNaN(rawR)) {
      return { ok: false, error: '"R" must be a number' };
    }
    if (rawR < minR || rawR > maxR) {
      return {
        ok: false,
        error: `"R" must be within [${minR}, ${maxR}] Angstrom`,
      };
    }
    R = rawR;
  }

  let tapered = false;
  const rawTapered = obj["tapered"];
  if (rawTapered !== undefined) {
    if (typeof rawTapered !== "boolean") {
      return { ok: false, error: '"tapered" must be a boolean' };
    }
    tapered = rawTapered;
  }

  return { ok: true, R, tapered };
}

// ---------------------------------------------------------------------------
// Nearest fixture point + term selection
// ---------------------------------------------------------------------------

function nearestPoint(R: number, points: H2Point[]): H2Point {
  let best = points[0];
  let bestD = Math.abs(points[0].R - R);
  for (const p of points) {
    const d = Math.abs(p.R - R);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

interface WeightedTerm {
  label: string;
  coeff: number;
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="qham" message={message} />;
}

// ---------------------------------------------------------------------------
// Signed-coefficient helper
// ---------------------------------------------------------------------------

function signed(x: number, digits: number): string {
  // formatFixed snaps a near-zero/-0 coefficient to "0...", so a tiny negative
  // term renders "+0.0000" instead of the misleading "-0.0000".
  const s = formatFixed(x, digits);
  return s.startsWith("-") ? s : `+${s}`;
}

// ---------------------------------------------------------------------------
// Magnitude-bar term list (one shared renderer for tapered + untapered)
// ---------------------------------------------------------------------------

function TermBars({
  terms,
  maxMag,
  animate,
}: {
  terms: WeightedTerm[];
  maxMag: number;
  animate: boolean;
}) {
  const denom = Math.max(maxMag, 1e-12);
  return (
    <ul className="space-y-1.5">
      {terms.map((t) => {
        const pct = (Math.abs(t.coeff) / denom) * 100;
        const positive = t.coeff >= 0;
        return (
          <li key={t.label} className="flex items-center gap-2">
            <span className="w-12 shrink-0 font-mono text-xs text-gray-600 dark:text-gray-300">
              {t.label}
            </span>
            <span className="relative h-3 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <span
                className={
                  "absolute inset-y-0 left-0 rounded-full " +
                  (positive
                    ? "bg-accent"
                    : "bg-[color-mix(in_oklab,var(--accent)_45%,transparent)]") +
                  (animate
                    ? " transition-[width] duration-300 motion-reduce:transition-none"
                    : "")
                }
                style={{ width: `${pct.toFixed(2)}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {signed(t.coeff, BAR_PRECISION)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HamiltonianExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  const minR = H.points[0].R;
  const maxR = H.points[H.points.length - 1].R;
  const stepR = useMemo(() => {
    // Use the fixture's own sampling pitch so the slider snaps onto real points.
    if (H.points.length < 2) return 0.05;
    return Math.round((H.points[1].R - H.points[0].R) * 1000) / 1000;
  }, []);

  const [R, setR] = useState(() => (parsed.ok ? parsed.R : H.equilibrium.R));
  const [tapered, setTapered] = useState(() => (parsed.ok ? parsed.tapered : false));
  const reduced = usePrefersReducedMotion();

  // Nearest committed fixture point for the chosen R (defensive default).
  const point = useMemo(() => nearestPoint(R, H.points), [R]);

  // Full 15-term JW Hamiltonian for this point, sorted by |coeff| descending.
  const fullTerms = useMemo<WeightedTerm[]>(() => {
    return H.jwTerms
      .map((label, i) => ({ label, coeff: point.jw[i] }))
      .sort((a, b) => Math.abs(b.coeff) - Math.abs(a.coeff));
  }, [point]);

  // Tapered single-qubit coefficients, kept in fixed c0/cz/cx order for the
  // slider's aria-valuetext (the sorted term list below reorders by magnitude).
  const taperedCoeffs = useMemo(() => h2OneQubit(R, H.points), [R]);

  // Tapered single-qubit H = c0 I + cz Z + cx X, sorted by |coeff| descending.
  const taperedTerms = useMemo<WeightedTerm[]>(() => {
    const { c0, cz, cx } = taperedCoeffs;
    return [
      { label: "I", coeff: c0 },
      { label: "Z", coeff: cz },
      { label: "X", coeff: cx },
    ].sort((a, b) => Math.abs(b.coeff) - Math.abs(a.coeff));
  }, [taperedCoeffs]);

  // --- all hooks above this line; safe to early-return now ---
  if (!parsed.ok) {
    return <ErrorCard message={parsed.error} />;
  }

  const shownTerms = tapered ? taperedTerms : fullTerms;
  const maxMag = shownTerms.reduce((m, t) => Math.max(m, Math.abs(t.coeff)), 0);
  const animate = !reduced;

  const listLabel = tapered
    ? `Single-qubit tapered H2 Hamiltonian: 3 weighted Pauli terms at bond length ${angstromSR(
        R
      )}, largest magnitude ${hartreeSR(maxMag)}.`
    : `Four-qubit Jordan-Wigner H2 Hamiltonian: 15 weighted Pauli terms at bond length ${angstromSR(
        R
      )}, largest magnitude ${hartreeSR(maxMag)}.`;

  return (
    <WidgetCard
      eyebrow="H2 Hamiltonian"
      chips={
        <>
          <Chip>STO-3G minimal basis</Chip>
          <Chip>{tapered ? "1q / 3 terms" : "4q / 15 terms"}</Chip>
        </>
      }
    >
      <LiveStatus>
        {`${tapered ? "Tapered 1-qubit" : "4-qubit"} H2 at R = ${angstromSR(
          R
        )}. Largest term ${shownTerms[0].label} = ${signed(
          shownTerms[0].coeff,
          BAR_PRECISION
        )} hartree.`}
      </LiveStatus>

      <div className="px-4 py-4">
        {/* Bond-length slider */}
        <LabeledSlider
          label="R"
          value={R}
          min={minR}
          max={maxR}
          step={stepR}
          onChange={setR}
          ariaLabel="H2 bond length R in Angstrom"
          // Tapered mode: valuetext carries the full c0/cz/cx coefficient set the
          // slider drives — complementary to the LiveStatus, which keeps mode +
          // largest term. Full mode stays bond-length-only: LiveStatus already
          // announces the largest of the 15 terms on every step, and repeating it
          // here would double-announce the same label + coefficient.
          ariaValueText={
            tapered
              ? `${angstromSR(R)}; coefficients c0 ${signed(
                  taperedCoeffs.c0,
                  BAR_PRECISION
                )}, cz ${signed(taperedCoeffs.cz, BAR_PRECISION)}, cx ${signed(
                  taperedCoeffs.cx,
                  BAR_PRECISION
                )} hartree`
              : angstromSR(R)
          }
          display={formatAngstrom(R)}
          labelClassName="w-8 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300"
          valueWidth="w-20"
        />

        {/* Tapered toggle */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={tapered}
            onClick={() => setTapered((v) => !v)}
            className={secondaryActionClass}
          >
            {tapered ? "Show full 4-qubit Hamiltonian" : "Apply Z2 symmetry tapering"}
          </button>
          <span className="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            sampled at R = {formatAngstrom(point.R)}
          </span>
        </div>

        {/* Qubit-budget readout (tapered) */}
        {tapered && (
          <p className="mt-3 font-mono text-xs tabular-nums text-gray-700 dark:text-gray-200">
            4 qubits / 15 terms &nbsp;-&gt;&nbsp; 1 qubit / 3 terms
          </p>
        )}

        {/* Term bars */}
        <div className="mt-4">
          <svg
            width={0}
            height={0}
            role="img"
            aria-label={listLabel}
            className="absolute"
          >
            <title>{listLabel}</title>
          </svg>
          <TermBars terms={shownTerms} maxMag={maxMag} animate={animate} />
        </div>

        {/* Active-space projection (always visible to motivate the technique) */}
        <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Tapering exploits H2&#39;s Z2 parity symmetries to drop the 4-qubit /
          15-term operator to 1 qubit / 3 terms. The savings grow fast: H2O in
          STO-3G needs 14 qubits before tapering or active-space reduction, which
          is why larger molecules lean on active spaces.
        </p>

        {/* Honesty / provenance */}
        <p className="mt-3 text-[11px] leading-relaxed text-caption">
          Coefficients are read directly from the committed {H.molecule} fixture
          (basis {H.basis}); none are invented. Data from PennyLane
          differentiable Hartree-Fock, see scripts/gen_h2_fixture.py.
        </p>
      </div>
    </WidgetCard>
  );
}
