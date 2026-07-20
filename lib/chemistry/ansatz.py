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
        ValueError: if ``n_qubits`` or ``n_layers`` is below 1, or if ``params``
            does not have shape ``(n_layers, n_qubits, 2)``.
    """
    # n_layers=0 used to satisfy the shape check exactly (params.shape == (0, n, 2))
    # and return an EMPTY circuit with qubit_count 0. Callers then measured
    # bitstrings narrower than the qubits they were indexing. Reject it here so
    # every caller is covered, matching uccsd_singles_circuit's range guard.
    if n_qubits < 1:
        raise ValueError(f"n_qubits must be >= 1, got {n_qubits}")
    if n_layers < 1:
        raise ValueError(f"n_layers must be >= 1, got {n_layers}")
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
    """UCCSD-inspired ansatz built from particle-conserving single excitations.

    Prepares the Hartree-Fock reference and applies one Givens rotation
    ``G(theta)`` per occupied-virtual pair. Each rotation *moves* an electron
    rather than creating one: on the pair ``(occ, virt)`` it acts as
    ``|10> -> cos(theta/2)|10> + sin(theta/2)|01>`` and leaves ``|00>`` and
    ``|11>`` untouched, so every state the circuit can reach has exactly
    ``n_electrons`` electrons.

    Note on the physics this demonstrates: for H2 in a minimal basis, single
    excitations are inert. Brillouin's theorem decouples them from the
    Hartree-Fock reference, and the singles additionally carry ungerade
    symmetry, so they cannot mix with the gerade ground state at all. The
    variational minimum of this ansatz against STO-3G H2 is therefore exactly
    the Hartree-Fock energy (-1.116151 Ha), against an FCI floor of
    -1.137117 Ha: it recovers none of the 0.020966 Ha of correlation energy.
    That is the point of including it — H2's correlation lives entirely in the
    *double* excitation |1100> <-> |0011>, which this ansatz cannot reach.

    Args:
        n_qubits: Number of qubits (= number of spin-orbitals).
        n_electrons: Number of electrons.
        params: Excitation amplitudes; shape MUST be
            ``(n_electrons * (n_qubits - n_electrons),)``. This is the standard
            unrestricted spin-orbital count, so it includes spin-forbidden
            excitations whose amplitudes simply optimize to zero.

    Returns:
        Circuit implementing single excitations from the Hartree-Fock state.

    Raises:
        ValueError: if ``n_electrons`` is not in ``0..n_qubits``, or if
            ``params`` does not have shape ``(n_excitations,)``.
    """
    if not 0 <= n_electrons <= n_qubits:
        raise ValueError(
            f"n_electrons must satisfy 0 <= n_electrons <= n_qubits ({n_qubits}), got {n_electrons}"
        )
    params = np.asarray(params)
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
    # Check the full .shape, not len(): len() inspects only the leading axis, so a
    # (n_excitations, k) array would pass and then blow up mid-build with a raw
    # numpy TypeError. Mirrors hardware_efficient_ansatz's guard above.
    if params.shape != (n_excitations,):
        raise ValueError(
            f"expected {n_excitations} excitation params "
            f"({n_electrons} occupied x {n_qubits - n_electrons} virtual) "
            f"with shape ({n_excitations},), got {params.shape}"
        )

    # occupied x virtual, occ outer / virt inner — same order as the old nested loops, so the
    # param-to-excitation mapping is unchanged; enumerate replaces the manual param_idx counter.
    for idx, (occ, virt) in enumerate(itertools.product(occupied, virtual)):
        theta = params[idx]
        # Givens rotation G(theta) on the (occ, virt) pair: rotates within the
        # {|01>, |10>} subspace and fixes |00> and |11>, so it MOVES an electron
        # instead of creating one. The outer cnot(virt, occ) pair is what makes it
        # particle-conserving — without them the inner four gates compose to a
        # controlled-Ry, which pumps amplitude into |11> and breaks electron count.
        circuit.cnot(virt, occ)
        circuit.ry(virt, theta / 2)
        circuit.cnot(occ, virt)
        circuit.ry(virt, -theta / 2)
        circuit.cnot(occ, virt)
        circuit.cnot(virt, occ)

    return circuit
