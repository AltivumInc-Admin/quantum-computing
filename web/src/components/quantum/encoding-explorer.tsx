"use client";

import { useId, useMemo, useState } from "react";
import { basisLabel, cAbs2, type Complex } from "./math";
import { diracString } from "./state-readout";
import { BlochDial } from "./bloch-dial";
import { angleState, amplitudeState, iqpState, reducedBloch } from "./encoding";
import { LiveStatus } from "./widget-ui";

/**
 * Inline data-encoding explorer rendered from a ```qencode fenced block. Parses a
 * feature vector and an encoding name `{ "x": [0.6, 0.9], "encoding": "angle" }`,
 * builds the 2-qubit feature state in the browser (angle / amplitude / IQP), and
 * shows: per-basis amplitude bars with the |bxy> labels, the Dirac string, a live
 * unit-norm readout, and Bloch dials for the per-qubit reduced state (angle) or
 * the single qubit (amplitude). No backend, no SSR.
 */

type Encoding = "angle" | "amplitude" | "iqp";

const ENCODINGS: Encoding[] = ["angle", "amplitude", "iqp"];
const ENCODING_LABEL: Record<Encoding, string> = {
  angle: "Angle",
  amplitude: "Amplitude",
  iqp: "IQP / ZZ",
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface Parsed {
  x: [number, number];
  encoding: Encoding;
}

const DEFAULTS: Parsed = { x: [0.5, 0.5], encoding: "angle" };

function isEncoding(v: unknown): v is Encoding {
  return typeof v === "string" && (ENCODINGS as string[]).includes(v);
}

/** Defensive parse: any malformed input falls back to the defaults (never throws). */
function parseSource(source: string): Parsed {
  const trimmed = source.trim();
  if (trimmed.length === 0) return DEFAULTS;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return DEFAULTS;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return DEFAULTS;
  }
  const obj = raw as Record<string, unknown>;

  let x: [number, number] = [...DEFAULTS.x];
  const rawX = obj["x"];
  if (Array.isArray(rawX) && rawX.length >= 2 && typeof rawX[0] === "number" && typeof rawX[1] === "number") {
    x = [rawX[0], rawX[1]];
  }

  const encoding = isEncoding(obj["encoding"]) ? obj["encoding"] : DEFAULTS.encoding;

  return { x, encoding };
}

const PI = Math.PI;
const clamp = (v: number) => Math.max(-PI, Math.min(PI, v));

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EncodingExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  const [x0, setX0] = useState(() => clamp(parsed.x[0]));
  const [x1, setX1] = useState(() => clamp(parsed.x[1]));
  const [encoding, setEncoding] = useState<Encoding>(parsed.encoding);
  const x0Id = useId();
  const x1Id = useId();
  const encId = useId();

  const state = useMemo<Complex[]>(() => {
    if (encoding === "amplitude") return amplitudeState([x0, x1]);
    if (encoding === "iqp") return iqpState(x0, x1);
    return angleState(x0, x1);
  }, [encoding, x0, x1]);

  const n = useMemo(() => Math.round(Math.log2(state.length)), [state.length]);

  const norm = useMemo(
    () => Math.sqrt(state.reduce((acc, c) => acc + cAbs2(c), 0)),
    [state]
  );

  const dirac = useMemo(() => diracString(state, n), [state, n]);

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      <LiveStatus>
        {`${ENCODING_LABEL[encoding]} feature map. ‖ψ‖ = ${norm.toFixed(
          3
        )}. |ψ⟩ = ${dirac}.`}
      </LiveStatus>

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Encoding
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          {ENCODING_LABEL[encoding]}
        </span>
      </div>

      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Bloch dials */}
        <div className="flex flex-col items-center gap-2">
          {encoding === "amplitude" ? (
            <>
              <BlochDial state={state.slice(0, 2)} />
              <span className="text-[10px] text-caption font-mono">single qubit</span>
            </>
          ) : (
            <div className="flex gap-3">
              <div className="flex flex-col items-center gap-1">
                <BlochDial vector={reducedBloch(state, 0)} />
                <span className="text-[10px] text-caption font-mono">q0</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <BlochDial vector={reducedBloch(state, 1)} />
                <span className="text-[10px] text-caption font-mono">q1</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls + readout */}
        <div className="min-w-0 flex-1">
          {/* encoding select */}
          <div className="flex items-center gap-3">
            <label htmlFor={encId} className="shrink-0 text-sm text-gray-600 dark:text-gray-300">
              Map
            </label>
            <select
              id={encId}
              value={encoding}
              onChange={(e) => setEncoding(e.target.value as Encoding)}
              className="focus-ring rounded-control border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-800 dark:text-gray-200"
              aria-label="Feature-map encoding"
            >
              {ENCODINGS.map((enc) => (
                <option key={enc} value={enc}>
                  {ENCODING_LABEL[enc]}
                </option>
              ))}
            </select>
          </div>

          {/* x0 slider */}
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor={x0Id} className="w-10 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300">
              x&#8320;
            </label>
            <input
              id={x0Id}
              type="range"
              min={-PI}
              max={PI}
              step={PI / 60}
              value={x0}
              onChange={(e) => setX0(parseFloat(e.target.value))}
              className="slider flex-1 focus-ring"
              aria-label="Feature x0"
              aria-valuetext={`x0 = ${x0.toFixed(2)}, norm ${norm.toFixed(3)}`}
            />
            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {x0.toFixed(2)}
            </span>
          </div>

          {/* x1 slider */}
          <div className="mt-2 flex items-center gap-3">
            <label htmlFor={x1Id} className="w-10 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300">
              x&#8321;
            </label>
            <input
              id={x1Id}
              type="range"
              min={-PI}
              max={PI}
              step={PI / 60}
              value={x1}
              onChange={(e) => setX1(parseFloat(e.target.value))}
              className="slider flex-1 focus-ring"
              aria-label="Feature x1"
              aria-valuetext={`x1 = ${x1.toFixed(2)}, norm ${norm.toFixed(3)}`}
            />
            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {x1.toFixed(2)}
            </span>
          </div>

          {/* amplitude bars */}
          <div className="mt-4 space-y-1.5">
            {state.map((amp, idx) => {
              const p = cAbs2(amp);
              return (
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
              );
            })}
          </div>

          {/* Dirac string + norm readout */}
          <p className="mt-4 break-words font-mono text-xs text-gray-600 dark:text-gray-300">
            |&#968;&#10217; = {dirac}
          </p>
          <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
            &#8214;&#968;&#8214; = <span className="tabular-nums">{norm.toFixed(3)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
