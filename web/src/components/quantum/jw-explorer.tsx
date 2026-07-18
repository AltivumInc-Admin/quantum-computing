"use client";

import { useId, useMemo, useState } from "react";
import { Chip, ErrorCard as SharedErrorCard, LiveStatus, WidgetCard } from "./widget-ui";
import { hfOccupation, jwTransform } from "./jw";
import { clampInt, parseJsonObject } from "./parse-utils";

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

function parseSource(source: string): ParseResult {
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj === null) return { ok: true, config: { ...DEFAULT_CONFIG } };
  const obj = base.obj;

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
  const modes = clampInt(rawModes, MIN_MODES, MAX_MODES);
  const electrons = clampInt(rawElectrons, 0, modes);
  const mode = clampInt(rawMode, 0, modes - 1);

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
    return "border-transparent chip-selected";
  }
  if (label === "Z") {
    return "border-transparent bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] text-(--ink)";
  }
  return "border border-(--bd) bg-(--field) text-caption";
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
  const activeMode = clampInt(mode, 0, config.modes - 1);

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
    <WidgetCard
      eyebrow="Jordan-Wigner mapping"
      chips={
        <>
          <Chip>{config.modes}q</Chip>
          <Chip>{config.electrons}e</Chip>
        </>
      }
    >
      <LiveStatus>
        {`${dagger ? "Creation" : "Annihilation"} operator ${opName}: X-string ${
          image.xString
        }, ${image.zChain.length} Z parity factor${
          image.zChain.length === 1 ? "" : "s"
        }.`}
      </LiveStatus>

      <div className="flex flex-col gap-6 px-4 py-4">
        <h3 id={headingId} className="sr-only">
          Jordan-Wigner mapping explorer
        </h3>

        {/* Hartree-Fock occupation ket */}
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent">
            Hartree-Fock reference
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-lg text-(--mut)">
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
                        ? "bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] text-(--ink)"
                        : "border border-(--bd) bg-(--field) text-caption"
                    }`}
                  >
                    {bit}
                  </span>
                  <span className="font-mono text-[10px] text-caption">
                    q{q}
                  </span>
                </div>
              ))}
            </div>
            <span className="font-mono text-lg text-(--mut)">
              &#10217;
            </span>
          </div>
        </div>

        {/* Mode picker + dagger toggle */}
        <div className="flex flex-col gap-3">
          <div>
            <p
              id={groupId}
              className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent"
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
                        ? "chip-selected"
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
                  ? "chip-selected"
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
                  ? "chip-selected"
                  : "border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              annihilation a
            </button>
          </div>
        </div>

        {/* Pauli string image */}
        <div>
          <p className="font-mono text-sm tabular-nums text-(--ink)">
            {opName}
            {" = "}
            <span className="text-accent dark:text-accent-light">
              (X{" "}
              {sign}
              {" iY) / 2"}
            </span>
            {image.zChain.length > 0 && (
              <span className="text-caption">
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
                  <span className="font-mono text-[10px] text-caption">
                    q{f.qubit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-2 font-mono text-[11px] text-caption">
            X-string {image.xString} &middot; Y-string {image.yString}
          </p>
        </div>

        {/* Plain-English note */}
        <p className="text-xs leading-relaxed text-caption">
          {image.zChain.length > 0 ? (
            <>
              The trailing Z-string counts the parity of every lower-index
              orbital (q0 through q{activeMode - 1}). That product of Z operators
              is what encodes fermionic antisymmetry: flipping occupation on mode{" "}
              {activeMode} must respect the sign of how many electrons sit below
              it.{" "}
            </>
          ) : (
            <>
              Mode 0 has no lower-index orbitals, so there is no trailing
              Z-string — the operator is just (X {sign} iY) / 2 on q0. The parity
              bookkeeping appears only for higher modes.{" "}
            </>
          )}
          The mapping is exact and deterministic — pure combinatorics, big-endian
          with qubit 0 on the left.
        </p>
      </div>
    </WidgetCard>
  );
}
