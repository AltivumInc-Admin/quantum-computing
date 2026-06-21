"use client";

import { useId, useMemo, useState } from "react";
import { ErrorCard as SharedErrorCard } from "./widget-ui";
import { hfOccupation, jwTransform } from "./jw";

/**
 * Inline Jordan-Wigner explorer rendered from a ```qjw fenced block. Parses an
 * optional `{ "modes": 4, "electrons": 2, "mode": 0, "dagger": true }` body
 * (empty -> the H2 default 4 modes / 2 electrons), shows the Hartree-Fock
 * occupation ket, and lets the learner pick a spin-orbital and toggle between a
 * creation a_p^dagger and an annihilation a_p operator. For the selection it
 * calls jwTransform (jw.ts) and draws the resulting Pauli string as labeled
 * boxes: a trailing Z-string on the lower-index modes (the fermionic parity),
 * an X/Y factor on the operator's own mode, and identity above. The map is
 * exact and deterministic combinatorics — no state-vector evolution. Pure
 * client, static-export safe, no AWS.
 */

const MIN_MODES = 1;
const MAX_MODES = 6;

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

interface JwConfig {
  modes: number;
  electrons: number;
  mode: number;
  dagger: boolean;
}

const DEFAULT_CONFIG: JwConfig = {
  modes: 4,
  electrons: 2,
  mode: 0,
  dagger: true,
};

type ParseResult = { ok: true; config: JwConfig } | { ok: false; error: string };

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function parseSource(source: string): ParseResult {
  const trimmed = source.trim();
  if (trimmed.length === 0) return { ok: true, config: { ...DEFAULT_CONFIG } };

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

  const num = (key: string, fallback: number): number | null => {
    const v = obj[key];
    if (v === undefined) return fallback;
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return v;
  };

  const rawModes = num("modes", DEFAULT_CONFIG.modes);
  if (rawModes === null) return { ok: false, error: '"modes" must be a number' };
  const rawElectrons = num("electrons", DEFAULT_CONFIG.electrons);
  if (rawElectrons === null) return { ok: false, error: '"electrons" must be a number' };
  const rawMode = num("mode", DEFAULT_CONFIG.mode);
  if (rawMode === null) return { ok: false, error: '"mode" must be a number' };

  const rawDagger = obj["dagger"];
  if (rawDagger !== undefined && typeof rawDagger !== "boolean") {
    return { ok: false, error: '"dagger" must be a boolean' };
  }
  const dagger = rawDagger === undefined ? DEFAULT_CONFIG.dagger : rawDagger;

  // Clamp into the documented ranges: modes in [1,6], electrons in [0,modes],
  // mode in [0,modes-1].
  const modes = clamp(Math.round(rawModes), MIN_MODES, MAX_MODES);
  const electrons = clamp(Math.round(rawElectrons), 0, modes);
  const mode = clamp(Math.round(rawMode), 0, modes - 1);

  return { ok: true, config: { modes, electrons, mode, dagger } };
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="qjw" message={message} />;
}

// ---------------------------------------------------------------------------
// Pauli factor cell styling
// ---------------------------------------------------------------------------

function factorClass(label: string): string {
  // Color via tokens only: the active X/Y factor reads as accent; the Z parity
  // string reads as a muted fill; identity stays faint.
  if (label === "X" || label === "Y") {
    return "border-transparent bg-accent text-white dark:bg-accent-light dark:text-gray-900";
  }
  if (label === "Z") {
    return "border-transparent bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] text-gray-800 dark:text-gray-100";
  }
  return "border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/40 text-gray-400 dark:text-gray-500";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function JwExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  const config = parsed.ok ? parsed.config : DEFAULT_CONFIG;
  const [mode, setMode] = useState(config.mode);
  const [dagger, setDagger] = useState(config.dagger);
  const headingId = useId();
  const groupId = useId();

  // Hartree-Fock occupation ket for the configured electron count.
  const occupation = useMemo(
    () => hfOccupation(config.electrons, config.modes),
    [config.electrons, config.modes]
  );

  // The currently selected mode, re-clamped against the parsed mode count so a
  // stale selection can never index out of range.
  const activeMode = clamp(mode, 0, config.modes - 1);

  // Jordan-Wigner image of the selected creation/annihilation operator.
  const image = useMemo(
    () => jwTransform(activeMode, config.modes, dagger),
    [activeMode, config.modes, dagger]
  );

  // Per-qubit Pauli factor labels for the X (and Y) string. Both strings share
  // the same Z-chain and identity tail; only the central factor differs, so a
  // single row of cells (with the X/Y label at the operator mode) tells the
  // whole story alongside the formula.
  const factors = useMemo(() => {
    const out: { qubit: number; label: string }[] = [];
    for (let q = 0; q < config.modes; q++) {
      let label: string;
      if (q < activeMode) label = "Z";
      else if (q === activeMode) label = "X/Y";
      else label = "I";
      out.push({ qubit: q, label });
    }
    return out;
  }, [config.modes, activeMode]);

  if (!parsed.ok) {
    return <ErrorCard message={parsed.error} />;
  }

  const ket = occupation.join("");
  const opName = dagger ? `a${activeMode}†` : `a${activeMode}`; // a_p^dagger / a_p
  const sign = image.ySign < 0 ? "−" : "+"; // minus / plus
  const ariaLabel = `Jordan-Wigner image of ${
    dagger ? "creation" : "annihilation"
  } operator on mode ${activeMode} of ${config.modes}: ${
    image.zChain.length
  } Z factors on the lower modes, an X or Y factor on mode ${activeMode}, identity above.`;

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Jordan-Wigner mapping
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          {config.modes}q
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          {config.electrons}e
        </span>
      </div>

      <div className="flex flex-col gap-6 px-4 py-4">
        <h3 id={headingId} className="sr-only">
          Jordan-Wigner mapping explorer
        </h3>

        {/* Hartree-Fock occupation ket */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Hartree-Fock reference
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-lg text-gray-700 dark:text-gray-200">
              |
            </span>
            <div
              className="flex gap-1.5"
              role="img"
              aria-label={`Hartree-Fock occupation ket for ${config.electrons} electrons in ${config.modes} spin-orbitals: ${ket}, qubit 0 leftmost.`}
            >
              {occupation.map((bit, q) => (
                <div key={q} className="flex flex-col items-center gap-1">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-control font-mono text-sm tabular-nums ${
                      bit === 1
                        ? "bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] text-gray-800 dark:text-gray-100"
                        : "border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/40 text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {bit}
                  </span>
                  <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">
                    q{q}
                  </span>
                </div>
              ))}
            </div>
            <span className="font-mono text-lg text-gray-700 dark:text-gray-200">
              &#10217;
            </span>
          </div>
        </div>

        {/* Mode picker + dagger toggle */}
        <div className="flex flex-col gap-3">
          <div>
            <p
              id={groupId}
              className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
            >
              Operator mode
            </p>
            <div
              className="mt-2 flex flex-wrap gap-1.5"
              role="group"
              aria-labelledby={groupId}
            >
              {Array.from({ length: config.modes }, (_, q) => {
                const selected = q === activeMode;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setMode(q)}
                    aria-pressed={selected}
                    aria-label={`Select spin-orbital ${q}`}
                    className={`h-8 w-9 rounded-control font-mono text-sm tabular-nums focus-ring transition-colors motion-reduce:transition-none ${
                      selected
                        ? "bg-accent text-white dark:bg-accent-light dark:text-gray-900"
                        : "border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDagger(true)}
              aria-pressed={dagger}
              className={`rounded-control px-3 py-1.5 text-sm font-medium focus-ring transition-colors motion-reduce:transition-none ${
                dagger
                  ? "bg-accent text-white dark:bg-accent-light dark:text-gray-900"
                  : "border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              creation a&#8202;<sup>&#8224;</sup>
            </button>
            <button
              type="button"
              onClick={() => setDagger(false)}
              aria-pressed={!dagger}
              className={`rounded-control px-3 py-1.5 text-sm font-medium focus-ring transition-colors motion-reduce:transition-none ${
                !dagger
                  ? "bg-accent text-white dark:bg-accent-light dark:text-gray-900"
                  : "border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              annihilation a
            </button>
          </div>
        </div>

        {/* Pauli string image */}
        <div>
          <p className="font-mono text-sm tabular-nums text-gray-800 dark:text-gray-100">
            {opName}
            {" = "}
            <span className="text-accent dark:text-accent-light">
              (X{" "}
              {sign}
              {" iY) / 2"}
            </span>
            {image.zChain.length > 0 && (
              <span className="text-gray-500 dark:text-gray-400">
                {" "}
                &middot; Z-string on q0&hellip;q{activeMode - 1}
              </span>
            )}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <div
              className="flex gap-1.5"
              role="img"
              aria-label={ariaLabel}
            >
              {factors.map((f) => (
                <div key={f.qubit} className="flex flex-col items-center gap-1">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-control font-mono text-sm ${factorClass(
                      f.label === "X/Y" ? "X" : f.label
                    )}`}
                    aria-hidden="true"
                  >
                    {f.label}
                  </span>
                  <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">
                    q{f.qubit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-2 font-mono text-[11px] text-gray-500 dark:text-gray-400">
            X-string {image.xString} &middot; Y-string {image.yString}
          </p>
        </div>

        {/* Plain-English note */}
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          The trailing Z-string counts the parity of every lower-index orbital
          (q0 through q{activeMode > 0 ? activeMode - 1 : 0}). That product of Z
          operators is what encodes fermionic antisymmetry: flipping occupation
          on mode {activeMode} must respect the sign of how many electrons sit
          below it. The mapping is exact and deterministic — pure combinatorics,
          big-endian with qubit 0 on the left.
        </p>
      </div>
    </div>
  );
}
