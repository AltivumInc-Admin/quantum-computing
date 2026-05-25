"""Molecular Hamiltonian construction utilities using OpenFermion."""

import numpy as np


def build_h2_hamiltonian(bond_length: float = 0.735):
    """Build the qubit Hamiltonian for H2 at a given bond length.

    Args:
        bond_length: H-H distance in Angstroms.

    Returns:
        Tuple of (qubit_hamiltonian, n_qubits, n_electrons).
    """
    from openfermion.chem import MolecularData
    from openfermionpyscf import run_pyscf
    from openfermion.transforms import jordan_wigner, get_fermion_operator

    geometry = [("H", (0.0, 0.0, 0.0)), ("H", (0.0, 0.0, bond_length))]
    molecule = MolecularData(geometry, "sto-3g", 1, 0)
    molecule = run_pyscf(molecule, run_fci=True)

    fermion_hamiltonian = get_fermion_operator(molecule.get_molecular_hamiltonian())
    qubit_hamiltonian = jordan_wigner(fermion_hamiltonian)

    return qubit_hamiltonian, molecule.n_qubits, molecule.n_electrons


def build_lih_hamiltonian(bond_length: float = 1.546):
    """Build the qubit Hamiltonian for LiH at a given bond length.

    Args:
        bond_length: Li-H distance in Angstroms.

    Returns:
        Tuple of (qubit_hamiltonian, n_qubits, n_electrons).
    """
    from openfermion.chem import MolecularData
    from openfermionpyscf import run_pyscf
    from openfermion.transforms import jordan_wigner, get_fermion_operator

    geometry = [("Li", (0.0, 0.0, 0.0)), ("H", (0.0, 0.0, bond_length))]
    molecule = MolecularData(geometry, "sto-3g", 1, 0)
    molecule = run_pyscf(molecule, run_fci=True)

    fermion_hamiltonian = get_fermion_operator(molecule.get_molecular_hamiltonian())
    qubit_hamiltonian = jordan_wigner(fermion_hamiltonian)

    return qubit_hamiltonian, molecule.n_qubits, molecule.n_electrons


def hamiltonian_info(qubit_hamiltonian) -> dict:
    """Extract useful information about a qubit Hamiltonian.

    Args:
        qubit_hamiltonian: OpenFermion QubitOperator.

    Returns:
        Dict with n_terms, max_locality, and summary.
    """
    terms = list(qubit_hamiltonian)
    n_terms = len(terms)
    max_locality = max(len(term) for term in qubit_hamiltonian.terms if term != ())
    identity_coeff = qubit_hamiltonian.terms.get((), 0.0)

    return {
        "n_terms": n_terms,
        "max_locality": max_locality,
        "identity_coefficient": float(np.real(identity_coeff)),
        "summary": f"{n_terms} Pauli terms, max locality {max_locality}",
    }
