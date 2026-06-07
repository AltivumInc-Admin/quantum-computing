"use client";

import { useId, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BlochDial } from "./bloch-dial";
import { stateFromAngles, probsFromAngles } from "./bloch-builder";
import { diracString, toPythonState } from "./state-readout";
import { basisLabel } from "./math";
import { usePrefersReducedMotion, useWebGL } from "./use-display-caps";
import { CopyButton } from "../copy-button";

const BlochSphere3D = dynamic(() => import("./bloch-sphere-3d"), { ssr: false });

/**
 * Interactive "Build a state" playground rendered from a ```qbloch fenced block.
 * The θ and φ sliders drive |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩, shown on
 * the draggable 3D Bloch sphere (with a 2D BlochDial fallback when WebGL or
 * motion is unavailable). Shows P(0)/P(1) probability bars, the Dirac state
 * string, a copy-as-Python button, and the gate sequence.
 */
export function BlochBuilder() {
  const [theta, setTheta] = useState(Math.PI / 2);
  const [phi, setPhi] = useState(0);
  const thetaId = useId();
  const phiId = useId();
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGL();

  const state = useMemo(() => stateFromAngles(theta, phi), [theta, phi]);
  const { p0, p1 } = useMemo(() => probsFromAngles(theta), [theta]);
  const show3D = !reduced && webgl;

  const gateSeq = `RY ${theta.toFixed(2)}  RZ ${phi.toFixed(2)}`;

  const probs = [p0, p1];

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Build a state
        </span>
        <div className="flex flex-wrap gap-1">
          <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
            {gateSeq}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col sm:flex-row gap-6 px-4 py-4">
        {/* Left column: prob bars + Dirac string + copy buttons */}
        <div className="flex-1 min-w-0">
          <div className="space-y-1.5">
            {probs.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-12 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                  |{basisLabel(idx, 1)}&#10217;
                </span>
                <span className="relative h-3 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
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

          {/* Dirac string + copy buttons */}
          <div className="mt-4 flex items-start gap-2">
            <p className="min-w-0 flex-1 font-mono text-sm text-gray-700 dark:text-gray-200 break-words">
              <span className="text-gray-400 dark:text-gray-500">|&#968;&#10217; = </span>
              <span className="text-accent dark:text-accent-light">{diracString(state, 1)}</span>
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <CopyButton getText={() => diracString(state, 1)} label="Copy state notation" />
              <span className="flex items-center">
                <CopyButton getText={() => toPythonState(state)} label="Copy state as runnable Python" />
                <span className="-ml-1 rounded bg-accent/10 px-1 py-0.5 font-mono text-[9px] text-accent-dark dark:text-accent-light">py</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right column: Bloch sphere or dial */}
        {show3D ? (
          <BlochSphere3D state={state} />
        ) : (
          <BlochDial state={state} />
        )}
      </div>

      {/* Slider: theta */}
      <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <label htmlFor={thetaId} className="font-mono text-sm text-gray-600 dark:text-gray-300 w-4 shrink-0">
          &#952;
        </label>
        <input
          id={thetaId}
          type="range"
          min={0}
          max={Math.PI}
          step={Math.PI / 60}
          value={theta}
          onChange={(e) => setTheta(parseFloat(e.target.value))}
          className="slider flex-1 focus-ring"
          aria-label="Polar angle theta in radians"
          aria-valuetext={`${theta.toFixed(2)} radians`}
        />
        <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {theta.toFixed(2)} rad
        </span>
      </div>

      {/* Slider: phi */}
      <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <label htmlFor={phiId} className="font-mono text-sm text-gray-600 dark:text-gray-300 w-4 shrink-0">
          &#966;
        </label>
        <input
          id={phiId}
          type="range"
          min={0}
          max={2 * Math.PI}
          step={Math.PI / 60}
          value={phi}
          onChange={(e) => setPhi(parseFloat(e.target.value))}
          className="slider flex-1 focus-ring"
          aria-label="Azimuthal angle phi in radians"
          aria-valuetext={`${phi.toFixed(2)} radians`}
        />
        <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {phi.toFixed(2)} rad
        </span>
      </div>
    </div>
  );
}
