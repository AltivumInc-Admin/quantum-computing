"""Tests for lib/ml/classifiers.py — local simulator only."""

import numpy as np
import pytest

from lib.ml.classifiers import _vqc_entangler_pairs, build_vqc_circuit, quantum_kernel
from lib.ml.feature_maps import angle_encoding


pennylane = pytest.importorskip("pennylane")
from lib.ml.classifiers import vqc_qnode  # noqa: E402


def test_build_vqc_circuit_qubit_count():
    n_qubits, n_layers = 3, 2
    features = np.array([0.1, 0.2, 0.3])
    params = np.zeros((n_layers, n_qubits))
    circuit = build_vqc_circuit(n_qubits, n_layers, features, params)
    assert circuit.qubit_count == n_qubits


def test_build_vqc_circuit_param_shape_mismatch_raises():
    n_qubits, n_layers = 3, 2
    features = np.array([0.1, 0.2, 0.3])
    # wrong shape: only 1 layer of params for 2 layers — now a fail-loud ValueError
    # (was a raw IndexError before the lib-wide validation-convention sweep).
    params = np.zeros((1, n_qubits))
    with pytest.raises(ValueError, match="params must have shape"):
        build_vqc_circuit(n_qubits, n_layers, features, params)


def test_quantum_kernel_self_overlap_is_near_one():
    # K(x, x) must be 1.0 — overlap of a state with itself.
    x = np.array([0.4, 0.7])
    k = quantum_kernel(x, x, feature_map_fn=angle_encoding, shots=2000)
    assert k >= 0.95, f"self-overlap was {k:.3f}, expected ≥ 0.95"


def test_quantum_kernel_orthogonal_features_low_overlap():
    # Ry(0) ≈ I and Ry(π) flips |0>→|1>, so phi(x1) and phi(x2) are orthogonal.
    x1 = np.array([0.0, 0.0])
    x2 = np.array([np.pi, np.pi])
    k = quantum_kernel(x1, x2, feature_map_fn=angle_encoding, shots=2000)
    assert k <= 0.05, f"orthogonal-overlap was {k:.3f}, expected ≤ 0.05"


# ---------------------------------------------------------------------------
# vqc_qnode (PennyLane)
# ---------------------------------------------------------------------------


def test_vqc_qnode_returns_expval_one_at_zero():
    # All-zero features and params keep the state at |0...0>, so <Z_0> = +1.
    n_qubits, n_layers = 3, 2
    qnode = vqc_qnode(n_qubits, n_layers)
    features = np.zeros(n_qubits)
    params = np.zeros((n_layers, n_qubits))
    val = qnode(features, params)
    assert abs(float(val) - 1.0) < 1e-10


def test_vqc_qnode_flips_under_ry_pi():
    # Ry(pi) on qubit 0 flips |0> to |1> (up to a sign), giving <Z_0> = -1.
    n_qubits, n_layers = 2, 1
    qnode = vqc_qnode(n_qubits, n_layers)
    features = np.array([np.pi, 0.0])
    params = np.zeros((n_layers, n_qubits))
    val = qnode(features, params)
    assert abs(float(val) + 1.0) < 1e-10


def test_vqc_qnode_broadcasts_over_a_batch():
    # The batched training path relies on the QNode consuming a (batch, n_qubits) array and
    # returning one expval per row, identical to per-sample calls.
    n_qubits, n_layers = 2, 2
    qnode = vqc_qnode(n_qubits, n_layers)
    rng = np.random.default_rng(0)
    X = rng.uniform(-np.pi, np.pi, size=(5, n_qubits))
    params = rng.uniform(-np.pi, np.pi, size=(n_layers, n_qubits))

    batched = np.asarray(qnode(X, params))
    assert batched.shape == (5,)
    per_sample = np.array([float(qnode(x, params)) for x in X])
    assert np.allclose(batched, per_sample, atol=1e-10)


def test_quantum_kernel_self_overlap_with_amplitude_encoding():
    # quantum_kernel must derive the register width from the circuit, so it works for a feature
    # map (amplitude_encoding) that uses log2(N) qubits, not one-qubit-per-feature. On current
    # main this self-overlap is 1.0; the len(x1) bug would have made it 0.0.
    from lib.ml.feature_maps import amplitude_encoding

    x = np.array([1.0, 2.0, 3.0, 4.0])  # 4 features -> 2 qubits
    k = quantum_kernel(x, x, feature_map_fn=amplitude_encoding, shots=2000)
    assert k >= 0.95, f"self-overlap was {k:.3f}, expected ~1.0"


@pytest.mark.parametrize(
    "n_qubits, expected",
    [
        (2, [(0, 1)]),
        (3, [(0, 1), (1, 2), (2, 0)]),
        (4, [(0, 1), (1, 2), (2, 3), (3, 0)]),
    ],
)
def test_vqc_entangler_pairs_topology(n_qubits, expected):
    # Both build_vqc_circuit and vqc_qnode iterate this single source, so pinning it locks the
    # entangler topology (incl. the n_qubits>2 ring-closer) across both backends.
    assert _vqc_entangler_pairs(n_qubits) == expected


def test_vqc_qnode_rejects_unknown_device():
    with pytest.raises(ValueError, match="device_name must be one of"):
        vqc_qnode(2, 1, device_name="ionq.qpu")
