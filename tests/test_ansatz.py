"""Tests for lib/chemistry/ansatz.py — local simulator only."""

import numpy as np

from lib.chemistry.ansatz import hardware_efficient_ansatz, uccsd_singles_circuit


# ---------------------------------------------------------------------------
# hardware_efficient_ansatz
# ---------------------------------------------------------------------------


def test_hardware_efficient_ansatz_qubit_count():
    n_qubits, n_layers = 4, 2
    params = np.zeros((n_layers, n_qubits, 2))
    circuit = hardware_efficient_ansatz(n_qubits, n_layers, params)
    assert circuit.qubit_count == n_qubits


def test_hardware_efficient_ansatz_zero_params_gives_zero_state(run_local):
    # Ry(0) and Rz(0) are identity; CNOTs on |0> stay on |0>.
    n_qubits, n_layers = 4, 2
    params = np.zeros((n_layers, n_qubits, 2))
    circuit = hardware_efficient_ansatz(n_qubits, n_layers, params)
    result = run_local(circuit, shots=500)
    bitstrings = ["".join(str(b) for b in row) for row in result.measurements]
    assert all(bs == "0000" for bs in bitstrings)


# ---------------------------------------------------------------------------
# uccsd_singles_circuit
# ---------------------------------------------------------------------------


def test_uccsd_singles_initial_state_is_hartree_fock(run_local):
    # With zero excitation amplitudes, the only occupied state is HF: |1100>
    # (qubits 0..n_electrons-1 are |1>, the rest |0>).
    n_qubits, n_electrons = 4, 2
    n_excitations = n_electrons * (n_qubits - n_electrons)  # = 4
    params = np.zeros(n_excitations)
    circuit = uccsd_singles_circuit(n_qubits, n_electrons, params)
    result = run_local(circuit, shots=500)
    bitstrings = ["".join(str(b) for b in row) for row in result.measurements]
    assert all(bs == "1100" for bs in bitstrings)


def test_uccsd_singles_nonzero_params_breaks_hf_only(run_local):
    n_qubits, n_electrons = 4, 2
    n_excitations = n_electrons * (n_qubits - n_electrons)
    params = np.full(n_excitations, 0.4)
    circuit = uccsd_singles_circuit(n_qubits, n_electrons, params)
    result = run_local(circuit, shots=2000)
    counts = result.measurement_counts
    hf_fraction = counts.get("1100", 0) / 2000
    # Non-trivial excitations should pull some probability out of |1100>.
    assert hf_fraction < 1.0
    # And the circuit should still have qubit count == n_qubits.
    assert circuit.qubit_count == n_qubits
