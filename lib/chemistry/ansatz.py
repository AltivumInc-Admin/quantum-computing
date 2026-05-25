"""Parameterized ansatz circuit builders for quantum chemistry."""

import numpy as np
from braket.circuits import Circuit


def hardware_efficient_ansatz(n_qubits: int, n_layers: int, params: np.ndarray) -> Circuit:
    """Hardware-efficient ansatz: Ry-Rz rotations + linear CNOT entangling.

    Args:
        n_qubits: Number of qubits.
        n_layers: Number of variational layers.
        params: Parameters array, shape (n_layers, n_qubits, 2) for Ry and Rz.

    Returns:
        Parameterized circuit.
    """
    circuit = Circuit()

    for layer in range(n_layers):
        # Rotation layer
        for q in range(n_qubits):
            circuit.ry(q, params[layer, q, 0])
            circuit.rz(q, params[layer, q, 1])

        # Entangling layer (linear chain)
        for q in range(n_qubits - 1):
            circuit.cnot(q, q + 1)

    return circuit


def uccsd_singles_circuit(n_qubits: int, n_electrons: int, params: np.ndarray) -> Circuit:
    """Simplified UCCSD-inspired ansatz for single excitations.

    For H2 (4 qubits, 2 electrons), this gives the essential physics.

    Args:
        n_qubits: Number of qubits (= number of spin-orbitals).
        n_electrons: Number of electrons.
        params: Array of excitation amplitudes.

    Returns:
        Circuit implementing single excitations.
    """
    circuit = Circuit()

    # Hartree-Fock initial state: occupy lowest orbitals
    for i in range(n_electrons):
        circuit.x(i)

    # Single excitations: excite from occupied to virtual
    param_idx = 0
    occupied = list(range(n_electrons))
    virtual = list(range(n_electrons, n_qubits))

    for occ in occupied:
        for virt in virtual:
            if param_idx < len(params):
                theta = params[param_idx]
                # Givens rotation implementing the excitation
                circuit.ry(virt, theta / 2)
                circuit.cnot(occ, virt)
                circuit.ry(virt, -theta / 2)
                circuit.cnot(occ, virt)
                param_idx += 1

    return circuit
