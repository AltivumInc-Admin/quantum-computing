// GateChips — the row of gate pills for a parsed program. It renders a bare
// fragment, so wrap it in a flex/wrap div. `activeIndex` highlights one step.
import { GateChips } from "quantum-ds";

const row = { display: "flex", flexWrap: "wrap" as const, gap: 8, padding: 20 };

export function BellCircuit() {
  // H on q0 then CNOT 0->1 — the canonical entangling circuit.
  return (
    <div style={row}>
      <GateChips
        gates={[
          { gate: "H", target: 0 },
          { gate: "CNOT", target: 1, control: 0 },
        ]}
      />
    </div>
  );
}

export function ScrubberStep() {
  // Mid-playback: the RY rotation (index 1) is the current step.
  return (
    <div style={row}>
      <GateChips
        gates={[
          { gate: "H", target: 0 },
          { gate: "RY", target: 0, theta: 1.57 },
          { gate: "CNOT", target: 1, control: 0 },
        ]}
        activeIndex={1}
      />
    </div>
  );
}

export function VariationalAnsatz() {
  // A slider-bound two-qubit ansatz — bound rotations render as RY(theta) qN.
  return (
    <div style={row}>
      <GateChips
        gates={[
          { gate: "RY", target: 0, theta: 0.79, bound: true },
          { gate: "RY", target: 1, theta: 1.05, bound: true },
          { gate: "CNOT", target: 1, control: 0 },
          { gate: "RZ", target: 0, theta: 0.52, bound: true },
        ]}
      />
    </div>
  );
}
