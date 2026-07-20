"""Tests for lib/ml/feature_maps.py — local simulator only."""

import numpy as np
import pytest

from lib.ml.feature_maps import (
    amplitude_encoding,
    angle_encoding,
    iqp_encoding,
)
from lib.utils.statevector import statevector


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


def test_angle_encoding_rejects_empty():
    with pytest.raises(ValueError, match="non-empty 1D"):
        angle_encoding(np.array([]))


def test_angle_encoding_rejects_2d():
    with pytest.raises(ValueError, match="non-empty 1D"):
        angle_encoding(np.zeros((2, 2)))


# ---------------------------------------------------------------------------
# iqp_encoding
# ---------------------------------------------------------------------------


def test_iqp_encoding_qubit_count():
    circuit = iqp_encoding(np.array([0.1, 0.2, 0.3]))
    assert circuit.qubit_count == 3


def test_iqp_encoding_rejects_empty():
    with pytest.raises(ValueError, match="non-empty 1D"):
        iqp_encoding(np.array([]))


def test_iqp_encoding_rejects_2d():
    with pytest.raises(ValueError, match="non-empty 1D"):
        iqp_encoding(np.zeros((2, 2)))


@pytest.mark.parametrize("reps", [0, -3])
def test_iqp_encoding_rejects_non_positive_reps(reps):
    # ``for _ in range(reps)`` makes reps <= 1 a silent no-op returning an EMPTY circuit
    # (qubit_count 0). On the exact kernel path that yields an all-ones Gram matrix — every point
    # reported identical to every other — with no error anywhere, so this must fail loud.
    with pytest.raises(ValueError, match="reps must be >= 1"):
        iqp_encoding(np.array([0.3, 0.4]), reps=reps)


@pytest.mark.parametrize(
    "a, b",
    [(0.3, 0.4), (0.7, -1.1), (1.0, 1.0)],
    ids=["small", "signed", "equal"],
)
def test_iqp_encoding_matches_analytic_state(a, b):
    """Pin the exact IQP payload: the H layer, the x_i phases, and the x_i*x_j ZZ phase.

    The three pre-existing iqp tests cannot see any of this — a qubit count is true of any
    3-qubit circuit, and ``U @ U.adjoint()`` returns |0..0> for ANY circuit of unitary gates.
    Both are satisfied by an encoder that ignores its input entirely.

    For reps=1 on two qubits every amplitude has magnitude 1/2, so the whole encoding lives in
    the four relative phases. With s_k = +1 when qubit k reads 1 and -1 when it reads 0, the
    Braket Rz convention (diag(e^-i0/2, e^+i0/2)) and the CNOT-Rz-CNOT ZZ sandwich give

        amp(b0, b1) = 1/2 * exp(i/2 * (a*s0 + b*s1 - a*b*s0*s1))

    The ``-a*b*s0*s1`` term is the feature PRODUCT that makes IQP nonlinear; swapping it for a
    sum (or dropping the phases altogether) changes these amplitudes and fails here.
    """
    expected = np.array(
        [
            0.5 * np.exp(0.5j * (a * s0 + b * s1 - a * b * s0 * s1))
            for s0 in (-1.0, 1.0)
            for s1 in (-1.0, 1.0)
        ]
    )
    sv = statevector(iqp_encoding(np.array([a, b]), reps=1))
    assert np.allclose(sv, expected, atol=1e-12), f"got {sv}, expected {expected}"


def test_iqp_encoding_reps_changes_the_state():
    # The reps axis is otherwise untested, yet the curriculum asks the learner to sweep it
    # (02-quantum-kernels Exercise 1 partials reps=1,2,3). Stacking another H/Rz/ZZ block must
    # actually change the prepared state.
    features = np.array([0.6, 0.9])
    one = statevector(iqp_encoding(features, reps=1))
    two = statevector(iqp_encoding(features, reps=2))
    assert not np.allclose(one, two, atol=1e-6)


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


@pytest.mark.parametrize(
    "features, shots, tol",
    [
        (np.array([3.0, 1.0, 4.0, 1.0]), 8000, 0.03),
        (np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]), 20000, 0.02),
    ],
    ids=["4dim", "8dim-recursion"],
)
def test_amplitude_encoding_matches_squared_amplitudes(run_local, features, shots, tol):
    # Probabilities must equal |amplitudes|^2 within shot noise (the 8-dim case exercises the
    # 3-qubit recursion path).
    expected = (features**2) / np.sum(features**2)
    result = run_local(amplitude_encoding(features), shots=shots)
    counts = result.measurement_counts
    n_qubits = int(np.log2(len(features)))
    for idx in range(len(features)):
        state = format(idx, f"0{n_qubits}b")
        observed = counts.get(state, 0) / shots
        assert abs(observed - expected[idx]) < tol, (
            f"|{state}>: observed={observed:.3f}, expected={expected[idx]:.3f}"
        )


@pytest.mark.parametrize(
    "features",
    [
        np.array([3.0, 1.0, 4.0, 1.0]),
        np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]),
    ],
    ids=["4dim", "8dim-recursion"],
)
def test_amplitude_encoding_matches_exact_amplitudes(features):
    # The docstring promises AMPLITUDES (|psi> = sum_i f_i/||f|| |i>), but the shot-based test
    # above can only constrain |amplitude|^2 within shot noise. Pin the documented contract at
    # machine precision instead — the same exact-statevector technique test_circuits.py uses for
    # the QFT. This is what catches a Möttönen angle-transform regression deterministically.
    expected = features / np.linalg.norm(features)
    sv = statevector(amplitude_encoding(features))
    assert np.allclose(sv.real, expected, atol=1e-12), f"real part {sv.real} != {expected}"
    assert np.allclose(sv.imag, 0.0, atol=1e-12), f"unexpected imaginary part {sv.imag}"


def test_amplitude_encoding_rejects_2d():
    # X_train is naturally (n_samples, n_features); before the shared guard this silently
    # prepared a state for the wrong data instead of raising.
    with pytest.raises(ValueError, match="non-empty 1D"):
        amplitude_encoding(np.array([[1.0, 2.0], [3.0, 4.0]]))


def test_amplitude_encoding_rejects_non_power_of_2():
    with pytest.raises(ValueError, match="power of 2"):
        amplitude_encoding(np.array([1.0, 2.0, 3.0]))


def test_amplitude_encoding_rejects_zero_vector():
    with pytest.raises(ValueError, match="zero vector"):
        amplitude_encoding(np.zeros(4))


def test_amplitude_encoding_rejects_negative_features():
    with pytest.raises(ValueError, match="non-negative"):
        amplitude_encoding(np.array([1.0, -1.0, 1.0, 1.0]))
