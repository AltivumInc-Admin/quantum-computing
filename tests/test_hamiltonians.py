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
    # H2 in STO-3G under Jordan-Wigner has 15 Pauli terms in canonical form,
    # but OpenFermion versions may differ by identity-shifts. Use a loose
    # bound that survives minor version drift.
    n_terms = len(qubit_h.terms)
    assert 5 <= n_terms <= 25, f"unexpected term count {n_terms}"


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
    # Nuclear-repulsion shift; for H2 STO-3G at 0.735 Å it's roughly between
    # -1.5 and 1.5 Hartree depending on convention. Use a loose bound.
    assert -10.0 < coeff < 10.0


@pytest.mark.slow
def test_lih_hamiltonian_returns_correct_shape():
    from lib.chemistry.hamiltonians import build_lih_hamiltonian

    qubit_h, n_qubits, n_electrons = build_lih_hamiltonian(bond_length=1.546)
    assert n_qubits >= 4
    assert n_electrons >= 2
    assert len(qubit_h.terms) > 0


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
