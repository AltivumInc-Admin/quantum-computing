"""Reference library of quantum gates with their matrix representations and effects."""

import numpy as np
from braket.circuits import Circuit


GATES = {
    "X": {
        "matrix": np.array([[0, 1], [1, 0]]),
        "description": "Pauli-X (NOT gate). Flips |0> to |1> and vice versa.",
        "effect_on_zero": "|1>",
        "effect_on_one": "|0>",
    },
    "Y": {
        "matrix": np.array([[0, -1j], [1j, 0]]),
        "description": "Pauli-Y. Rotation about Y-axis by pi.",
        "effect_on_zero": "i|1>",
        "effect_on_one": "-i|0>",
    },
    "Z": {
        "matrix": np.array([[1, 0], [0, -1]]),
        "description": "Pauli-Z. Phase flip on |1>.",
        "effect_on_zero": "|0>",
        "effect_on_one": "-|1>",
    },
    "H": {
        "matrix": (1 / np.sqrt(2)) * np.array([[1, 1], [1, -1]]),
        "description": "Hadamard. Creates equal superposition.",
        "effect_on_zero": "(|0> + |1>)/sqrt(2)",
        "effect_on_one": "(|0> - |1>)/sqrt(2)",
    },
    "S": {
        "matrix": np.array([[1, 0], [0, 1j]]),
        "description": "S gate (sqrt(Z)). Adds pi/2 phase to |1>.",
        "effect_on_zero": "|0>",
        "effect_on_one": "i|1>",
    },
    "T": {
        "matrix": np.array([[1, 0], [0, np.exp(1j * np.pi / 4)]]),
        "description": "T gate (sqrt(S)). Adds pi/4 phase to |1>.",
        "effect_on_zero": "|0>",
        "effect_on_one": "e^(i*pi/4)|1>",
    },
}


def demonstrate_gate(gate_name: str, shots: int = 1000) -> dict:
    """Run a gate on |0> and |1> and return measurement statistics."""
    if gate_name not in GATES:
        raise ValueError(f"Unknown gate: {gate_name}. Available: {list(GATES.keys())}")

    from braket.devices import LocalSimulator
    device = LocalSimulator()
    results = {}

    # Apply to |0>
    circuit_zero = Circuit()
    getattr(circuit_zero, gate_name.lower())(0)
    result_zero = device.run(circuit_zero, shots=shots).result()
    results["input_zero"] = dict(result_zero.measurement_counts)

    # Apply to |1> (prepare |1> with X gate first)
    circuit_one = Circuit()
    circuit_one.x(0)
    getattr(circuit_one, gate_name.lower())(0)
    result_one = device.run(circuit_one, shots=shots).result()
    results["input_one"] = dict(result_one.measurement_counts)

    return results


def print_gate_info(gate_name: str):
    """Print a gate's matrix and properties."""
    gate = GATES[gate_name]
    print(f"=== {gate_name} Gate ===")
    print(f"Description: {gate['description']}")
    print(f"Matrix:\n{gate['matrix']}")
    print(f"|0> -> {gate['effect_on_zero']}")
    print(f"|1> -> {gate['effect_on_one']}")
    print()


if __name__ == "__main__":
    for name in GATES:
        print_gate_info(name)
