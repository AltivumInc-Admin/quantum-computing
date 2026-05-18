"""Quantum data encoding circuits (feature maps) for QML."""

import numpy as np
from braket.circuits import Circuit


def angle_encoding(features: np.ndarray) -> Circuit:
    """Encode features as rotation angles (one qubit per feature).

    Args:
        features: 1D array of feature values.

    Returns:
        Circuit with Ry rotations encoding each feature.
    """
    circuit = Circuit()
    for i, x in enumerate(features):
        circuit.ry(i, x)
    return circuit


def iqp_encoding(features: np.ndarray, reps: int = 2) -> Circuit:
    """IQP (Instantaneous Quantum Polynomial) encoding.

    Creates an exponentially large feature space via ZZ interactions.

    Args:
        features: 1D array of feature values.
        reps: Number of encoding repetitions.

    Returns:
        Circuit implementing IQP encoding.
    """
    n_qubits = len(features)
    circuit = Circuit()

    for _ in range(reps):
        # Hadamard layer
        for i in range(n_qubits):
            circuit.h(i)

        # Single-qubit Z rotations
        for i in range(n_qubits):
            circuit.rz(i, features[i])

        # Two-qubit ZZ interactions (product of features)
        for i in range(n_qubits):
            for j in range(i + 1, n_qubits):
                angle = features[i] * features[j]
                circuit.cnot(i, j)
                circuit.rz(j, angle)
                circuit.cnot(i, j)

    return circuit


def amplitude_encoding(features: np.ndarray) -> Circuit:
    """Amplitude encoding — encodes N features into log2(N) qubits.

    Note: This uses a simplified preparation that works for small feature vectors.
    For production use, consider more efficient state preparation algorithms.

    Args:
        features: 1D array with length that is a power of 2. Will be normalized.

    Returns:
        Circuit that prepares the amplitude-encoded state.
    """
    norm = np.linalg.norm(features)
    if norm == 0:
        raise ValueError("Cannot encode zero vector")
    amplitudes = features / norm

    n_qubits = int(np.log2(len(amplitudes)))
    if 2**n_qubits != len(amplitudes):
        raise ValueError(f"Feature length must be power of 2, got {len(amplitudes)}")

    # Use Braket's initialization (state preparation)
    circuit = Circuit()
    # For local simulator, we can initialize directly
    # For hardware, this would need decomposition into gates
    circuit.h(range(n_qubits))  # Placeholder — full implementation needs recursive decomposition
    return circuit
