"""Common reusable circuit patterns for Amazon Braket."""

from braket.circuits import Circuit
import numpy as np


def bell_pair(qubit_0: int = 0, qubit_1: int = 1) -> Circuit:
    """Create a Bell pair (maximally entangled two-qubit state).

    Produces the state: (|00> + |11>) / sqrt(2)
    """
    circuit = Circuit()
    circuit.h(qubit_0)
    circuit.cnot(qubit_0, qubit_1)
    return circuit


def ghz_state(n_qubits: int = 3) -> Circuit:
    """Create a GHZ state (maximally entangled n-qubit state).

    Produces the state: (|00...0> + |11...1>) / sqrt(2)
    """
    circuit = Circuit()
    circuit.h(0)
    for i in range(n_qubits - 1):
        circuit.cnot(i, i + 1)
    return circuit


def qft_circuit(n_qubits: int) -> Circuit:
    """Create a Quantum Fourier Transform circuit."""
    circuit = Circuit()
    for i in range(n_qubits):
        circuit.h(i)
        for j in range(i + 1, n_qubits):
            angle = np.pi / (2 ** (j - i))
            circuit.cphaseshift(j, i, angle)
    for i in range(n_qubits // 2):
        circuit.swap(i, n_qubits - i - 1)
    return circuit
