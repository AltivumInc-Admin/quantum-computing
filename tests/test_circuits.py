"""Tests for lib/circuits/common.py — runs on local simulator only."""

import numpy as np
from braket.devices import LocalSimulator
from lib.circuits.common import bell_pair, ghz_state, qft_circuit


def test_bell_pair_produces_entangled_state():
    circuit = bell_pair()
    device = LocalSimulator()
    result = device.run(circuit, shots=1000).result()
    measurements = result.measurements
    for row in measurements:
        assert row[0] == row[1], "Bell pair qubits must always agree"


def test_bell_pair_custom_qubits():
    circuit = bell_pair(qubit_0=2, qubit_1=3)
    assert circuit.qubit_count == 4


def test_ghz_state_all_agree():
    circuit = ghz_state(n_qubits=4)
    device = LocalSimulator()
    result = device.run(circuit, shots=1000).result()
    for row in result.measurements:
        assert all(bit == row[0] for bit in row), "GHZ state qubits must all agree"


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
