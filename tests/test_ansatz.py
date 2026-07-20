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


def test_uccsd_singles_rejects_right_length_wrong_shape():
    # len() inspects only the leading axis, so a (4, 3) array has len() == 4 and used
    # to slip past the count guard, then die mid-build with a raw numpy TypeError.
    # Scalars and nested lists took the same escape. All must fail loud instead.
    with pytest.raises(ValueError, match="expected 4 excitation params"):
        uccsd_singles_circuit(4, 2, np.zeros((4, 3)))
    with pytest.raises(ValueError, match="expected 4 excitation params"):
        uccsd_singles_circuit(4, 2, 0.5)
    with pytest.raises(ValueError, match="expected 4 excitation params"):
        uccsd_singles_circuit(4, 2, [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6], [0.7, 0.8]])


def test_uccsd_singles_accepts_plain_python_list():
    # The sibling hardware_efficient_ansatz normalizes with np.asarray and accepts a
    # list; both builders annotate params: np.ndarray, so they must agree on inputs.
    circuit = uccsd_singles_circuit(4, 2, [0.1, 0.2, 0.3, 0.4])
    assert circuit.qubit_count == 4


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


def test_hardware_efficient_ansatz_rejects_degenerate_sizes():
    # n_layers=0 satisfied the shape guard exactly — params.shape == (0, 4, 2) —
    # and returned an EMPTY circuit (qubit_count 0). Callers that then indexed
    # measurement bitstrings by qubit number hit a raw IndexError. Fail loud.
    with pytest.raises(ValueError, match="n_layers must be >= 1"):
        hardware_efficient_ansatz(4, 0, np.zeros((0, 4, 2)))
    with pytest.raises(ValueError, match="n_qubits must be >= 1"):
        hardware_efficient_ansatz(0, 2, np.zeros((2, 0, 2)))


def test_hardware_efficient_ansatz_param_axes_are_ry_then_rz(local_simulator):
    """Pin the documented layout: params[..., 0] -> Ry, params[..., 1] -> Rz.

    The all-zeros test above cannot see this — Ry(0) = Rz(0) = I, so |0> is
    invariant under any axis assignment or gate ordering. Feeding a single
    nonzero angle separates them: on |0>, Ry(theta) moves population to |1>
    while Rz(theta) is only a phase and moves none.
    """
    theta = 1.0
    n_qubits, n_layers = 1, 1

    # Angle on the Ry axis: P(|0>) == cos^2(theta/2).
    ry_params = np.zeros((n_layers, n_qubits, 2))
    ry_params[0, 0, 0] = theta
    circuit = hardware_efficient_ansatz(n_qubits, n_layers, ry_params)
    sv = local_simulator.run(circuit.state_vector(), shots=0).result().values[0]
    assert abs(abs(sv[0]) ** 2 - np.cos(theta / 2) ** 2) < 1e-9, "params[..., 0] must drive Ry"

    # Same angle on the Rz axis: a phase only, so |0> keeps all the population.
    rz_params = np.zeros((n_layers, n_qubits, 2))
    rz_params[0, 0, 1] = theta
    circuit = hardware_efficient_ansatz(n_qubits, n_layers, rz_params)
    sv = local_simulator.run(circuit.state_vector(), shots=0).result().values[0]
    assert abs(abs(sv[0]) ** 2 - 1.0) < 1e-9, "params[..., 1] must drive Rz"


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


def test_uccsd_singles_conserves_particle_number(run_local):
    """An excitation ansatz MOVES electrons; it must never create or destroy one.

    This is the defining invariant of the operator and the one the previous
    implementation violated: its four-gate block composed to a controlled-Ry, so
    from HF |1100> the reachable support was {|1100>, |1101>, |1110>, |1111>} —
    at theta=0.4 some 28% of the probability sat outside the 2-electron sector,
    and at theta=pi/2 the state held four electrons in a two-electron molecule.
    A genuine Givens rotation keeps every shot at Hamming weight n_electrons.
    """
    n_qubits, n_electrons = 4, 2
    n_excitations = n_electrons * (n_qubits - n_electrons)
    rng = np.random.default_rng(20260720)

    for params in [
        np.full(n_excitations, 0.4),
        np.full(n_excitations, np.pi / 2),
        np.full(n_excitations, 1.0),
        *[rng.uniform(-np.pi, np.pi, n_excitations) for _ in range(3)],
    ]:
        circuit = uccsd_singles_circuit(n_qubits, n_electrons, params)
        result = run_local(circuit, shots=400)
        bitstrings = ["".join(str(b) for b in row) for row in result.measurements]
        offenders = {bs for bs in bitstrings if bs.count("1") != n_electrons}
        assert not offenders, (
            f"particle number not conserved for params={np.round(params, 3).tolist()}: "
            f"sampled {sorted(offenders)}, expected every bitstring to have "
            f"Hamming weight {n_electrons}"
        )


def test_uccsd_singles_reaches_genuine_single_excitations(run_local):
    """The excitation must actually populate singly-excited determinants.

    The controlled-Ry version put EXACTLY zero amplitude on |0110>, |0101>,
    |1010> and |1001> — the true single excitations of HF |1100> — while
    happily populating unphysical 3- and 4-electron states. Number conservation
    alone would also be satisfied by the identity, so pin the excitation too.
    """
    n_qubits, n_electrons = 4, 2
    params = np.full(n_electrons * (n_qubits - n_electrons), 0.8)
    circuit = uccsd_singles_circuit(n_qubits, n_electrons, params)
    counts = run_local(circuit, shots=2000).measurement_counts
    singly_excited = sum(counts.get(bs, 0) for bs in ("0110", "0101", "1010", "1001"))
    assert singly_excited / 2000 > 0.05, (
        "a singles ansatz at a substantial amplitude must put real probability on "
        f"singly-excited determinants, got {singly_excited}/2000"
    )
