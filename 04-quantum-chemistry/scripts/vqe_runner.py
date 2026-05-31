"""End-to-end VQE execution pipeline."""

import numpy as np
from braket.devices import LocalSimulator
from braket.circuits import Circuit


def run_vqe(
    qubit_hamiltonian,
    ansatz_fn,
    n_qubits: int,
    n_params: int,
    shots: int = 4000,
    maxiter: int = 100,
    optimizer: str = "cobyla",
) -> dict:
    """Run VQE to find the ground state energy of a qubit Hamiltonian.

    Args:
        qubit_hamiltonian: OpenFermion QubitOperator.
        ansatz_fn: Function (params) -> Circuit.
        n_qubits: Number of qubits.
        n_params: Number of variational parameters.
        shots: Measurement shots per Pauli term.
        maxiter: Maximum optimizer iterations.
        optimizer: "cobyla" or "spsa".

    Returns:
        Dict with optimal_energy, optimal_params, history, n_evaluations.
    """
    import sys

    sys.path.insert(0, "../..")
    from variational_utils import optimize_cobyla, optimize_spsa

    device = LocalSimulator()

    def energy_cost(params):
        """Compute <H> by measuring each Pauli term."""
        circuit = ansatz_fn(params)
        total_energy = 0.0

        for term, coeff in qubit_hamiltonian.terms.items():
            if not term:  # Identity term
                total_energy += np.real(coeff)
                continue

            # Build measurement circuit for this Pauli term
            meas_circuit = circuit + _pauli_measurement_circuit(term, n_qubits)
            result = device.run(meas_circuit, shots=shots).result()

            # Compute expectation value
            counts = result.measurement_counts
            exp_val = _expectation_from_pauli_counts(counts, term, n_qubits)
            total_energy += np.real(coeff) * exp_val

        return total_energy

    initial_params = np.random.uniform(-0.1, 0.1, size=n_params)

    if optimizer == "cobyla":
        result = optimize_cobyla(energy_cost, initial_params, maxiter=maxiter)
    else:
        result = optimize_spsa(energy_cost, initial_params, maxiter=maxiter)

    return {
        "optimal_energy": result["optimal_cost"],
        "optimal_params": result["optimal_params"],
        "history": [h["cost"] for h in result["history"]],
        "n_evaluations": result["n_evals"],
    }


def _pauli_measurement_circuit(pauli_term: tuple, n_qubits: int) -> Circuit:
    """Create circuit to rotate into Pauli measurement basis."""
    circuit = Circuit()
    for qubit_idx, pauli_op in pauli_term:
        if pauli_op == "X":
            circuit.h(qubit_idx)
        elif pauli_op == "Y":
            circuit.rx(qubit_idx, np.pi / 2)
        # Z requires no rotation
    return circuit


def _expectation_from_pauli_counts(counts: dict, pauli_term: tuple, n_qubits: int) -> float:
    """Compute Pauli expectation from measurement counts."""
    total_shots = sum(counts.values())
    expectation = 0.0

    relevant_qubits = [q for q, _ in pauli_term]

    for bitstring, count in counts.items():
        # Eigenvalue is (-1)^(sum of relevant bits)
        parity = sum(int(bitstring[q]) for q in relevant_qubits) % 2
        eigenvalue = (-1) ** parity
        expectation += eigenvalue * count / total_shots

    return expectation
