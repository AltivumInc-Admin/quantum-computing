"""Common reusable circuit patterns for Amazon Braket."""

import numpy as np
from braket.circuits import Circuit


def bell_pair(qubit_0: int = 0, qubit_1: int = 1) -> Circuit:
    """Create a Bell pair (maximally entangled two-qubit state).

    Produces the state: (|00> + |11>) / sqrt(2)

    Args:
        qubit_0: First qubit (the Hadamard / control qubit).
        qubit_1: Second qubit (the CNOT target). Must differ from ``qubit_0``.

    Returns:
        Circuit preparing the Bell pair on the two given qubits.

    Raises:
        ValueError: if ``qubit_0`` and ``qubit_1`` are the same qubit.
    """
    if qubit_0 == qubit_1:
        raise ValueError(f"qubit_0 and qubit_1 must be distinct (both were {qubit_0})")
    circuit = Circuit()
    circuit.h(qubit_0)
    circuit.cnot(qubit_0, qubit_1)
    return circuit


def ghz_state(n_qubits: int = 3) -> Circuit:
    """Create a GHZ state: (|00...0> + |11...1>) / sqrt(2).

    For ``n_qubits >= 2`` this is a maximally entangled state. ``n_qubits=1``
    is legal but degenerates to the single-qubit |+> = (|0> + |1>)/sqrt(2),
    a product state carrying no entanglement — the formula still holds, the
    entanglement does not.

    Args:
        n_qubits: Number of qubits in the state. Must be >= 1.

    Returns:
        Circuit preparing the GHZ state on qubits 0..n_qubits-1.

    Raises:
        ValueError: if ``n_qubits`` is less than 1.
    """
    if n_qubits < 1:
        raise ValueError(f"n_qubits must be >= 1 (got {n_qubits})")
    circuit = Circuit()
    circuit.h(0)
    for i in range(n_qubits - 1):
        circuit.cnot(i, i + 1)
    return circuit


def qft_circuit(n_qubits: int) -> Circuit:
    """Create a Quantum Fourier Transform circuit on ``n_qubits`` qubits.

    Computes ``QFT|j> = (1/sqrt(N)) * sum_k exp(+2*pi*i*j*k/N) |k>`` with
    ``N = 2**n_qubits``, where qubit 0 is the most-significant bit of the basis
    index (Braket's big-endian convention).

    Applies the standard QFT: on each qubit a Hadamard followed by
    controlled-phase rotations from every higher-index qubit, then a final
    layer of swaps.

    Args:
        n_qubits: Number of qubits to transform. Must be >= 1.

    Returns:
        Circuit implementing the QFT. The trailing ``swap`` layer reverses the
        qubit order (the standard QFT bit-reversal step), so the output register
        reads in conventional most-significant-first order rather than the
        bit-reversed order the phase-rotation stage leaves it in. The sign of
        the exponent is a contract, not an incidental choice: the amplitudes
        are ``e^{+2*pi*i*j*k/N}/sqrt(N)`` — the PLUS convention, equal to
        ``sqrt(N) * np.fft.ifft`` and NOT ``np.fft.fft`` — matching the web
        mirror ``web/src/components/quantum/qft.ts`` and pinned by
        ``tests/test_circuits.py::test_qft_circuit_matches_analytic_dft``.

    Raises:
        ValueError: if ``n_qubits`` is less than 1.
    """
    if n_qubits < 1:
        raise ValueError(f"n_qubits must be >= 1 (got {n_qubits})")
    circuit = Circuit()
    for i in range(n_qubits):
        circuit.h(i)
        for j in range(i + 1, n_qubits):
            angle = np.pi / (2 ** (j - i))
            circuit.cphaseshift(j, i, angle)
    # Reverse qubit order (bit-reversal) so the transformed register reads in
    # conventional order; the phase-rotation stage above leaves it bit-reversed.
    for i in range(n_qubits // 2):
        circuit.swap(i, n_qubits - i - 1)
    return circuit
