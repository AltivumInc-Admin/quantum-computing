"""Variational Quantum Classifier and Quantum Kernel implementations.

Two parallel APIs are provided:

* :func:`build_vqc_circuit` returns a native :class:`braket.circuits.Circuit`
  — used by :func:`quantum_kernel` and by didactic notebooks that show the
  Braket primitives directly.
* :func:`vqc_qnode` returns a PennyLane :class:`~pennylane.QNode` (default
  device ``default.qubit``; ``braket.local.qubit`` and ``lightning.qubit``
  are opt-in via the ``device_name`` argument), used by
  :func:`lib.ml.training.train_vqc` for fast analytic-gradient training.

Both use the same gate sequence — angle encoding then alternating
Ry-rotation/CNOT-entangling layers.
"""

import numpy as np
from braket.circuits import Circuit
from braket.devices import LocalSimulator


def build_vqc_circuit(
    n_qubits: int, n_layers: int, features: np.ndarray, params: np.ndarray
) -> Circuit:
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


def vqc_qnode(
    n_qubits: int,
    n_layers: int,
    device_name: str = "default.qubit",
    diff_method: str = "best",
):
    """Return a PennyLane QNode implementing the VQC architecture.

    Builds the same gate sequence as :func:`build_vqc_circuit` — angle
    encoding followed by ``n_layers`` rotation+CNOT-entangling layers — but
    as a differentiable :class:`~pennylane.QNode`. Returns the expectation
    value of :class:`~pennylane.PauliZ` on qubit 0.

    Args:
        n_qubits: Number of qubits (= number of features).
        n_layers: Number of variational layers.
        device_name: PennyLane device. Defaults to ``"default.qubit"`` — the
            pure-Python simulator with backprop, fastest for small VQC
            circuits. Pass ``"braket.local.qubit"`` to route through the
            Amazon Braket local simulator (slower for tiny circuits because
            of the plugin's per-call serialization overhead, but matches
            the simulator used elsewhere in this workspace). Pass
            ``"lightning.qubit"`` for the PennyLane C++ backend.
        diff_method: PennyLane differentiation method. The default ``"best"``
            picks backprop on the local simulator (analytic gradients).

    Returns:
        A callable QNode with signature ``qnode(features, params) -> float``
        where ``features`` is a 1D array of length ``n_qubits`` and ``params``
        is a 2D array of shape ``(n_layers, n_qubits)``.

    Raises:
        ImportError: if ``pennylane`` is not installed (it lives in the
            ``[full]`` extras), or if ``amazon-braket-pennylane-plugin`` is
            missing when ``device_name="braket.local.qubit"`` is requested.
    """
    import pennylane as qml

    dev = qml.device(device_name, wires=n_qubits)

    @qml.qnode(dev, interface="autograd", diff_method=diff_method)
    def circuit(features, params):
        for i in range(n_qubits):
            qml.RY(features[..., i], wires=i)  # broadcasts for a (batch, n_qubits) input
        for layer in range(n_layers):
            for i in range(n_qubits):
                qml.RY(params[layer, i], wires=i)
            for i in range(n_qubits - 1):
                qml.CNOT(wires=[i, i + 1])
            if n_qubits > 2:
                qml.CNOT(wires=[n_qubits - 1, 0])
        return qml.expval(qml.PauliZ(0))

    return circuit
