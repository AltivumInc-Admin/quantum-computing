"""Production VQE chemistry solver for Braket Hybrid Jobs."""

import os
import json
import numpy as np
from braket.jobs import save_job_result
from braket.jobs.metrics import log_metric


def main():
    hp = json.loads(os.environ.get("AMZN_BRAKET_HP", "{}"))
    molecule = hp.get("molecule", "H2")
    bond_length = float(hp.get("bond_length", "0.735"))
    n_layers = int(hp.get("n_layers", "2"))
    maxiter = int(hp.get("maxiter", "100"))
    shots = int(hp.get("n_shots", "4000"))

    # Validate the hyperparameters that reach circuit construction and device.run.
    # bond_length is already guarded fail-loud in lib; these two were not, and a bad
    # value surfaced as a Braket-internal error only AFTER the job instance started
    # billing. n_layers=0 builds an empty circuit whose measurement bitstrings are
    # narrower than the Pauli terms being indexed; n_shots=0 trips a shots/result-type
    # error deep inside the SDK. Fail at submission with an actionable message.
    if n_layers < 1:
        raise ValueError(f"hyperparameter n_layers must be >= 1, got {n_layers}")
    if shots < 1:
        raise ValueError(f"hyperparameter n_shots must be >= 1, got {shots}")

    from lib.chemistry.hamiltonians import build_h2_hamiltonian, build_lih_hamiltonian

    if molecule == "H2":
        hamiltonian, n_qubits, n_electrons = build_h2_hamiltonian(bond_length)
    elif molecule == "LiH":
        hamiltonian, n_qubits, n_electrons = build_lih_hamiltonian(bond_length)
    else:
        raise ValueError(f"Unsupported molecule: {molecule}")

    from lib.chemistry.ansatz import hardware_efficient_ansatz
    from lib.utils.results import expectation_from_counts, parse_counts

    initial_params = np.random.uniform(-0.1, 0.1, size=(n_layers, n_qubits, 2))

    from braket.devices import LocalSimulator

    device = LocalSimulator()

    def energy_fn(flat_params):
        params = flat_params.reshape(n_layers, n_qubits, 2)
        circuit = hardware_efficient_ansatz(n_qubits, n_layers, params)
        total_energy = 0.0

        for term, coeff in hamiltonian.terms.items():
            if not term:
                total_energy += np.real(coeff)
                continue

            from braket.circuits import Circuit

            meas_circuit = Circuit()
            for gate in circuit.instructions:
                meas_circuit.add_instruction(gate)

            for qubit_idx, pauli_op in term:
                if pauli_op == "X":
                    meas_circuit.h(qubit_idx)
                elif pauli_op == "Y":
                    meas_circuit.rx(qubit_idx, np.pi / 2)

            result = device.run(meas_circuit, shots=shots).result()
            # parse_counts owns the bitstring-column contract this loop depends on:
            # indexing a key by absolute qubit index is valid only when the measured
            # qubits are exactly 0..n-1 in order, and parse_counts raises when they
            # are not instead of silently mislabelling every outcome.
            counts = parse_counts(result)
            relevant_qubits = [q for q, _ in term]
            exp_val = expectation_from_counts(
                counts,
                lambda bs, qubits=relevant_qubits: (-1) ** sum(int(bs[q]) for q in qubits),
            )
            total_energy += np.real(coeff) * exp_val

        log_metric(metric_name="energy", value=total_energy)
        return total_energy

    from scipy.optimize import minimize

    result = minimize(
        energy_fn, initial_params.flatten(), method="COBYLA", options={"maxiter": maxiter}
    )

    save_job_result(
        {
            "molecule": molecule,
            "bond_length": bond_length,
            "ground_state_energy": float(result.fun),
            "optimal_params": result.x.tolist(),
            "n_qubits": n_qubits,
            "converged": result.success,
        }
    )


if __name__ == "__main__":
    main()
