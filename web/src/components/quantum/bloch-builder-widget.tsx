"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BlochDial } from "./bloch-dial";
import { stateFromAngles, probsFromAngles } from "./bloch-builder";
import { GateChip, LabeledSlider, ProbBars, StateReadout, WidgetCard } from "./widget-ui";
import { usePrefersReducedMotion, useWebGL } from "./use-display-caps";

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
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGL();

  const state = useMemo(() => stateFromAngles(theta, phi), [theta, phi]);
  const { p0, p1 } = useMemo(() => probsFromAngles(theta), [theta]);
  const show3D = !reduced && webgl;

  const probs = [p0, p1];

  return (
    <WidgetCard
      eyebrow="Build a state"
      chips={
        <div className="flex flex-wrap gap-1">
          <GateChip label="|ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩" />
        </div>
      }
    >
      {/* Main content */}
      <div className="flex flex-col sm:flex-row gap-6 px-4 py-4">
        {/* Left column: prob bars + Dirac string + copy buttons */}
        <div className="flex-1 min-w-0" role="status" aria-live="polite">
          <ProbBars probs={probs} n={1} />
          <StateReadout state={state} n={1} />
        </div>

        {/* Right column: Bloch sphere or dial */}
        {show3D ? (
          <BlochSphere3D state={state} />
        ) : (
          <BlochDial state={state} size={180} />
        )}
      </div>

      {/* Slider: theta */}
      <LabeledSlider
        label={<>&#952;</>}
        value={theta}
        min={0}
        max={Math.PI}
        step={Math.PI / 60}
        onChange={setTheta}
        ariaLabel="Polar angle theta in radians"
        ariaValueText={`${theta.toFixed(2)} radians`}
        display={`${theta.toFixed(2)} rad`}
        rowClassName="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3"
        labelClassName="w-4 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300"
      />

      {/* Slider: phi */}
      <LabeledSlider
        label={<>&#966;</>}
        value={phi}
        min={0}
        max={2 * Math.PI}
        step={Math.PI / 60}
        onChange={setPhi}
        ariaLabel="Azimuthal angle phi in radians"
        ariaValueText={`${phi.toFixed(2)} radians`}
        display={`${phi.toFixed(2)} rad`}
        rowClassName="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3"
        labelClassName="w-4 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300"
      />
    </WidgetCard>
  );
}
