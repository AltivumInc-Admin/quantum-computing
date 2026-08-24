// StateReadout — the Dirac (bra-ket) state line with copy-as-notation and
// copy-as-Python affordances. Complex amplitudes are [re, im] tuples.
import { StateReadout } from "quantum-ds";

const s = Math.SQRT1_2;

export function PlusState() {
  // (|0> + |1>) / sqrt(2)
  return (
    <div style={{ padding: 20 }}>
      <StateReadout state={[[s, 0], [s, 0]]} n={1} />
    </div>
  );
}

export function BellState() {
  // (|00> + |11>) / sqrt(2)
  return (
    <div style={{ padding: 20 }}>
      <StateReadout state={[[s, 0], [0, 0], [0, 0], [s, 0]]} n={2} />
    </div>
  );
}
