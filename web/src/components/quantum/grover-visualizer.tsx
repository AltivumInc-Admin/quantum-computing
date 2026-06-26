"use client";

import { useId, useMemo, useState } from "react";
import { Bar, ErrorCard as SharedErrorCard, LiveStatus } from "./widget-ui";
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
  const sliderId = useId();
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
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      <LiveStatus>
        {`Success probability ${(success * 100).toFixed(1)}% at ${frame} iteration${
          frame === 1 ? "" : "s"
        }.`}
      </LiveStatus>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Grover
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          N = {N}
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          marked = |{basisLabel(marked, n)}&#10217;
        </span>
      </div>

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
                fillClass={isMarked ? "bg-accent" : "bg-gray-300 dark:bg-gray-600"}
                valueText={`${(p * 100).toFixed(1)}%`}
                labelClassName={
                  isMarked
                    ? "text-accent-dark dark:text-accent-light font-semibold"
                    : "text-gray-500 dark:text-gray-400"
                }
              />
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="font-mono text-sm text-gray-700 dark:text-gray-200">
            <span className="text-caption">success P(marked) = </span>
            <span className="text-accent dark:text-accent-light tabular-nums">
              {(success * 100).toFixed(1)}%
            </span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            optimal = {optimal} iteration{optimal === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <label htmlFor={sliderId} className="font-mono text-sm text-gray-600 dark:text-gray-300">
          iterations
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={maxSlider}
          step={1}
          value={frame}
          onChange={(e) => setIterations(parseInt(e.target.value, 10))}
          className="slider flex-1 focus-ring"
          aria-label="Number of Grover iterations"
          aria-valuetext={`${frame} iteration${frame === 1 ? "" : "s"}, success ${(
            success * 100
          ).toFixed(1)}%`}
        />
        <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {frame}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <label htmlFor={qubitsId} className="font-mono text-sm text-gray-600 dark:text-gray-300">
            qubits
          </label>
          <select
            id={qubitsId}
            value={n}
            onChange={(e) => onChangeN(parseInt(e.target.value, 10))}
            className="rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-2 py-1 font-mono text-xs text-gray-700 dark:text-gray-200 focus-ring"
          >
            {[2, 3, 4].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={markedId} className="font-mono text-sm text-gray-600 dark:text-gray-300">
            marked
          </label>
          <select
            id={markedId}
            value={marked}
            onChange={(e) => setMarked(parseInt(e.target.value, 10))}
            className="rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-2 py-1 font-mono text-xs text-gray-700 dark:text-gray-200 focus-ring"
          >
            {Array.from({ length: N }, (_, idx) => (
              <option key={idx} value={idx}>
                |{basisLabel(idx, n)}&#10217;
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
