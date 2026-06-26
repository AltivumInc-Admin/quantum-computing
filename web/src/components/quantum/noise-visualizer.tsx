"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { simulate, probabilities, basisLabel } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { noisyRho, stateFidelity, type ChannelName } from "./noise";
import { ErrorCard as SharedErrorCard, WidgetCard } from "./widget-ui";

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

// The slider parameter is a different physical quantity per channel (Pauli-error
// probability, amplitude-damping rate, flip probability), so the label is
// channel-aware rather than a generic "Error rate".
function parameterLabel(channel: ChannelName): string {
  if (channel === "depolarizing") return "Depolarizing p";
  if (channel === "amplitude-damping") return "Damping γ";
  return "Flip probability";
}

export function NoiseVisualizer({ source }: { source: string }) {
  const program = useMemo(() => parseProgram(source), [source]);

  const [channel, setChannel] = useState<ChannelName>("depolarizing");
  const [p, setP] = useState(0);

  const sliderId = useId();
  const channelId = useId();

  // Slider max depends on channel; clamp p when switching from a higher-max channel.
  const pMax = channel === "depolarizing" ? 0.75 : 1;
  const pClamped = Math.min(p, pMax);
  // Keep the thumb + label on the immediate value, but defer the heavy
  // density-matrix Kraus simulation so a fast drag runs at most one sim per
  // frame and the thumb stays responsive.
  const pDeferred = useDeferredValue(pClamped);
  const computing = pClamped !== pDeferred;
  const valid = !program.error && program.n <= 3;

  // Compute ideal + noisy distributions BEFORE any early return so the hooks
  // always run in the same order (react-hooks/rules-of-hooks). Empty when invalid.
  const idealState = useMemo(
    () => (valid ? simulate(opsFor(program, 0), program.n) : []),
    [program, valid]
  );
  const ideal = useMemo(() => probabilities(idealState), [idealState]);
  const rho = useMemo(
    () => (valid ? noisyRho(opsFor(program, 0), program.n, channel, pDeferred) : []),
    [program, channel, pDeferred, valid]
  );
  const noisy = useMemo(() => rho.map((row, i) => row[i][0]), [rho]);

  // One concise screen-reader summary of the largest ideal->noisy shift, so SR
  // users get the per-basis change without 8 chatty announcements per drag tick.
  const deltaSummary = useMemo(() => {
    if (!valid || noisy.length === 0) return "";
    let mi = 0;
    let md = -1;
    for (let i = 0; i < ideal.length; i++) {
      const d = Math.abs((ideal[i] ?? 0) - (noisy[i] ?? 0));
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    return `Largest shift at basis ${basisLabel(mi, program.n)}: ideal ${((ideal[mi] ?? 0) * 100).toFixed(0)} percent, noisy ${((noisy[mi] ?? 0) * 100).toFixed(0)} percent.`;
  }, [ideal, noisy, valid, program.n]);

  if (program.error) {
    return <SharedErrorCard label="qnoise" message={program.error} />;
  }

  if (program.n > 3) {
    return <SharedErrorCard label="qnoise" message="supports up to 3 qubits" />;
  }

  const fidelity = stateFidelity(idealState, rho);
  const fidelityPct = Math.round(fidelity * 100);

  function handleChannelChange(next: ChannelName) {
    setChannel(next);
    const nextMax = next === "depolarizing" ? 0.75 : 1;
    setP((prev) => Math.min(prev, nextMax));
  }

  return (
    <WidgetCard
      eyebrow="Noise"
      headerRight={
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400"
        >
          fidelity {fidelityPct}%
        </span>
      }
    >

      {/* Probability bars. The bars intentionally have no width transition: they
          track the (deferred) simulation 1:1 so they never lag the fidelity
          readout during a drag. Instead the whole container dims via opacity +
          aria-busy while a recompute is pending. */}
      <div
        className={`px-4 py-4 space-y-2 transition-opacity ${computing ? "opacity-60" : ""}`}
        aria-busy={computing}
      >
        <span className="sr-only" role="status" aria-live="polite">
          {deltaSummary}
        </span>
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
                  <span className="w-8 shrink-0 text-[10px] text-gray-500 dark:text-gray-400">ideal</span>
                  <span className="relative h-2.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-accent"
                      style={{ width: `${(idealP * 100).toFixed(2)}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {(idealP * 100).toFixed(1)}%
                  </span>
                </div>
                {/* Noisy bar */}
                <div className="flex items-center gap-1.5">
                  <span className="w-8 shrink-0 text-[10px] text-gray-500 dark:text-gray-400">noisy</span>
                  <span className="relative h-2.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
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
            className="flex-1 rounded-control border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 focus-ring"
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
            {parameterLabel(channel)}
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
            aria-label={parameterLabel(channel)}
            aria-valuetext={`${(pClamped * 100).toFixed(0)}%`}
          />
          <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {(pClamped * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </WidgetCard>
  );
}
