"use client";

import { useEffect, useId, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { simulateSteps, probabilities, zeroState, basisLabel } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { diracString, toPythonState } from "./state-readout";
import { BlochDial } from "./bloch-dial";
import { CopyButton } from "../copy-button";
import { usePrefersReducedMotion, useWebGL } from "./use-display-caps";

/**
 * Scrubbable, gate-by-gate state-evolution player rendered from a ```qscrub
 * fenced block in a GUIDE. Reuses the shared qsim DSL + the qcsim-parity kernel
 * (simulateSteps), so the final frame is identical to the static CircuitLab.
 * The single-qubit Bloch readout upgrades to a draggable 3D sphere when motion
 * is allowed and WebGL is present, falling back to the 2D BlochDial otherwise.
 */

// three.js is heavy; load it lazily and never on the server (static export).
const BlochSphere3D = dynamic(() => import("./bloch-sphere-3d"), { ssr: false });

const STEP_MS = 750;

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {playing ? (
        <path d="M8 5h3v14H8zM13 5h3v14h-3z" />
      ) : (
        <path d="M8 5v14l11-7z" />
      )}
    </svg>
  );
}

export function WavefunctionScrubber({ source }: { source: string }) {
  const program = useMemo(() => parseProgram(source), [source]);
  const [theta, setTheta] = useState(Math.PI / 2);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sliderId = useId();
  const thetaId = useId();
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGL();

  const frames = useMemo(
    () => (program.error ? [] : simulateSteps(opsFor(program, theta), program.n)),
    [program, theta]
  );
  const lastStep = Math.max(0, frames.length - 1);
  // Clamp at render so a shrinking circuit can't leave the scrubber past the end
  // (no clamp effect needed).
  const safeStep = Math.min(step, lastStep);

  // Auto-advance while playing. The only state update happens asynchronously
  // inside the timeout; the effect body itself never calls setState.
  useEffect(() => {
    if (!playing || reduced || safeStep >= lastStep) return;
    const id = setTimeout(() => setStep((s) => Math.min(s + 1, lastStep)), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, safeStep, lastStep, reduced]);

  const isPlaying = playing && safeStep < lastStep;
  const togglePlay = () => {
    if (safeStep >= lastStep) {
      setStep(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  if (program.error) {
    return (
      <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) px-4 py-3">
        <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
          qsim parse error: {program.error}
        </p>
      </div>
    );
  }

  const current = frames[safeStep] ?? zeroState(program.n);
  const probs = probabilities(current);
  const activeGate = safeStep - 1; // gate that produced the current frame (-1 = initial)
  const show3D = !reduced && webgl && program.n === 1;

  const gateChips = program.gates.map((g, i) => {
    const label =
      g.gate === "CNOT"
        ? `CNOT ${g.control}→${g.target}`
        : g.bound
          ? `${g.gate}(θ) q${g.target}`
          : g.angle !== undefined
            ? `${g.gate}(${g.angle.toFixed(2)}) q${g.target}`
            : `${g.gate} q${g.target}`;
    const active = i === activeGate;
    return (
      <span
        key={i}
        className={`rounded-chip px-2 py-0.5 text-[11px] font-mono transition-colors duration-150 ${
          active
            ? "bg-accent text-white dark:text-gray-950"
            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
        }`}
      >
        {label}
      </span>
    );
  });

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Wavefunction scrubber
        </span>
        <div className="flex flex-wrap gap-1">{gateChips}</div>
      </div>

      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="space-y-1.5">
            {probs.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-12 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                  |{basisLabel(idx, program.n)}&#10217;
                </span>
                <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${(p * 100).toFixed(2)}%` }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {(p * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2">
            <p className="min-w-0 flex-1 break-words font-mono text-sm text-gray-700 dark:text-gray-200">
              <span className="text-gray-400 dark:text-gray-500">|&#968;&#10217; = </span>
              <span className="text-accent dark:text-accent-light">
                {diracString(current, program.n)}
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <CopyButton getText={() => diracString(current, program.n)} label="Copy state notation" />
              <span className="flex items-center">
                <CopyButton getText={() => toPythonState(current)} label="Copy state as runnable Python" />
                <span className="-ml-1 rounded bg-accent/10 px-1 py-0.5 font-mono text-[9px] text-accent-dark dark:text-accent-light">py</span>
              </span>
            </div>
          </div>
        </div>

        {program.n === 1 &&
          (show3D ? (
            <BlochSphere3D state={current} />
          ) : (
            <BlochDial state={current} />
          ))}
      </div>

      {/* Scrub timeline */}
      <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        {!reduced && lastStep > 0 && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause animation" : "Play animation"}
            aria-pressed={isPlaying}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent-dark hover:bg-accent/20 dark:text-accent-light interactive focus-ring"
          >
            <PlayIcon playing={isPlaying} />
          </button>
        )}
        <input
          id={sliderId}
          type="range"
          min={0}
          max={lastStep}
          step={1}
          value={safeStep}
          onChange={(e) => {
            setPlaying(false);
            setStep(parseInt(e.target.value, 10));
          }}
          aria-label="Step through the circuit"
          aria-valuetext={`step ${safeStep} of ${lastStep}`}
          className="slider flex-1 focus-ring"
        />
        <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
          step {safeStep}/{lastStep}
        </span>
      </div>

      {program.hasTheta && (
        <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3">
          <label htmlFor={thetaId} className="font-mono text-sm text-gray-600 dark:text-gray-300">
            &#952;
          </label>
          <input
            id={thetaId}
            type="range"
            min={0}
            max={2 * Math.PI}
            step={Math.PI / 60}
            value={theta}
            onChange={(e) => setTheta(parseFloat(e.target.value))}
            aria-label="Rotation angle theta in radians"
            aria-valuetext={`${theta.toFixed(2)} radians`}
            className="slider flex-1 focus-ring"
          />
          <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {theta.toFixed(2)} rad
          </span>
        </div>
      )}
    </div>
  );
}
