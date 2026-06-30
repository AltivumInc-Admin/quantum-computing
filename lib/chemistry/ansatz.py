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

    Raises:
        ValueError: if ``params`` does not have shape ``(n_layers, n_qubits, 2)``.
    """
    params = np.asarray(params)
    expected_shape = (n_layers, n_qubits, 2)
    if params.shape != expected_shape:
        raise ValueError(
            f"params must have shape {expected_shape} (n_layers, n_qubits, 2), got {params.shape}"
        )
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
        params: Excitation amplitudes; length MUST equal
            n_electrons * (n_qubits - n_electrons).

    Returns:
        Circuit implementing single excitations.

    Raises:
        ValueError: if len(params) does not match the number of excitations.
    """
    circuit = Circuit()

    # Hartree-Fock initial state: occupy lowest orbitals
    for i in range(n_electrons):
        circuit.x(i)

    # Single excitations: excite from occupied to virtual.
    occupied = list(range(n_electrons))
    virtual = list(range(n_electrons, n_qubits))
    n_excitations = len(occupied) * len(virtual)
    # Validate up front. Silently truncating (too few params) or ignoring extras
    # (too many) builds a DIFFERENT operator than the caller asked for — fail loud.
    if len(params) != n_excitations:
        raise ValueError(
            f"expected {n_excitations} excitation params "
            f"({n_electrons} occupied x {n_qubits - n_electrons} virtual), got {len(params)}"
        )

    param_idx = 0
    for occ in occupied:
        for virt in virtual:
            theta = params[param_idx]
            # Givens rotation implementing the excitation
            circuit.ry(virt, theta / 2)
            circuit.cnot(occ, virt)
            circuit.ry(virt, -theta / 2)
            circuit.cnot(occ, virt)
            param_idx += 1

    return circuit
