"""Variational Quantum Classifier and Quantum Kernel implementations.

Two parallel APIs are provided:

* :func:`build_vqc_circuit` returns a native :class:`braket.circuits.Circuit`
  — used by the didactic notebooks that show the Braket primitives directly
  (``04-quantum-ml/notebooks/03-variational-classifier.ipynb``). It is *not*
  used by :func:`quantum_kernel`: a fidelity kernel composes a caller-supplied
  FIXED feature map from :mod:`lib.ml.feature_maps` with its own adjoint, and
  has no trainable parameters at all.
* :func:`vqc_qnode` returns a PennyLane :class:`~pennylane.QNode` (default
  device ``default.qubit``; ``braket.local.qubit`` and ``lightning.qubit``
  are opt-in via the ``device_name`` argument), used by
  :func:`lib.ml.training.train_vqc` for fast analytic-gradient training.

Both use the same gate sequence — angle encoding then alternating
Ry-rotation/CNOT-entangling layers.
"""

from collections.abc import Callable

import numpy as np
from braket.circuits import Circuit

from lib.hardware.devices import run_circuit
from lib.utils.results import parse_counts

# The VQC device dispatch is intentionally local-only — QPU routing is not exposed here (it would
# bypass the project's explicit cost-aware QPU entrypoint). Keep in sync with vqc_qnode's docstring.
_ALLOWED_QML_DEVICES = ("default.qubit", "lightning.qubit", "braket.local.qubit")

# Which of the allowed devices consume a whole (batch, n_qubits) array in ONE broadcast pass.
# Declared next to the allowlist it subsets so adding a device forces an explicit broadcast
# decision at the same site; lib.ml.training imports this rather than restating the literals.
# The braket plugin device may not broadcast, so it falls back to the per-sample loop.
_BROADCASTING_QML_DEVICES = ("default.qubit", "lightning.qubit")


def _vqc_entangler_pairs(n_qubits: int) -> list[tuple[int, int]]:
    """CNOT (control, target) pairs for one VQC entangling layer: a linear chain, plus a
    ring-closing CNOT for n_qubits > 2 only. Single-sourced so the Braket and PennyLane builders
    (which the module docstring promises share a gate sequence) cannot drift."""
    pairs = [(i, i + 1) for i in range(n_qubits - 1)]
    if n_qubits > 2:
        pairs.append((n_qubits - 1, 0))
    return pairs


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

    Raises:
        ValueError: if ``params`` is not shaped ``(n_layers, n_qubits)`` or
            ``features`` is not a 1D array of length >= ``n_qubits``.
    """
    features = np.asarray(features)
    params = np.asarray(params)
    if params.shape != (n_layers, n_qubits):
        raise ValueError(
            f"params must have shape {(n_layers, n_qubits)} (n_layers, n_qubits), got {params.shape}"
        )
    if features.ndim != 1 or features.shape[0] < n_qubits:
        raise ValueError(
            f"features must be a 1D array of length >= n_qubits ({n_qubits}), got shape {features.shape}"
        )

    circuit = Circuit()

    # Data encoding
    for i in range(n_qubits):
        circuit.ry(i, features[i])

    # Variational layers
    for layer in range(n_layers):
        # Rotations
        for i in range(n_qubits):
            circuit.ry(i, params[layer, i])

        # Entangling — linear chain + a ring-closer for n_qubits > 2 (single-sourced topology)
        for control, target in _vqc_entangler_pairs(n_qubits):
            circuit.cnot(control, target)

    return circuit


def quantum_kernel(
    x1: np.ndarray,
    x2: np.ndarray,
    feature_map_fn: Callable[[np.ndarray], Circuit],
    shots: int = 1000,
) -> float:
    """Compute quantum kernel value K(x1, x2) = |<phi(x1)|phi(x2)>|^2.

    Uses the compute-uncompute approach.

    Args:
        x1: First data point.
        x2: Second data point. Must have the same shape as ``x1`` — the two
            points have to describe the same register for the overlap to be a
            fidelity kernel.
        feature_map_fn: Function mapping features -> Circuit, e.g. one of the
            encoders in :mod:`lib.ml.feature_maps`.
        shots: Number of measurement shots. Must be >= 1.

    Returns:
        Kernel value (overlap) between 0 and 1.

    Raises:
        ValueError: if ``x1`` and ``x2`` have different shapes, or ``shots``
            is less than 1. ``feature_map_fn`` may also raise ``ValueError``
            for inputs it rejects (see :mod:`lib.ml.feature_maps`).
    """
    # Validate up front, matching the fail-loud convention every sibling in this package follows.
    # Nothing upstream covers either case: run_circuit's shots gate lives inside its
    # `device_name != "local"` branch, and the local path is the only one this function uses.
    x1 = np.asarray(x1)
    x2 = np.asarray(x2)
    if x1.shape != x2.shape:
        raise ValueError(
            f"x1 and x2 must have the same shape (got {x1.shape} and {x2.shape}); "
            "mismatched points leave unpaired qubits whose survival probability is folded "
            "into the result, so the returned number is not a fidelity kernel."
        )
    if shots < 1:
        raise ValueError(f"shots must be >= 1 (got {shots})")

    # Compute-uncompute: U(x1)^dagger . U(x2) . |0>
    # If x1 == x2, we get |0> back (kernel = 1)
    circuit_x2 = feature_map_fn(x2)
    circuit_x1_adj = feature_map_fn(x1).adjoint()

    combined = circuit_x2.add_circuit(circuit_x1_adj)
    # Route through the library's own seams (run_circuit + parse_counts) rather than a bare
    # LocalSimulator, so the documented abstraction layer is actually exercised. On the free local
    # path this is behavior-preserving: run_circuit("local") skips the cost gate, and parse_counts'
    # measured-qubits guard is a no-op here (all qubits measured, in order).
    result = run_circuit(combined, device_name="local", shots=shots)

    # Probability of measuring all zeros = |<phi(x1)|phi(x2)>|^2. Derive the register width from
    # the circuit actually built, so the key matches for ANY feature map (e.g. amplitude_encoding's
    # log2(N) qubits), not just one-qubit-per-feature.
    counts = parse_counts(result)
    kernel_value = counts.get("0" * combined.qubit_count, 0) / shots
    return kernel_value


def vqc_qnode(
    n_qubits: int,
    n_layers: int,
    device_name: str = "default.qubit",
    diff_method: str = "best",
) -> Callable:
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
            Amazon Braket local simulator (markedly slower for tiny circuits,
            but matches the simulator used elsewhere in this workspace). Pass
            ``"lightning.qubit"`` for the PennyLane C++ backend.
        diff_method: PennyLane differentiation method. ``"best"`` (the
            default) does NOT resolve to the same thing on every allowed
            device — PennyLane picks the best method the device itself
            supports (measured on PennyLane 0.45.1):

            * ``default.qubit`` -> ``backprop`` (one circuit execution per
              gradient, whatever the parameter count);
            * ``lightning.qubit`` -> ``adjoint`` (device-side derivative);
            * ``braket.local.qubit`` -> ``parameter-shift``, which costs
              ``2 * n_params + 1`` circuit executions per gradient. This —
              not serialization overhead — is the dominant reason the Braket
              route is slow: a 6-parameter model runs 13 circuits per
              gradient there against 1 on ``default.qubit``.

            Pass an explicit method to override the per-device choice.

    Returns:
        A callable QNode ``qnode(features, params)`` returning ``<Z_0>``.
        ``params`` is always a 2D array of shape ``(n_layers, n_qubits)``.
        ``features`` accepts two shapes:

        * ``(n_qubits,)`` — one sample; returns a scalar expectation value;
        * ``(batch, n_qubits)`` — the QNode broadcasts over rows and returns
          one expectation per row, shape ``(batch,)``. This is the shape
          :func:`lib.ml.training.train_vqc` uses on its fast path.

    Raises:
        ImportError: if ``pennylane`` is not installed (it lives in the
            ``[full]`` extras), or if ``amazon-braket-pennylane-plugin`` is
            missing when ``device_name="braket.local.qubit"`` is requested.
        ValueError: if ``device_name`` is not one of
            ``("default.qubit", "lightning.qubit", "braket.local.qubit")``.
    """
    import pennylane as qml

    if device_name not in _ALLOWED_QML_DEVICES:
        raise ValueError(
            f"device_name must be one of {_ALLOWED_QML_DEVICES} (got {device_name!r}); "
            "QPU routing is intentionally not exposed here."
        )
    dev = qml.device(device_name, wires=n_qubits)

    @qml.qnode(dev, interface="autograd", diff_method=diff_method)
    def circuit(features, params):
        # Coerce once so the Ellipsis indexing below works on a plain Python list too (every
        # other entry point in lib/ml begins with an asarray). qml.math.asarray preserves the
        # autograd trace and the (batch, n_qubits) broadcast that train_vqc's fast path needs.
        features = qml.math.asarray(features)
        for i in range(n_qubits):
            qml.RY(features[..., i], wires=i)  # broadcasts for a (batch, n_qubits) input
        for layer in range(n_layers):
            for i in range(n_qubits):
                qml.RY(params[layer, i], wires=i)
            for control, target in _vqc_entangler_pairs(n_qubits):
                qml.CNOT(wires=[control, target])
        return qml.expval(qml.PauliZ(0))

    return circuit
