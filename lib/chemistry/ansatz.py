"""Parameterized ansatz circuit builders for quantum chemistry."""

import itertools

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
        ValueError: if ``n_electrons`` is not in ``0..n_qubits``, or if
            ``len(params)`` does not match the number of excitations.
    """
    if not 0 <= n_electrons <= n_qubits:
        raise ValueError(
            f"n_electrons must satisfy 0 <= n_electrons <= n_qubits ({n_qubits}), got {n_electrons}"
        )
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

    # occupied x virtual, occ outer / virt inner — same order as the old nested loops, so the
    # param-to-excitation mapping is unchanged; enumerate replaces the manual param_idx counter.
    for idx, (occ, virt) in enumerate(itertools.product(occupied, virtual)):
        theta = params[idx]
        # Givens rotation implementing the excitation
        circuit.ry(virt, theta / 2)
        circuit.cnot(occ, virt)
        circuit.ry(virt, -theta / 2)
        circuit.cnot(occ, virt)

    return circuit
