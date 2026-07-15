"use client";

import { useMemo, useState } from "react";
import { simulate, probabilities, basisLabel } from "@/components/quantum/math";
import { opsFor, type Program } from "@/components/quantum/qsim-dsl";
import { sampleCounts } from "@/components/quantum/shots";
import { mulberry32 } from "@/components/quantum/rng";
import { Bar } from "@/components/quantum/widget-ui";
import { formatPercent } from "@/components/quantum/format";
import { Panel } from "@/components/workspace/panel";
import { benchButtonClass, benchFieldClass } from "./controls";

/**
 * Seeded Born-rule sampling of the bench's circuit — the shots-sampler pattern
 * with a deterministic RNG (mulberry32) so a given seed always reproduces the
 * same histogram, shareable and testable. Always samples the FINAL state: the
 * State panel's scrubber is a viewing control, not a measurement point —
 * hardware measures after the whole circuit, so this must too.
 */

const SHOT_CHOICES = [10, 100, 1000] as const;
/** Prime stride keeps the seed+nonce streams of adjacent seeds from colliding. */
export const NONCE_STRIDE = 7919;

export function SamplingPanel({ program, theta }: { program: Program; theta: number }) {
  const [shots, setShots] = useState<number>(100);
  const [seed, setSeed] = useState(42);
  const [nonce, setNonce] = useState(0); // Resample bumps this — same seed, fresh draw

  const probs = useMemo(
    () => probabilities(simulate(opsFor(program, theta), program.n)),
    [program, theta],
  );
  const counts = useMemo(
    () => sampleCounts(probs, shots, mulberry32((seed + nonce * NONCE_STRIDE) | 0)),
    [probs, shots, seed, nonce],
  );

  return (
    <Panel title="Sampling" id="sampling" sub={`${shots.toLocaleString()} shots`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-gray-500 dark:text-gray-400">Shots:</span>
        {SHOT_CHOICES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setShots(n)}
            aria-pressed={shots === n}
            aria-label={`${n} shots`}
            className={[
              "rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors interactive focus-ring",
              shots === n
                ? "chip-selected"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
            ].join(" ")}
          >
            {n}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          Seed
          <input
            type="number"
            step={1}
            value={seed}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setSeed(Number.isFinite(v) ? v : 0);
            }}
            className={`${benchFieldClass} w-20 px-2 py-1 font-mono text-xs tabular-nums`}
          />
        </label>
        <button type="button" onClick={() => setNonce((x) => x + 1)} className={benchButtonClass}>
          Resample
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {probs.map((p, idx) => {
          const empirical = shots > 0 ? counts[idx] / shots : 0;
          const exactPct = formatPercent(p * 100);
          const empiricalPct = formatPercent(empirical * 100);
          return (
            <Bar
              key={idx}
              label={basisLabel(idx, program.n)}
              fraction={empirical}
              fillClass="bg-accent/70"
              valueWidth="w-24"
              marker={{ fraction: p, title: `Exact: ${exactPct}` }}
              ariaLabel={`Basis ${basisLabel(idx, program.n)}: sampled ${empiricalPct}, exact ${exactPct}`}
              valueText={
                <>
                  <span className="text-gray-700 dark:text-gray-200">{empiricalPct}</span>
                  <span className="text-caption"> / {exactPct}</span>
                </>
              }
            />
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-caption">
        Sampled counts (seed {seed}), not exact probabilities — each tick marks the exact
        value. Samples always draw from the final state; real hardware adds device noise on
        top of this sampling spread.
      </p>
    </Panel>
  );
}
