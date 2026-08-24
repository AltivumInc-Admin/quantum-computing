// EyebrowLabel — the tiny accent, uppercase, wide-tracked kicker that sits above
// an explorable's body. `as="h3"` promotes it to a real heading for the outline.
import { EyebrowLabel } from "quantum-ds";

export function AsSpan() {
  return (
    <div style={{ padding: 20 }}>
      <EyebrowLabel>Superposition</EyebrowLabel>
    </div>
  );
}

export function AsHeading() {
  return (
    <div style={{ padding: 20 }}>
      <EyebrowLabel as="h3">Bell State</EyebrowLabel>
    </div>
  );
}

export function Interference() {
  return (
    <div style={{ padding: 20 }}>
      <EyebrowLabel as="h3">Quantum Interference</EyebrowLabel>
    </div>
  );
}
