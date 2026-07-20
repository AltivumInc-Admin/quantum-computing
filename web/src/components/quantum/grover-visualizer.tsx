"use client";

import { useId, useMemo, useState } from "react";
import {
  Bar,
  Chip,
  EMPHASIS_LABEL,
  ErrorCard as SharedErrorCard,
  LabeledSlider,
  LiveStatus,
  NEUTRAL_BAR_FILL,
  WidgetCard,
} from "./widget-ui";
import { formatPercent } from "./format";
import { basisLabel } from "./math";
import { groverHistory, optimalIterations } from "./grover";

/**
 * Inline Grover amplitude-amplification widget rendered from a ```qgrover fenced
 * block in a GUIDE. Parses `{ "qubits": 3, "marked": 5 }` defensively, then runs
 * the real iteration kernel (grover.ts). An iterations slider lets the learner
 * watch the marked amplitude peak near the ~(pi/4)*sqrt(N) optimum and then
 * over-rotate; qubit-count and marked-state selects re-seed the search. Pure
 * client, static-export safe, no AWS.
 */

interface ParsedConfig {
  n: number;
  marked: number;
}

interface ParseResult {
  config?: ParsedConfig;
  error?: string;
}

function parseConfig(source: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return { error: "expected JSON like { \"qubits\": 3, \"marked\": 5 }" };
  }
  if (typeof raw !== "object" || raw === null) {
    return { error: "expected a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const n = obj.qubits === undefined ? 3 : Number(obj.qubits);
  const marked = obj.marked === undefined ? 0 : Number(obj.marked);
  if (!Number.isInteger(n) || n < 2 || n > 4) {
    return { error: `qubits must be an integer in 2..4 (got ${String(obj.qubits)})` };
  }
  const N = 1 << n;
  if (!Number.isInteger(marked) || marked < 0 || marked > N - 1) {
    return { error: `marked must be an integer in 0..${N - 1} (got ${String(obj.marked)})` };
  }
  return { config: { n, marked } };
}

export function GroverVisualizer({ source }: { source: string }) {
  const parsed = useMemo(() => parseConfig(source), [source]);
  const initN = parsed.config?.n ?? 3;
  const initMarked = parsed.config?.marked ?? 0;

  const [n, setN] = useState(initN);
  const [marked, setMarked] = useState(initMarked);
  const [iterations, setIterations] = useState<number | null>(null);
  const qubitsId = useId();
  const markedId = useId();

  const optimal = useMemo(() => optimalIterations(n), [n]);
  const maxSlider = 2 * optimal + 2;

  const history = useMemo(() => {
    try {
      return { hist: groverHistory(n, marked, maxSlider) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [n, marked, maxSlider]);

  if (parsed.error || history.error || !history.hist) {
    return <SharedErrorCard label="grover" message={parsed.error ?? history.error} />;
  }

  // iterations defaults to the optimal count, clamped to the current slider range.
  const frame = Math.min(iterations ?? optimal, maxSlider);
  const amps = history.hist[frame];
  const N = 1 << n;
  const success = amps[marked] ** 2;

  const onChangeN = (next: number) => {
    setN(next);
    const nextN = 1 << next;
    if (marked > nextN - 1) setMarked(0);
    setIterations(null); // re-seed to the new optimal
  };

  return (
    <WidgetCard
      eyebrow="Grover"
      chips={
        <>
          <Chip>N = {N}</Chip>
          <Chip>marked = |{basisLabel(marked, n)}&#10217;</Chip>
        </>
      }
    >
      <LiveStatus>
        {`Success probability ${(success * 100).toFixed(1)}% at ${frame} iteration${
          frame === 1 ? "" : "s"
        }.`}
      </LiveStatus>

      <div className="px-4 py-4">
        <div className="space-y-1.5">
          {amps.map((amp, idx) => {
            const p = amp * amp;
            const isMarked = idx === marked;
            return (
              <Bar
                key={idx}
                label={basisLabel(idx, n)}
                fraction={p}
                fillClass={isMarked ? "bar-fill" : NEUTRAL_BAR_FILL}
                valueText={formatPercent(p * 100)}
                labelClassName={isMarked ? EMPHASIS_LABEL : "text-caption"}
              />
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="font-mono text-sm text-caption">
            <span className="text-caption">success P(marked) = </span>
            <span className="text-accent-dark dark:text-accent-light tabular-nums">
              {(success * 100).toFixed(1)}%
            </span>
          </p>
          <p className="text-xs text-caption">
            optimal = {optimal} iteration{optimal === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <LabeledSlider
        label="iterations"
        value={frame}
        min={0}
        max={maxSlider}
        step={1}
        parse={(s) => parseInt(s, 10)}
        onChange={setIterations}
        ariaLabel="Number of Grover iterations"
        ariaValueText={`${frame} iteration${frame === 1 ? "" : "s"}, success ${(
          success * 100
        ).toFixed(1)}%`}
        display={frame}
        rowClassName="flex items-center gap-3 border-t border-(--bd) px-4 py-3"
        labelClassName="font-mono text-sm text-(--mut)"
        valueWidth="w-8"
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-(--bd) px-4 py-3">
        <div className="flex items-center gap-2">
          <label htmlFor={qubitsId} className="font-mono text-sm text-(--mut)">
            qubits
          </label>
          <select
            id={qubitsId}
            value={n}
            onChange={(e) => onChangeN(parseInt(e.target.value, 10))}
            className="rounded-control border border-(--bd) bg-(--field) px-2 py-1 font-mono text-xs text-(--mut) focus-ring"
          >
            {[2, 3, 4].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={markedId} className="font-mono text-sm text-(--mut)">
            marked
          </label>
          <select
            id={markedId}
            value={marked}
            onChange={(e) => setMarked(parseInt(e.target.value, 10))}
            className="rounded-control border border-(--bd) bg-(--field) px-2 py-1 font-mono text-xs text-(--mut) focus-ring"
          >
            {Array.from({ length: N }, (_, idx) => (
              <option key={idx} value={idx}>
                |{basisLabel(idx, n)}&#10217;
              </option>
            ))}
          </select>
        </div>
      </div>
    </WidgetCard>
  );
}
