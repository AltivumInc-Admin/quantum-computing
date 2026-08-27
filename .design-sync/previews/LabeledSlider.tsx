// LabeledSlider — one labeled range-slider row shared by every explorable that
// exposes a numeric control (rotation angle, phase, circuit depth, shots).
// CONTROLLED: the cell owns the value via React.useState and feeds onChange back.
import * as React from "react";
import { LabeledSlider } from "quantum-ds";

export function RotationAngle() {
  // RY rotation angle θ over [0, π], the canonical single-qubit amplitude knob.
  const [theta, setTheta] = React.useState(1.57);
  return (
    <div style={{ padding: 20 }}>
      <LabeledSlider
        label="θ"
        value={theta}
        min={0}
        max={Math.PI}
        step={0.01}
        onChange={setTheta}
        ariaLabel="Rotation angle theta"
        ariaValueText={`${theta.toFixed(2)} radians`}
        display={`${theta.toFixed(2)} rad`}
      />
    </div>
  );
}

export function PhaseAngle() {
  // Relative phase φ over [0, 2π] — the Bloch-sphere azimuth.
  const [phi, setPhi] = React.useState(3.93);
  return (
    <div style={{ padding: 20 }}>
      <LabeledSlider
        label="φ"
        value={phi}
        min={0}
        max={2 * Math.PI}
        step={0.01}
        onChange={setPhi}
        ariaLabel="Phase angle phi"
        ariaValueText={`${phi.toFixed(2)} radians`}
        display={`${phi.toFixed(2)} rad`}
      />
    </div>
  );
}

export function CircuitDepth() {
  // Integer control: parse with base-10 parseInt so steps land on whole layers.
  const [depth, setDepth] = React.useState(6);
  return (
    <div style={{ padding: 20 }}>
      <LabeledSlider
        label="depth"
        value={depth}
        min={1}
        max={20}
        step={1}
        parse={(raw) => parseInt(raw, 10)}
        onChange={setDepth}
        ariaLabel="Ansatz circuit depth in layers"
        ariaValueText={`${depth} layers`}
        display={`${depth}`}
      />
    </div>
  );
}

export function Shots() {
  // Measurement shots — the sampling budget for a Braket task.
  const [shots, setShots] = React.useState(1000);
  return (
    <div style={{ padding: 20 }}>
      <LabeledSlider
        label="shots"
        value={shots}
        min={100}
        max={10000}
        step={100}
        parse={(raw) => parseInt(raw, 10)}
        onChange={setShots}
        ariaLabel="Measurement shots"
        ariaValueText={`${shots} shots`}
        display={shots.toLocaleString()}
        valueWidth="w-20"
      />
    </div>
  );
}
