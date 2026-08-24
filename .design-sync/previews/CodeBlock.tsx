// CodeBlock — the dark GUIDE code fence: a language chip, a copy button (copying
// the RAW source), and a word-wrap toggle. In the app `children` are the
// rehype-highlight token spans; here we pass plain <code> text on the same chrome.
import { CodeBlock } from "quantum-ds";

const BRAKET = `from braket.circuits import Circuit
from braket.devices import LocalSimulator

bell = Circuit().h(0).cnot(0, 1)
device = LocalSimulator()
result = device.run(bell, shots=1000).result()
print(result.measurement_counts)`;

export function BraketBell() {
  return (
    <div style={{ padding: 20 }}>
      <CodeBlock rawText={BRAKET} language="python">
        <code>{BRAKET}</code>
      </CodeBlock>
    </div>
  );
}

const PENNYLANE = `import pennylane as qml

dev = qml.device("braket.local.qubit", wires=2)

@qml.qnode(dev)
def circuit(theta):
    qml.RY(theta, wires=0)
    qml.CNOT(wires=[0, 1])
    return qml.expval(qml.PauliZ(0))`;

export function PennyLaneQNode() {
  return (
    <div style={{ padding: 20 }}>
      <CodeBlock rawText={PENNYLANE} language="python">
        <code>{PENNYLANE}</code>
      </CodeBlock>
    </div>
  );
}

const QASM = `OPENQASM 3.0;
qubit[2] q;
bit[2] c;
h q[0];
cnot q[0], q[1];
c = measure q;`;

export function OpenQasm() {
  return (
    <div style={{ padding: 20 }}>
      <CodeBlock rawText={QASM} language="qasm">
        <code>{QASM}</code>
      </CodeBlock>
    </div>
  );
}
