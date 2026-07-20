"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { simulate, probabilities, basisLabel } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { noisyRho, stateFidelity, type ChannelName } from "./noise";
import { ErrorCard as SharedErrorCard, LabeledSlider, WidgetCard, fieldClass } from "./widget-ui";
import { formatPercent, percentSR } from "./format";

/**
 * Inline noise-visualizer widget rendered from a ```qnoise fenced block in a
 * GUIDE. Parses the shared gate DSL, runs ideal state-vector simulation and a
 * density-matrix Kraus-operator simulation side-by-side, and shows per-basis
 * ideal vs noisy probability bars plus a fidelity readout.
 */

/**
 * Everything that varies per noise channel, in ONE table: the select label, the
 * slider label, and the slider's upper bound. These were previously three
 * parallel channel-keyed mappings (a {value,label} array, an if/if/return
 * label function, and a `p === "depolarizing" ? 0.75 : 1` ternary written out
 * twice), so adding a channel meant four edits and missing the second ternary
 * silently desynced the render-time clamp from the switch-time one.
 *
 * `param` is channel-specific because the slider drives a different physical
 * quantity each time (Pauli-error probability, amplitude-damping rate, flip
 * probability) — not a generic "error rate". `max` is teaching-meaningful:
 * depolarizing tops out at p = 0.75, where the Kraus weights (sqrt(p/3) on each
 * of X, Y, Z) make the state maximally mixed; past that the channel would start
 * un-mixing, which is not a thing hardware does.
 */
const CHANNEL_INFO: Record<ChannelName, { label: string; param: string; max: number }> = {
  depolarizing: { label: "Depolarizing", param: "Depolarizing p", max: 0.75 },
  "amplitude-damping": { label: "Amplitude damping", param: "Damping γ", max: 1 },
  "bit-flip": { label: "Bit flip", param: "Flip probability", max: 1 },
};

// Keyed by the ChannelName union, so adding a channel to noise.ts fails
// typecheck here until its label/param/max are declared. Object.keys preserves
// declaration order, so the select renders unchanged.
const CHANNELS = (Object.keys(CHANNEL_INFO) as ChannelName[]).map((value) => ({
  value,
  ...CHANNEL_INFO[value],
}));

function channelInfo(channel: ChannelName) {
  return CHANNEL_INFO[channel];
}

export function NoiseVisualizer({ source }: { source: string }) {
  const program = useMemo(() => parseProgram(source), [source]);

  const [channel, setChannel] = useState<ChannelName>("depolarizing");
  const [p, setP] = useState(0);

  const channelId = useId();

  // Slider max depends on channel; clamp p when switching from a higher-max channel.
  const { max: pMax, param: paramLabel } = channelInfo(channel);
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
    return `Largest shift at basis ${basisLabel(mi, program.n)}: ideal ${percentSR((ideal[mi] ?? 0) * 100, 0)}, noisy ${percentSR((noisy[mi] ?? 0) * 100, 0)}.`;
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
    const nextMax = channelInfo(next).max;
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
          className="font-mono text-xs tabular-nums text-caption"
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
              <span className="w-12 shrink-0 font-mono text-xs text-caption">
                |{basisLabel(idx, program.n)}&#10217;
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                {/* Ideal bar */}
                <div className="flex items-center gap-1.5">
                  <span className="w-8 shrink-0 text-[10px] text-caption">ideal</span>
                  <span className="relative h-2.5 flex-1 rounded-full bg-(--track) overflow-hidden">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bar-fill"
                      style={{ width: `${(idealP * 100).toFixed(2)}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-caption">
                    {formatPercent(idealP * 100)}
                  </span>
                </div>
                {/* Noisy bar */}
                <div className="flex items-center gap-1.5">
                  <span className="w-8 shrink-0 text-[10px] text-caption">noisy</span>
                  <span className="relative h-2.5 flex-1 rounded-full bg-(--track) overflow-hidden">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
                      style={{ width: `${(noisyP * 100).toFixed(2)}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-caption">
                    {formatPercent(noisyP * 100)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="border-t border-(--bd) px-4 py-3 space-y-3">
        {/* Channel select */}
        <div className="flex items-center gap-3">
          <label
            htmlFor={channelId}
            className="shrink-0 text-xs text-caption"
          >
            Channel
          </label>
          <select
            id={channelId}
            value={channel}
            onChange={(e) => handleChannelChange(e.target.value as ChannelName)}
            className={`${fieldClass} flex-1 px-2 py-1 text-xs`}
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Error rate slider */}
        <LabeledSlider
          label={paramLabel}
          value={pClamped}
          min={0}
          max={pMax}
          step={0.01}
          onChange={setP}
          ariaLabel={paramLabel}
          ariaValueText={formatPercent(pClamped * 100, 0)}
          display={formatPercent(pClamped * 100, 0)}
          labelClassName="shrink-0 text-xs text-caption"
          valueWidth="w-10"
        />
      </div>
    </WidgetCard>
  );
}
