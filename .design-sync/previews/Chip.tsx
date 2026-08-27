// Chip — a compact monospace pill for circuit metadata and gate labels.
import { Chip } from "quantum-ds";

export function Metadata() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 20 }}>
      <Chip>2 qubits</Chip>
      <Chip>depth 4</Chip>
      <Chip>1024 shots</Chip>
    </div>
  );
}

export function GateSequence() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 20 }}>
      <Chip>H q0</Chip>
      <Chip>CNOT 0&rarr;1</Chip>
      <Chip>measure</Chip>
    </div>
  );
}
