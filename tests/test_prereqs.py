"""Tests for the 00-prereqs module.

Validates two things:

1. The check_prereqs.py helper detects missing dependencies correctly.
2. Every notebook in 00-prereqs/notebooks is valid nbformat and runs the
   linear-algebra invariants the notebooks claim to teach.

These tests intentionally do NOT execute the notebooks end-to-end (they
include matplotlib plotting and an interactive widget). Instead they
re-implement the invariants in plain Python so we catch regressions in
the educational claims even if the notebooks evolve.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pytest


REPO_ROOT = Path(__file__).resolve().parent.parent
PREREQ_DIR = REPO_ROOT / "00-prereqs"
NOTEBOOK_DIR = PREREQ_DIR / "notebooks"
EXPECTED_NOTEBOOKS = [
    "01-python-numpy-warmup.ipynb",
    "02-linear-algebra-for-quantum.ipynb",
    "03-probability-and-measurement.ipynb",
    "04-what-is-a-qubit.ipynb",
    "05-dirac-notation-decoded.ipynb",
    "06-bloch-sphere-playground.ipynb",
]


# ---------------------------------------------------------------------------
# Module structure
# ---------------------------------------------------------------------------


def test_guide_exists():
    assert (PREREQ_DIR / "GUIDE.md").is_file(), "00-prereqs/GUIDE.md is required"


def test_all_notebooks_present():
    actual = {p.name for p in NOTEBOOK_DIR.glob("*.ipynb")}
    expected = set(EXPECTED_NOTEBOOKS)
    missing = expected - actual
    extra = actual - expected
    assert not missing, f"Missing notebooks: {sorted(missing)}"
    assert not extra, f"Unexpected notebooks in 00-prereqs/notebooks: {sorted(extra)}"


@pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
def test_notebook_is_valid_nbformat(name):
    nb = json.loads((NOTEBOOK_DIR / name).read_text())
    assert nb.get("nbformat") == 4, f"{name} is not nbformat-4"
    assert "cells" in nb and nb["cells"], f"{name} has no cells"
    has_code = any(c["cell_type"] == "code" for c in nb["cells"])
    has_markdown = any(c["cell_type"] == "markdown" for c in nb["cells"])
    assert has_code, f"{name} has no code cells"
    assert has_markdown, f"{name} has no markdown cells"


@pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
def test_notebook_has_self_check(name):
    """Each prereq notebook is expected to end with a self-check + solutions."""
    nb = json.loads((NOTEBOOK_DIR / name).read_text())
    text = " ".join(
        ("".join(c["source"]) if isinstance(c["source"], list) else c["source"])
        for c in nb["cells"]
    ).lower()
    assert "self-check" in text, f"{name} is missing a self-check section"
    assert "solution" in text, f"{name} is missing a solutions section"


# ---------------------------------------------------------------------------
# check_prereqs.py helper
# ---------------------------------------------------------------------------


@pytest.fixture
def check_prereqs_module(monkeypatch):
    """Load check_prereqs.py as a module with sys.modules cleanup after the test.

    The module must be in sys.modules so dataclass introspection inside it can
    resolve its own globals. monkeypatch removes the entry once the test ends,
    avoiding leakage across the rest of the session.
    """
    path = PREREQ_DIR / "scripts" / "check_prereqs.py"
    module_name = "_prereqs_check_prereqs_under_test"
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, module_name, module)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_check_prereqs_lists_required_packages(check_prereqs_module):
    names = {req.module for req in check_prereqs_module.REQUIREMENTS}
    # The core stack that every notebook in the module imports.
    assert {"numpy", "matplotlib", "jupyterlab"} <= names


def test_check_prereqs_detects_present_packages(check_prereqs_module):
    numpy_req = next(r for r in check_prereqs_module.REQUIREMENTS if r.module == "numpy")
    assert numpy_req.is_installed()


def test_check_prereqs_detects_missing_packages(check_prereqs_module):
    fake = check_prereqs_module.Requirement(
        module="this_module_does_not_exist_xyzzy",
        pip_name="fake",
        purpose="testing",
    )
    assert not fake.is_installed()


def test_check_prereqs_python_version_helper(check_prereqs_module):
    assert check_prereqs_module.python_version_ok() is (sys.version_info >= (3, 10))


# ---------------------------------------------------------------------------
# Educational invariants — these are the claims the notebooks teach.
# If any of these break, the notebooks themselves are misleading.
# ---------------------------------------------------------------------------


ZERO = np.array([1, 0], dtype=complex)
ONE = np.array([0, 1], dtype=complex)
PLUS = (ZERO + ONE) / np.sqrt(2)
MINUS = (ZERO - ONE) / np.sqrt(2)
H = (1 / np.sqrt(2)) * np.array([[1, 1], [1, -1]], dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
Z = np.array([[1, 0], [0, -1]], dtype=complex)


def _is_unitary(U):
    n = U.shape[0]
    return np.allclose(U.conj().T @ U, np.eye(n))


def test_canonical_states_are_unit_vectors():
    for psi in (ZERO, ONE, PLUS, MINUS):
        assert np.isclose(np.linalg.norm(psi), 1.0)


def test_basis_states_are_orthogonal():
    assert np.isclose(ZERO.conj() @ ONE, 0)
    assert np.isclose(PLUS.conj() @ MINUS, 0)


def test_pauli_and_hadamard_are_unitary():
    for U in (X, Y, Z, H):
        assert _is_unitary(U)


def test_hadamard_is_self_inverse():
    assert np.allclose(H @ H, np.eye(2))


def test_hadamard_maps_zero_to_plus():
    assert np.allclose(H @ ZERO, PLUS)


def test_x_swaps_basis_states():
    assert np.allclose(X @ ZERO, ONE)
    assert np.allclose(X @ ONE, ZERO)


def test_born_rule_probabilities_sum_to_one():
    for psi in (ZERO, ONE, PLUS, MINUS, np.array([np.sqrt(0.3), np.sqrt(0.7)])):
        probs = np.abs(psi) ** 2
        assert np.isclose(probs.sum(), 1.0)


def test_plus_and_minus_have_identical_z_basis_probs():
    """Notebook 04 makes a point of this — different states, same measurement distribution."""
    assert np.allclose(np.abs(PLUS) ** 2, np.abs(MINUS) ** 2)


def test_bell_state_only_correlated_outcomes():
    bell = (np.kron(ZERO, ZERO) + np.kron(ONE, ONE)) / np.sqrt(2)
    probs = np.abs(bell) ** 2
    # |00> and |11> only — indices 0 and 3 in computational ordering
    assert np.isclose(probs[0], 0.5)
    assert np.isclose(probs[3], 0.5)
    assert np.isclose(probs[1], 0.0)
    assert np.isclose(probs[2], 0.0)


def test_tensor_product_doubles_dimension():
    psi = np.kron(ZERO, ONE)
    assert psi.shape == (4,)
    assert np.isclose(np.linalg.norm(psi), 1.0)


def test_bloch_parametrization_round_trip():
    """The state_from_bloch / bloch_from_state pair from notebook 06."""

    def state_from_bloch(theta, phi):
        return np.array(
            [np.cos(theta / 2), np.exp(1j * phi) * np.sin(theta / 2)],
            dtype=complex,
        )

    def bloch_from_state(psi):
        a, b = psi
        if abs(a) > 1e-12:
            phase = a / abs(a)
            a, b = a / phase, b / phase
        theta = 2 * np.arctan2(abs(b), abs(a))
        phi = np.angle(b) if abs(b) > 1e-12 else 0.0
        return theta, phi

    for theta in (0.0, np.pi / 4, np.pi / 2, 3 * np.pi / 4, np.pi):
        for phi in (0.0, np.pi / 3, np.pi, 3 * np.pi / 2):
            psi = state_from_bloch(theta, phi)
            recovered_theta, recovered_phi = bloch_from_state(psi)
            assert np.isclose(recovered_theta, theta, atol=1e-10)
            if 0 < theta < np.pi:
                # phi is undefined at the poles, only check off-pole.
                assert np.isclose(
                    np.mod(recovered_phi - phi, 2 * np.pi), 0, atol=1e-10
                ) or np.isclose(np.mod(recovered_phi - phi, 2 * np.pi), 2 * np.pi, atol=1e-10)


def test_bloch_probabilities_match_amplitudes():
    """P(0) = cos^2(theta/2), P(1) = sin^2(theta/2) — the central claim of notebook 06."""
    for theta in np.linspace(0, np.pi, 11):
        psi = np.array([np.cos(theta / 2), np.sin(theta / 2)], dtype=complex)
        probs = np.abs(psi) ** 2
        assert np.isclose(probs[0], np.cos(theta / 2) ** 2)
        assert np.isclose(probs[1], np.sin(theta / 2) ** 2)
