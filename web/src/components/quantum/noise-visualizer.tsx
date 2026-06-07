"use client";

import { useId, useMemo, useState } from "react";
import { simulate, probabilities, basisLabel } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { noisyProbs, fidelityDist, type ChannelName } from "./noise";

/**
 * Inline noise-visualizer widget rendered from a ```qnoise fenced block in a
 * GUIDE. Parses the shared gate DSL, runs ideal state-vector simulation and a
 * density-matrix Kraus-operator simulation side-by-side, and shows per-basis
 * ideal vs noisy probability bars plus a fidelity readout.
 */

const CHANNELS: { value: ChannelName; label: string }[] = [
  { value: "depolarizing", label: "Depolarizing" },
  { value: "amplitude-damping", label: "Amplitude damping" },
  { value: "bit-flip", label: "Bit flip" },
];

export function NoiseVisualizer({ source }: { source: string }) {
  const program = useMemo(() => parseProgram(source), [source]);

  const [channel, setChannel] = useState<ChannelName>("depolarizing");
  const [p, setP] = useState(0);

  const sliderId = useId();
  const channelId = useId();

  // Parse-error card
  if (program.error) {
    return (
      <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
            Noise
          </span>
        </div>
        <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">
          qsim parse error: {program.error}
        </p>
      </div>
    );
  }

  // Over-qubit-limit card
  if (program.n > 3) {
    return (
      <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
            Noise
          </span>
        </div>
        <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
          qnoise supports up to 3 qubits.
        </p>
      </div>
    );
  }

  // Slider max depends on channel
  const pMax = channel === "depolarizing" ? 0.75 : 1;
  // Clamp p when switching from a higher-max channel
  const pClamped = Math.min(p, pMax);

  // Ideal probabilities
  const ideal = useMemo(
    () => probabilities(simulate(opsFor(program, 0), program.n)),
    [program]
  );

  // Noisy probabilities
  const noisy = useMemo(
    () => noisyProbs(opsFor(program, 0), program.n, channel, pClamped),
    [program, channel, pClamped]
  );

  const fidelity = fidelityDist(ideal, noisy);
  const fidelityPct = Math.round(fidelity * 100);

  function handleChannelChange(next: ChannelName) {
    setChannel(next);
    const nextMax = next === "depolarizing" ? 0.75 : 1;
    setP((prev) => Math.min(prev, nextMax));
  }

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Noise
        </span>
        <span className="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
          fidelity {fidelityPct}%
        </span>
      </div>

      {/* Probability bars */}
      <div className="px-4 py-4 space-y-2">
        {ideal.map((idealP, idx) => {
          const noisyP = noisy[idx] ?? 0;
          return (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                |{basisLabel(idx, program.n)}&#10217;
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                {/* Ideal bar */}
                <div className="flex items-center gap-1.5">
                  <span className="w-8 shrink-0 text-[10px] text-gray-400 dark:text-gray-500">ideal</span>
                  <span className="relative h-2.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-200"
                      style={{ width: `${(idealP * 100).toFixed(2)}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {(idealP * 100).toFixed(1)}%
                  </span>
                </div>
                {/* Noisy bar */}
                <div className="flex items-center gap-1.5">
                  <span className="w-8 shrink-0 text-[10px] text-gray-400 dark:text-gray-500">noisy</span>
                  <span className="relative h-2.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-amber-500 transition-[width] duration-200"
                      style={{ width: `${(noisyP * 100).toFixed(2)}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {(noisyP * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3">
        {/* Channel select */}
        <div className="flex items-center gap-3">
          <label
            htmlFor={channelId}
            className="shrink-0 text-xs text-gray-600 dark:text-gray-300"
          >
            Channel
          </label>
          <select
            id={channelId}
            value={channel}
            onChange={(e) => handleChannelChange(e.target.value as ChannelName)}
            className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 focus-ring"
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Error rate slider */}
        <div className="flex items-center gap-3">
          <label
            htmlFor={sliderId}
            className="shrink-0 text-xs text-gray-600 dark:text-gray-300"
          >
            Error rate
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={pMax}
            step={0.01}
            value={pClamped}
            onChange={(e) => setP(parseFloat(e.target.value))}
            className="slider flex-1 focus-ring"
            aria-label="Error rate"
            aria-valuetext={`${(pClamped * 100).toFixed(0)}%`}
          />
          <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {(pClamped * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}
