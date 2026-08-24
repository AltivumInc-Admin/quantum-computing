// ProbBars — one accent-filled bar per computational basis state (|label⟩ +
// percentage). `probs` is a number[] of length 2^n; `n` sets the qubit labels.
import { ProbBars } from "quantum-ds";

export function Superposition() {
  // One qubit after H: an even split across |0⟩ and |1⟩.
  return (
    <div style={{ padding: 20 }}>
      <ProbBars probs={[0.5, 0.5]} n={1} />
    </div>
  );
}

export function BellState() {
  // Two-qubit Bell pair: mass on |00⟩ and |11⟩, nothing on the odd-parity states.
  return (
    <div style={{ padding: 20 }}>
      <ProbBars probs={[0.5, 0, 0, 0.5]} n={2} />
    </div>
  );
}

export function GroverPeak() {
  // A single-iteration Grover search amplifying the marked state |01⟩.
  return (
    <div style={{ padding: 20 }}>
      <ProbBars probs={[0.03, 0.9, 0.05, 0.02]} n={2} />
    </div>
  );
}

export function GHZ() {
  // Three-qubit GHZ state: (|000⟩ + |111⟩)/√2 across all eight basis rows.
  return (
    <div style={{ padding: 20 }}>
      <ProbBars probs={[0.5, 0, 0, 0, 0, 0, 0, 0.5]} n={3} />
    </div>
  );
}
