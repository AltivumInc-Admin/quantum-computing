"""Tests for lib/chemistry/hamiltonians.py.

Skipped entirely when openfermionpyscf is not installed (it lives in the
``[full]`` extras, not the default ``[dev]`` extras).
"""

import pytest

pytest.importorskip("openfermion")
pytest.importorskip("openfermionpyscf")

from lib.chemistry.hamiltonians import (  # noqa: E402
    build_h2_hamiltonian,
    hamiltonian_info,
)


def test_h2_hamiltonian_returns_correct_shape():
    qubit_h, n_qubits, n_electrons = build_h2_hamiltonian(bond_length=0.735)
    assert n_qubits == 4
    assert n_electrons == 2
    # H2 in STO-3G under Jordan-Wigner has exactly 15 Pauli terms in canonical
    # form, identity included — the same 15 the notebook kit hardcodes as
    # H2_TERMS (05-ansatz-design.ipynb). Pin it: the old 5..25 bound was wide
    # enough to survive a stubbed return or a mis-wired geometry.
    n_terms = len(qubit_h.terms)
    assert n_terms == 15, f"expected the 15-term JW canonical form, got {n_terms}"


def test_h2_hamiltonian_actually_depends_on_bond_length():
    # Every other H2 test builds at the same 0.735 and asserts only
    # geometry-independent facts (the JW term count is 15 at EVERY distance), so
    # an implementation that ignored bond_length entirely would pass the file.
    # Build at two distances and require the physics to move.
    short_h, _, _ = build_h2_hamiltonian(bond_length=0.5)
    long_h, _, _ = build_h2_hamiltonian(bond_length=1.5)
    short_id = hamiltonian_info(short_h)["identity_coefficient"]
    long_id = hamiltonian_info(long_h)["identity_coefficient"]
    assert abs(short_id - long_id) > 1e-3, (
        "the identity coefficient carries the nuclear repulsion, so it must "
        f"change with bond length; got {short_id} at 0.5 A and {long_id} at 1.5 A"
    )


def test_hamiltonian_info_keys():
    qubit_h, _, _ = build_h2_hamiltonian(bond_length=0.735)
    info = hamiltonian_info(qubit_h)
    assert set(info.keys()) >= {
        "n_terms",
        "max_locality",
        "identity_coefficient",
        "summary",
    }
    assert info["max_locality"] >= 1
    assert isinstance(info["identity_coefficient"], float)


def test_h2_identity_coefficient_is_finite():
    qubit_h, _, _ = build_h2_hamiltonian(bond_length=0.735)
    info = hamiltonian_info(qubit_h)
    coeff = info["identity_coefficient"]
    # The constant energy offset of the qubit Hamiltonian, in Hartree. NOT the
    # nuclear-repulsion shift (an earlier comment here said so): it is nuclear
    # repulsion PLUS the normal-ordering constant. For STO-3G H2 near
    # equilibrium the two differ in sign — the identity term is about -0.11 Ha
    # (the notebook fixture's IIII at 0.75 A is -0.1097305) while 1/R is
    # about +0.71 Ha.
    assert -10.0 < coeff < 10.0


@pytest.mark.slow
def test_lih_hamiltonian_returns_correct_shape():
    from lib.chemistry.hamiltonians import build_lih_hamiltonian

    qubit_h, n_qubits, n_electrons = build_lih_hamiltonian(bond_length=1.546)
    # Pin the numbers that distinguish LiH from H2. The old bounds (n_qubits >= 4,
    # n_electrons >= 2, len(terms) > 0) were all satisfied by H2's own output
    # (4, 2, 15), so this builder could have been silently wired to H2's geometry
    # and the test would have stayed green — the two builders differ ONLY in the
    # geometry list they hand to the shared helper.
    # STO-3G gives Li five basis functions (1s, 2s, 2p x 3) and H one, so six
    # spatial orbitals -> twelve spin-orbitals, with 3 + 1 = 4 electrons.
    assert n_qubits == 12, f"STO-3G LiH spans 12 spin-orbitals, got {n_qubits}"
    assert n_electrons == 4, f"LiH has 3 + 1 = 4 electrons, got {n_electrons}"
    assert len(qubit_h.terms) > 15, (
        f"LiH's Hamiltonian must be richer than H2's 15-term one; got {len(qubit_h.terms)} terms"
    )


@pytest.mark.parametrize("bad", [0.0, -1.0, float("nan"), float("inf")])
def test_build_h2_rejects_nonphysical_bond_length(bad):
    # The guard precedes the lazy openfermion/pyscf pipeline, so a bad distance fails
    # fast with a clear message instead of a deep, cryptic SCF engine error.
    with pytest.raises(ValueError, match="bond_length must be"):
        build_h2_hamiltonian(bad)


def test_hamiltonian_info_handles_identity_only_and_empty():
    from openfermion import QubitOperator

    # Identity-only operator: max() over a no-non-identity-terms generator must not crash.
    info = hamiltonian_info(QubitOperator("", 1.5))
    assert info["n_terms"] == 1
    assert info["max_locality"] == 0
    assert info["identity_coefficient"] == 1.5

    # Empty (zero) operator.
    empty = hamiltonian_info(QubitOperator())
    assert empty["n_terms"] == 0
    assert empty["max_locality"] == 0
    assert empty["identity_coefficient"] == 0.0
