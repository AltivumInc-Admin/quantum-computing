"""Variational Quantum Classifier and Quantum Kernel implementations."""

import numpy as np
from braket.circuits import Circuit
from braket.devices import LocalSimulator


def build_vqc_circuit(n_qubits: int, n_layers: int, features: np.ndarray,
                      params: np.ndarray) -> Circuit:
    """Build a Variational Quantum Classifier circuit.

    Architecture: angle encoding -> (Ry rotations + CNOT entangling) x n_layers

    Args:
        n_qubits: Number of qubits (= number of features).
        n_layers: Number of variational layers.
        features: Input data features.
        params: Trainable parameters, shape (n_layers, n_qubits).

    Returns:
        Circuit ready for execution.
    """
    circuit = Circuit()

    # Data encoding
    for i in range(n_qubits):
        circuit.ry(i, features[i])

    # Variational layers
    for layer in range(n_layers):
        # Rotations
        for i in range(n_qubits):
            circuit.ry(i, params[layer, i])

        # Entangling (circular CNOT)
        for i in range(n_qubits - 1):
            circuit.cnot(i, i + 1)
        if n_qubits > 2:
            circuit.cnot(n_qubits - 1, 0)

    return circuit


def quantum_kernel(x1: np.ndarray, x2: np.ndarray, feature_map_fn, shots: int = 1000) -> float:
    """Compute quantum kernel value K(x1, x2) = |<phi(x1)|phi(x2)>|^2.

    Uses the compute-uncompute approach.

    Args:
        x1: First data point.
        x2: Second data point.
        feature_map_fn: Function mapping features -> Circuit.
        shots: Number of measurement shots.

    Returns:
        Kernel value (overlap) between 0 and 1.
    """
    n_qubits = len(x1)
    device = LocalSimulator()

    # Compute-uncompute: U(x1)^dagger . U(x2) . |0>
    # If x1 == x2, we get |0> back (kernel = 1)
    circuit_x2 = feature_map_fn(x2)
    circuit_x1_adj = feature_map_fn(x1).adjoint()

    combined = circuit_x2.add_circuit(circuit_x1_adj)
    result = device.run(combined, shots=shots).result()

    # Probability of measuring all zeros = |<phi(x1)|phi(x2)>|^2
    counts = result.measurement_counts
    all_zeros = "0" * n_qubits
    kernel_value = counts.get(all_zeros, 0) / shots
    return kernel_value
