"use client";

import { useMemo, useState } from "react";
import { Bar, Chip, ErrorCard, LabeledSlider, LiveStatus, WidgetCard, secondaryActionClass } from "./widget-ui";
import { type H2Point } from "./chemistry";
import { H2, R_MAX, R_MIN, R_PITCH } from "./h2-data";
import { parseJsonObject, readNumberInRange } from "./parse-utils";
import { formatFixed, formatAngstrom, angstromSR, hartreeSR } from "./format";

/**
 * Inline H2 Hamiltonian + symmetry-tapering explorer rendered from a ```qham
 * fenced block. Parses an optional `{ "R": 0.75, "tapered": false }` body, snaps
 * the bond length onto the fixture's own sampling grid, and shows the full
 * 15-term Jordan-Wigner Hamiltonian as live magnitude bars. The tapered toggle
 * folds the 4-qubit / 15-term operator down to the Z2-tapered single qubit
 * H = c0 I + cz Z + cx X, with a qubit-budget readout that motivates
 * active-space reduction for larger molecules.
 *
 * ONE sampling rule governs the whole widget: every number on screen is read
 * off a single committed fixture row (`point`). The tapered coefficients used to
 * come from h2OneQubit(R), which linearly INTERPOLATES — so at the shipped
 * R = 0.74 the two modes displayed two different Hamiltonians (c0 -0.3262 vs
 * -0.3387) under one caption claiming both were "sampled at R = 0.75", and under
 * a footer promising none were invented. The seeded R is snapped to the same
 * grid the slider steps on, so the thumb, the readout, the aria-valuetext and
 * the caption cannot disagree either. Pure client, static-export safe, no AWS.
 */

const BAR_PRECISION = 4; // signed coefficient digits

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

type ParseResult =
  | { ok: true; R: number; tapered: boolean }
  | { ok: false; error: string };

function parseSource(source: string): ParseResult {
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj === null) {
    return { ok: true, R: H2.equilibrium.R, tapered: false };
  }
  const obj = base.obj;

  const r = readNumberInRange(obj, "R", H2.equilibrium.R, R_MIN, R_MAX, "angstrom");
  if (!r.ok) return r;

  let tapered = false;
  const rawTapered = obj["tapered"];
  if (rawTapered !== undefined) {
    if (typeof rawTapered !== "boolean") {
      return { ok: false, error: '"tapered" must be a boolean' };
    }
    tapered = rawTapered;
  }

  return { ok: true, R: r.value, tapered };
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
// Signed-coefficient helper
// ---------------------------------------------------------------------------

function signed(x: number, digits: number): string {
  // formatFixed snaps a near-zero/-0 coefficient to "0...", so a tiny negative
  // term renders "+0.0000" instead of the misleading "-0.0000".
  const s = formatFixed(x, digits);
  return s.startsWith("-") ? s : `+${s}`;
}

// A negative coefficient reads as a lighter wash of the same accent, so sign is
// legible without introducing a second hue into the bar list.
const NEGATIVE_FILL = "bg-[color-mix(in_oklab,var(--accent)_45%,transparent)]";

// ---------------------------------------------------------------------------
// Magnitude-bar term list (one shared renderer for tapered + untapered)
// ---------------------------------------------------------------------------

function TermBars({ terms, maxMag }: { terms: WeightedTerm[]; maxMag: number }) {
  const denom = Math.max(maxMag, 1e-12);
  return (
    <ul className="space-y-1.5">
      {terms.map((t) => (
        // The shared Bar row, with its Dirac ket turned off: these labels are
        // Pauli strings (IIIZ, XXYY), not basis states. That one wrapper was the
        // only thing blocking reuse, so this file used to carry a hand-rolled
        // copy that had drifted onto an opaque gray track.
        <li key={t.label}>
          <Bar
            label={t.label}
            ket={false}
            fraction={Math.abs(t.coeff) / denom}
            valueText={signed(t.coeff, BAR_PRECISION)}
            fillClass={t.coeff >= 0 ? "bar-fill" : NEGATIVE_FILL}
            valueWidth="w-16"
          />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HamiltonianExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  // Seed on the fixture's own lattice. A fence body of { "R": 0.74 } is a
  // step mismatch for a slider whose step is the 0.05 pitch: the range input
  // sanitizes its DOM value to 0.75 while React state holds 0.74, so the thumb,
  // the readout and the live region disagreed from first paint and the first
  // arrow press jumped two nodes (0.74 -> 0.80).
  const [R, setR] = useState(() =>
    nearestPoint(parsed.ok ? parsed.R : H2.equilibrium.R, H2.points).R
  );
  const [tapered, setTapered] = useState(() => (parsed.ok ? parsed.tapered : false));

  // The single committed fixture row every number on screen is read from.
  const point = useMemo(() => nearestPoint(R, H2.points), [R]);

  // Full 15-term JW Hamiltonian for this point, sorted by |coeff| descending.
  const fullTerms = useMemo<WeightedTerm[]>(() => {
    return H2.jwTerms
      .map((label, i) => ({ label, coeff: point.jw[i] }))
      .sort((a, b) => Math.abs(b.coeff) - Math.abs(a.coeff));
  }, [point]);

  // Tapered single-qubit H = c0 I + cz Z + cx X, from the SAME row as the
  // 15 terms above, so the toggle is an exact folding of the displayed
  // operator rather than a comparison of two different bond lengths.
  const taperedTerms = useMemo<WeightedTerm[]>(
    () =>
      [
        { label: "I", coeff: point.c0 },
        { label: "Z", coeff: point.cz },
        { label: "X", coeff: point.cx },
      ].sort((a, b) => Math.abs(b.coeff) - Math.abs(a.coeff)),
    [point]
  );

  // --- all hooks above this line; safe to early-return now ---
  if (!parsed.ok) {
    return <ErrorCard label="qham" message={parsed.error} />;
  }

  const shownTerms = tapered ? taperedTerms : fullTerms;
  const maxMag = shownTerms.reduce((m, t) => Math.max(m, Math.abs(t.coeff)), 0);

  const listLabel = tapered
    ? `Single-qubit tapered H2 Hamiltonian: 3 weighted Pauli terms at bond length ${angstromSR(
        point.R
      )}, largest magnitude ${hartreeSR(maxMag)}.`
    : `Four-qubit Jordan-Wigner H2 Hamiltonian: 15 weighted Pauli terms at bond length ${angstromSR(
        point.R
      )}, largest magnitude ${hartreeSR(maxMag)}.`;

  return (
    <WidgetCard
      eyebrow="H2 Hamiltonian"
      chips={
        <>
          <Chip tone="warn">STO-3G minimal basis</Chip>
          <Chip>{tapered ? "1q / 3 terms" : "4q / 15 terms"}</Chip>
        </>
      }
    >
      <LiveStatus>
        {`${tapered ? "Tapered 1-qubit" : "4-qubit"} H2 at R = ${angstromSR(
          point.R
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
          min={R_MIN}
          max={R_MAX}
          step={R_PITCH}
          onChange={setR}
          ariaLabel="H2 bond length R in angstrom"
          // Tapered mode: valuetext carries the full c0/cz/cx coefficient set the
          // slider drives — complementary to the LiveStatus, which keeps mode +
          // largest term. Full mode stays bond-length-only: LiveStatus already
          // announces the largest of the 15 terms on every step, and repeating it
          // here would double-announce the same label + coefficient.
          ariaValueText={
            tapered
              ? `${angstromSR(point.R)}; coefficients c0 ${signed(
                  point.c0,
                  BAR_PRECISION
                )}, cz ${signed(point.cz, BAR_PRECISION)}, cx ${signed(
                  point.cx,
                  BAR_PRECISION
                )} hartree`
              : angstromSR(point.R)
          }
          display={formatAngstrom(R)}
          labelClassName="w-8 shrink-0 font-mono text-sm text-(--mut)"
          valueWidth="w-20"
        />

        {/* Tapered toggle. A plain action button, not role="switch": the label
            flips to name the NEXT action, and a switch whose accessible name
            inverts with its own aria-checked announces "Show full 4-qubit
            Hamiltonian, switch, on" — the opposite of the active mode. The chip
            row and the LiveStatus both already state the resulting mode. */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setTapered((v) => !v)}
            className={secondaryActionClass}
          >
            {tapered ? "Show full 4-qubit Hamiltonian" : "Apply Z2 symmetry tapering"}
          </button>
          <span className="font-mono text-xs tabular-nums text-caption">
            sampled at R = {formatAngstrom(point.R)}
          </span>
        </div>

        {/* Qubit-budget readout (tapered) */}
        {tapered && (
          <p className="mt-3 font-mono text-xs tabular-nums text-(--mut)">
            4 qubits / 15 terms &nbsp;-&gt;&nbsp; 1 qubit / 3 terms
          </p>
        )}

        {/* Term bars. The summary rides the repo's sr-only clip pattern; it used
            to hang off a 0x0 <svg role="img">, and zero-area graphics are pruned
            from the accessibility tree by some engines. */}
        <div className="mt-4">
          <p className="sr-only">{listLabel}</p>
          <TermBars terms={shownTerms} maxMag={maxMag} />
        </div>

        {/* Active-space projection (always visible to motivate the technique) */}
        <p className="mt-4 text-xs leading-relaxed text-caption">
          Tapering exploits H2&#39;s Z2 parity symmetries to drop the 4-qubit /
          15-term operator to 1 qubit / 3 terms. The savings grow fast: H2O in
          STO-3G needs 14 qubits before tapering or active-space reduction, which
          is why larger molecules lean on active spaces.
        </p>

        {/* Honesty / provenance — sourced from the fixture itself rather than
            restated as a literal that a regen would silently strand. */}
        <p className="mt-3 text-[11px] leading-relaxed text-caption">
          Every coefficient above is read directly from one row of the committed{" "}
          {H2.molecule} fixture (basis {H2.basis}); none are interpolated or
          invented. {H2.provenance}
        </p>
      </div>
    </WidgetCard>
  );
}
