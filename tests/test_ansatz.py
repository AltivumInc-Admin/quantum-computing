"""Tests for lib/chemistry/ansatz.py — local simulator only."""

import numpy as np
import pytest

from lib.chemistry.ansatz import hardware_efficient_ansatz, uccsd_singles_circuit


def test_uccsd_singles_rejects_wrong_param_length():
    # H2: 2 occupied x 2 virtual = 4 excitations. Too few would silently truncate
    # (a different operator); too many would silently ignore the extras.
    with pytest.raises(ValueError, match="expected 4 excitation params"):
        uccsd_singles_circuit(4, 2, np.zeros(3))
    with pytest.raises(ValueError, match="expected 4 excitation params"):
        uccsd_singles_circuit(4, 2, np.zeros(5))


def test_uccsd_singles_rejects_excess_electrons():
    # n_electrons > n_qubits would push the HF x(i) loop past n_qubits and collapse
    # `virtual` to empty (n_excitations == 0), so the length check would vacuously pass.
    # Guard fails loud before building (and before the param-length check).
    with pytest.raises(ValueError, match="0 <= n_electrons <= n_qubits"):
        uccsd_singles_circuit(2, 4, np.zeros(0))


# ---------------------------------------------------------------------------
# hardware_efficient_ansatz
# ---------------------------------------------------------------------------


def test_hardware_efficient_ansatz_qubit_count():
    n_qubits, n_layers = 4, 2
    params = np.zeros((n_layers, n_qubits, 2))
    circuit = hardware_efficient_ansatz(n_qubits, n_layers, params)
    assert circuit.qubit_count == n_qubits


def test_hardware_efficient_ansatz_rejects_wrong_param_shape():
    n_qubits, n_layers = 4, 2
    # missing the trailing Ry/Rz axis — was a raw numpy IndexError, now fail-loud ValueError
    params = np.zeros((n_layers, n_qubits))
    with pytest.raises(ValueError, match="params must have shape"):
        hardware_efficient_ansatz(n_qubits, n_layers, params)


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
