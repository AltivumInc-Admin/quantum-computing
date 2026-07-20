"""Molecular Hamiltonian construction utilities using OpenFermion."""

import numpy as np


def _build_diatomic_hamiltonian(
    geometry,
    *,
    basis: str = "sto-3g",
    multiplicity: int = 1,
    charge: int = 0,
    run_fci: bool = False,
):
    """Build the Jordan-Wigner qubit Hamiltonian for a two-atom molecule.

    Shared OpenFermion pipeline (``MolecularData`` -> ``run_pyscf`` ->
    ``get_fermion_operator`` -> ``jordan_wigner``) behind both diatomic builders.
    ``run_fci`` defaults to ``False``: the exact Full-CI the builders used to
    request is an extra diagonalization whose result is never read (only the
    molecular Hamiltonian and the electron/qubit counts are used downstream).

    Args:
        geometry: OpenFermion geometry — a list of ``(element, (x, y, z))`` tuples.
        basis: Gaussian basis set. Defaults to ``"sto-3g"``.
        multiplicity: Spin multiplicity. Defaults to ``1`` (singlet).
        charge: Net molecular charge. Defaults to ``0``.
        run_fci: Also run Full-CI (an unused reference energy). Off by default.

    Returns:
        Tuple of (qubit_hamiltonian, n_qubits, n_electrons).

    Raises:
        ImportError: if the ``[full]`` extras (``openfermion`` /
            ``openfermionpyscf``) are not installed.
    """
    from openfermion.chem import MolecularData
    from openfermionpyscf import run_pyscf
    from openfermion.transforms import jordan_wigner, get_fermion_operator

    molecule = run_pyscf(MolecularData(geometry, basis, multiplicity, charge), run_fci=run_fci)
    qubit_hamiltonian = jordan_wigner(get_fermion_operator(molecule.get_molecular_hamiltonian()))
    return qubit_hamiltonian, molecule.n_qubits, molecule.n_electrons


def build_h2_hamiltonian(bond_length: float = 0.735):
    """Build the qubit Hamiltonian for H2 at a given bond length.

    Basis: STO-3G (minimal), fixed — not a parameter. That choice is what fixes
    the return shape: STO-3G gives H2 two spatial orbitals, hence four
    spin-orbitals, hence ``n_qubits == 4``. It also bounds every energy computed
    downstream. A minimal basis overbinds: its H2 well depth is 0.204 Ha
    (5.55 eV) against the measured 0.174 Ha (4.75 eV), and its own equilibrium
    sits near 0.737 A against the measured 0.741 A.

    Args:
        bond_length: H-H distance in Angstroms. Must be positive and finite.
            The 0.735 default is the conventional near-equilibrium value used
            across H2 tutorials; it is close to, but not exactly, the STO-3G
            minimum (~0.737 A) or the measured bond length (0.741 A).

    Returns:
        Tuple of (qubit_hamiltonian, n_qubits, n_electrons). ``n_qubits`` is 4
        for STO-3G H2.

    Raises:
        ValueError: if ``bond_length`` is not a positive, finite distance.
        ImportError: if the ``[full]`` extras (``openfermion`` /
            ``openfermionpyscf``) are not installed.
    """
    if not np.isfinite(bond_length) or bond_length <= 0:
        raise ValueError(
            f"bond_length must be a positive, finite distance in Angstroms, got {bond_length!r}"
        )
    geometry = [("H", (0.0, 0.0, 0.0)), ("H", (0.0, 0.0, bond_length))]
    return _build_diatomic_hamiltonian(geometry)


def build_lih_hamiltonian(bond_length: float = 1.546):
    """Build the qubit Hamiltonian for LiH at a given bond length.

    Basis: STO-3G (minimal), fixed — not a parameter. STO-3G gives Li five basis
    functions (1s, 2s, 2p x 3) and H one, so six spatial orbitals, twelve
    spin-orbitals, hence ``n_qubits == 12`` — three times H2's, and the reason
    this builder is markedly slower.

    Args:
        bond_length: Li-H distance in Angstroms. Must be positive and finite.

    Returns:
        Tuple of (qubit_hamiltonian, n_qubits, n_electrons). For STO-3G LiH that
        is 12 qubits and 4 electrons.

    Raises:
        ValueError: if ``bond_length`` is not a positive, finite distance.
        ImportError: if the ``[full]`` extras (``openfermion`` /
            ``openfermionpyscf``) are not installed.
    """
    if not np.isfinite(bond_length) or bond_length <= 0:
        raise ValueError(
            f"bond_length must be a positive, finite distance in Angstroms, got {bond_length!r}"
        )
    geometry = [("Li", (0.0, 0.0, 0.0)), ("H", (0.0, 0.0, bond_length))]
    return _build_diatomic_hamiltonian(geometry)


def hamiltonian_info(qubit_hamiltonian) -> dict:
    """Extract useful information about a qubit Hamiltonian.

    Args:
        qubit_hamiltonian: OpenFermion QubitOperator.

    Returns:
        Dict with:
        - ``n_terms``: number of Pauli terms (the identity term included). This
          is a term count, NOT a measurement budget: the identity is a classical
          constant that needs no quantum measurement, so a naive VQE measures
          ``n_terms - 1`` settings, and grouping commuting strings shrinks that
          further (for STO-3G H2: 15 terms, 14 naive measurements, about 5 grouped).
        - ``max_locality``: largest number of qubits any single term acts on
          (``0`` for an identity-only or empty operator).
        - ``identity_coefficient``: the constant energy offset of the qubit
          Hamiltonian, in Hartree — the coefficient of the identity Pauli
          string. It shifts every eigenvalue uniformly. Note this is the nuclear
          repulsion PLUS the constant left over from normal-ordering the
          fermionic Hamiltonian, not the nuclear repulsion alone (for STO-3G H2
          near equilibrium the two differ in sign and by ~0.8 Ha).
        - ``summary``: a human-readable one-line summary.
    """
    # Single-source the term set: `.terms` is the dict {pauli_tuple: coeff}. The previous
    # `len(list(qubit_hamiltonian))` materialized one QubitOperator per term just to count.
    terms = qubit_hamiltonian.terms
    n_terms = len(terms)
    # default=0 keeps an identity-only/empty operator from crashing max() on an empty generator.
    max_locality = max((len(term) for term in terms if term != ()), default=0)
    identity_coeff = terms.get((), 0.0)

    return {
        "n_terms": n_terms,
        "max_locality": max_locality,
        "identity_coefficient": float(np.real(identity_coeff)),
        "summary": f"{n_terms} Pauli terms, max locality {max_locality}",
    }
