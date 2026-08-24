// GateChip — one monospace gate pill. `active` swaps the muted gray fill for the
// accent `chip-selected` fill (used by the scrubber to mark the current step).
import { GateChip } from "quantum-ds";

export function Inactive() {
  return (
    <div style={{ padding: 20 }}>
      <GateChip label="H q0" />
    </div>
  );
}

export function Active() {
  return (
    <div style={{ padding: 20 }}>
      <GateChip label="RY(1.57) q0" active />
    </div>
  );
}

export function Controlled() {
  return (
    <div style={{ padding: 20 }}>
      <GateChip label="CNOT 0&rarr;1" />
    </div>
  );
}

export function BoundRotation() {
  return (
    <div style={{ padding: 20 }}>
      <GateChip label="RZ(&theta;) q1" active />
    </div>
  );
}
