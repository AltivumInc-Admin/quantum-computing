"""Tests for lib/ml/feature_maps.py — local simulator only."""

import numpy as np
import pytest

from lib.ml.feature_maps import (
    amplitude_encoding,
    angle_encoding,
    iqp_encoding,
)


# ---------------------------------------------------------------------------
# angle_encoding
# ---------------------------------------------------------------------------


def test_angle_encoding_qubit_count():
    circuit = angle_encoding(np.zeros(4))
    assert circuit.qubit_count == 4


def test_angle_encoding_zero_features_gives_zero_state(run_local):
    # Ry(0) is the identity, so encoding zeros leaves the all-zero state.
    result = run_local(angle_encoding(np.zeros(3)), shots=500)
    bitstrings = ["".join(str(b) for b in row) for row in result.measurements]
    assert all(bs == "000" for bs in bitstrings)


# ---------------------------------------------------------------------------
# iqp_encoding
# ---------------------------------------------------------------------------


def test_iqp_encoding_qubit_count():
    circuit = iqp_encoding(np.array([0.1, 0.2, 0.3]))
    assert circuit.qubit_count == 3


def test_iqp_encoding_is_unitary(run_local):
    # phi(x) followed by phi(x).adjoint() must return the all-zero state.
    features = np.array([0.7, -0.3, 0.5])
    forward = iqp_encoding(features, reps=2)
    inverse = iqp_encoding(features, reps=2).adjoint()
    combined = forward.add_circuit(inverse)
    result = run_local(combined, shots=2000)
    counts = result.measurement_counts
    n_qubits = len(features)
    prob_all_zero = counts.get("0" * n_qubits, 0) / 2000
    assert prob_all_zero >= 0.95


# ---------------------------------------------------------------------------
# amplitude_encoding (Möttönen)
# ---------------------------------------------------------------------------


def test_amplitude_encoding_uniform_features_is_uniform(run_local):
    # [1,1,1,1] should give each of the 4 basis states ~25%.
    result = run_local(amplitude_encoding(np.array([1.0, 1.0, 1.0, 1.0])), shots=4000)
    counts = result.measurement_counts
    for state in ("00", "01", "10", "11"):
        prob = counts.get(state, 0) / 4000
        assert 0.20 <= prob <= 0.30, f"state |{state}> at {prob:.3f}"


def test_amplitude_encoding_matches_squared_amplitudes(run_local):
    # Probabilities must equal |amplitudes|^2 within shot noise.
    features = np.array([3.0, 1.0, 4.0, 1.0])
    expected = (features**2) / np.sum(features**2)
    result = run_local(amplitude_encoding(features), shots=8000)
    counts = result.measurement_counts
    for idx, state in enumerate(("00", "01", "10", "11")):
        observed = counts.get(state, 0) / 8000
        assert abs(observed - expected[idx]) < 0.03, (
            f"|{state}>: observed={observed:.3f}, expected={expected[idx]:.3f}"
        )


def test_amplitude_encoding_eight_dim(run_local):
    # Verify the 3-qubit recursion path.
    features = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0])
    expected = (features**2) / np.sum(features**2)
    result = run_local(amplitude_encoding(features), shots=20000)
    counts = result.measurement_counts
    for idx in range(8):
        state = format(idx, "03b")
        observed = counts.get(state, 0) / 20000
        assert abs(observed - expected[idx]) < 0.02, (
            f"|{state}>: observed={observed:.3f}, expected={expected[idx]:.3f}"
        )


def test_amplitude_encoding_rejects_non_power_of_2():
    with pytest.raises(ValueError, match="power of 2"):
        amplitude_encoding(np.array([1.0, 2.0, 3.0]))


def test_amplitude_encoding_rejects_zero_vector():
    with pytest.raises(ValueError, match="zero vector"):
        amplitude_encoding(np.zeros(4))


def test_amplitude_encoding_rejects_negative_features():
    with pytest.raises(ValueError, match="non-negative"):
        amplitude_encoding(np.array([1.0, -1.0, 1.0, 1.0]))
