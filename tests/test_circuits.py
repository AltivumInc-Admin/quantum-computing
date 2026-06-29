"""Tests for lib/circuits/common.py — runs on local simulator only."""

import numpy as np
from braket.circuits import Circuit
from braket.devices import LocalSimulator
from lib.circuits.common import bell_pair, ghz_state, qft_circuit


def test_bell_pair_produces_entangled_state():
    circuit = bell_pair()
    device = LocalSimulator()
    result = device.run(circuit, shots=1000).result()
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


def test_ghz_state_all_agree():
    circuit = ghz_state(n_qubits=4)
    device = LocalSimulator()
    result = device.run(circuit, shots=1000).result()
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


def test_qft_circuit_qubit_count():
    circuit = qft_circuit(n_qubits=3)
    assert circuit.qubit_count == 3


def test_qft_circuit_on_known_state():
    circuit = qft_circuit(n_qubits=3)
    device = LocalSimulator()
    result = device.run(circuit, shots=8000).result()
    measurements = result.measurements
    bitstrings = ["".join(str(bit) for bit in row) for row in measurements]
    from collections import Counter

    counts = Counter(bitstrings)
    for state in counts.values():
        assert state > 500, "QFT of |000> should give roughly uniform distribution"


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
    assert fidelity > 0.999, f"QFT statevector does not match the analytic DFT (fidelity={fidelity:.4f})"
    # The Fourier phases must actually be present (a Hadamard-only circuit is purely real).
    assert np.abs(np.asarray(sv).imag).max() > 0.1
