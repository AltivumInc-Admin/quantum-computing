"use client";

import { useId, useMemo, useState } from "react";
import { cAbs2, type Complex } from "./math";
import { diracString } from "./state-readout";
import { BlochDial } from "./bloch-dial";
import { angleState, amplitudeState, iqpState, reducedBloch } from "./encoding";
import { Chip, ErrorCard as SharedErrorCard, LabeledSlider, LiveStatus, ProbBars, WidgetCard } from "./widget-ui";

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

type ParseResult = { ok: true; value: Parsed } | { ok: false; error: string };

function parseSource(source: string): ParseResult {
  const trimmed = source.trim();
  if (trimmed.length === 0) return { ok: true, value: DEFAULTS };
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

  let x: [number, number] = [...DEFAULTS.x];
  const rawX = obj["x"];
  if (rawX !== undefined) {
    if (
      !Array.isArray(rawX) || rawX.length < 2 ||
      typeof rawX[0] !== "number" || typeof rawX[1] !== "number" ||
      !Number.isFinite(rawX[0]) || !Number.isFinite(rawX[1])
    ) {
      return { ok: false, error: '"x" must be a two-number array' };
    }
    x = [rawX[0], rawX[1]];
  }

  const rawEnc = obj["encoding"];
  let encoding: Encoding = DEFAULTS.encoding;
  if (rawEnc !== undefined) {
    if (!isEncoding(rawEnc)) {
      return { ok: false, error: `encoding must be one of ${ENCODINGS.join(", ")}` };
    }
    encoding = rawEnc;
  }
  return { ok: true, value: { x, encoding } };
}

const PI = Math.PI;
const clamp = (v: number) => Math.max(-PI, Math.min(PI, v));

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EncodingExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);
  const fallback = parsed.ok ? parsed.value : DEFAULTS;

  const [x0, setX0] = useState(() => clamp(fallback.x[0]));
  const [x1, setX1] = useState(() => clamp(fallback.x[1]));
  const [encoding, setEncoding] = useState<Encoding>(fallback.encoding);
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

  if (!parsed.ok) {
    return <SharedErrorCard label="qencode" message={parsed.error} />;
  }

  return (
    <WidgetCard
      eyebrow="Encoding"
      chips={<Chip>{ENCODING_LABEL[encoding]}</Chip>}
    >
      <LiveStatus>
        {`${ENCODING_LABEL[encoding]} feature map. ‖ψ‖ = ${norm.toFixed(
          3
        )}. |ψ⟩ = ${dirac}.`}
      </LiveStatus>

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
          <LabeledSlider
            label={<>x&#8320;</>}
            value={x0}
            min={-PI}
            max={PI}
            step={PI / 60}
            onChange={setX0}
            ariaLabel="Feature x0"
            ariaValueText={`x0 = ${x0.toFixed(2)}, norm ${norm.toFixed(3)}`}
            display={x0.toFixed(2)}
            rowClassName="mt-3 flex items-center gap-3"
            labelClassName="w-10 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300"
            valueWidth="w-14"
          />

          {/* x1 slider */}
          <LabeledSlider
            label={<>x&#8321;</>}
            value={x1}
            min={-PI}
            max={PI}
            step={PI / 60}
            onChange={setX1}
            ariaLabel="Feature x1"
            ariaValueText={`x1 = ${x1.toFixed(2)}, norm ${norm.toFixed(3)}`}
            display={x1.toFixed(2)}
            rowClassName="mt-2 flex items-center gap-3"
            labelClassName="w-10 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300"
            valueWidth="w-14"
          />

          {/* amplitude bars */}
          <div className="mt-4">
            <ProbBars probs={state.map(cAbs2)} n={n} />
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
    </WidgetCard>
  );
}
