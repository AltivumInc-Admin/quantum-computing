"""Tests for lib/circuits/common.py — runs on local simulator only."""

from collections import Counter

import numpy as np
import pytest
from braket.circuits import Circuit
from braket.devices import LocalSimulator
from lib.circuits.common import bell_pair, ghz_state, qft_circuit


def test_bell_pair_produces_entangled_state(run_local):
    result = run_local(bell_pair(), shots=1000)
    measurements = result.measurements
    for row in measurements:
        assert row[0] == row[1], "Bell pair qubits must always agree"
    # A dropped Hadamard collapses this to the product state |00> and still passes the
    # "agree" check vacuously — require BOTH branches to occur (~50/50, ~9 sigma at 1000 shots).
    counts = result.measurement_counts
    assert 0.35 < counts.get("00", 0) / 1000 < 0.65, counts
    assert 0.35 < counts.get("11", 0) / 1000 < 0.65, counts


def test_bell_pair_custom_qubits():
    circuit = bell_pair(qubit_0=2, qubit_1=3)
    assert circuit.qubit_count == 2
    assert {int(q) for q in circuit.qubits} == {2, 3}


def test_bell_pair_rejects_identical_qubits():
    with pytest.raises(ValueError, match="must be distinct"):
        bell_pair(2, 2)


def test_ghz_state_all_agree(run_local):
    result = run_local(ghz_state(n_qubits=4), shots=1000)
    for row in result.measurements:
        assert all(bit == row[0] for bit in row), "GHZ state qubits must all agree"
    # A dropped Hadamard collapses GHZ to the separable |0000> and still passes the agree
    # check vacuously — require both branches to occur (~50/50, ~9 sigma at 1000 shots).
    counts = result.measurement_counts
    assert 0.35 < counts.get("0000", 0) / 1000 < 0.65, counts
    assert 0.35 < counts.get("1111", 0) / 1000 < 0.65, counts


def test_ghz_state_qubit_count():
    circuit = ghz_state(n_qubits=5)
    assert circuit.qubit_count == 5


def test_ghz_state_rejects_non_positive_qubits():
    with pytest.raises(ValueError, match="n_qubits must be >= 1"):
        ghz_state(0)


def test_qft_circuit_qubit_count():
    circuit = qft_circuit(n_qubits=3)
    assert circuit.qubit_count == 3


def test_qft_circuit_rejects_non_positive_qubits():
    with pytest.raises(ValueError, match="n_qubits must be >= 1"):
        qft_circuit(0)


def test_qft_circuit_on_known_state(run_local):
    result = run_local(qft_circuit(n_qubits=3), shots=2000)
    measurements = result.measurements
    bitstrings = ["".join(str(bit) for bit in row) for row in measurements]
    counts = Counter(bitstrings)
    # QFT of |000> is uniform over all 8 basis states. At 2000 shots the expected per-bin count
    # is 250 (sigma ~14.8); require every bin present and each > 150 (~6.7 sigma below the mean).
    assert len(counts) == 8, "QFT of |000> should populate all 8 basis states"
    for count in counts.values():
        assert count > 150, "QFT of |000> should give roughly uniform distribution"


def _statevector(circuit):
    """Exact statevector of a Braket circuit (shots=0 result type on the LocalSimulator)."""
    circuit = circuit.state_vector()
    return LocalSimulator().run(circuit, shots=0).result().values[0]


def test_qft_circuit_matches_analytic_dft():
    # A uniform-on-|000> check cannot detect a wrong QFT (the QFT of ANY basis state is
    # uniform). Feed a non-trivial |k> and compare the full statevector to the analytic DFT.
    n, k = 3, 1
    N = 2**n

    circuit = Circuit()
    for q in range(n):  # prepare |k>, qubit 0 = most-significant bit (big-endian)
        if (k >> (n - 1 - q)) & 1:
            circuit.x(q)
    circuit.add_circuit(qft_circuit(n))
    sv = _statevector(circuit)

    j = np.arange(N)
    dft = np.exp(2j * np.pi * j * k / N) / np.sqrt(N)
    # Robust to a global phase (fidelity) and to the omega = e^{+/-2pi i/N} convention (max over
    # conj). A Hadamard-only circuit is a REAL +/-1/sqrt(N) vector and scores far below 1 vs both.
    fidelity = max(abs(np.vdot(dft, sv)) ** 2, abs(np.vdot(np.conj(dft), sv)) ** 2)
    assert fidelity > 0.999, (
        f"QFT statevector does not match the analytic DFT (fidelity={fidelity:.4f})"
    )
    # The Fourier phases must actually be present (a Hadamard-only circuit is purely real).
    assert np.abs(np.asarray(sv).imag).max() > 0.1
