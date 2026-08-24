// ErrorCard — the rim-lit card shell reused to surface a failed parse or run.
// Renders "{label} error: {message}" in muted mono. Pass className="" to drop
// the default my-6 margin inside a preview cell.
import { ErrorCard } from "quantum-ds";

export function ParseError() {
  return (
    <div style={{ padding: 20 }}>
      <ErrorCard
        label="qsim"
        message="unknown gate 'TOFFOLI' on line 3"
        className=""
      />
    </div>
  );
}

export function QubitBudget() {
  return (
    <div style={{ padding: 20 }}>
      <ErrorCard
        label="Circuit"
        message="qubit index 5 exceeds MAX_QUBITS (4)"
        className=""
      />
    </div>
  );
}

export function DeviceOffline() {
  return (
    <div style={{ padding: 20 }}>
      <ErrorCard
        label="Braket"
        message="device Aria-1 is retired; try Forte-1"
        className=""
      />
    </div>
  );
}
