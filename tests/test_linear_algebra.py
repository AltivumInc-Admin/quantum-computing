"""Tests for the 00-linear-algebra module.

Mirrors tests/test_prereqs.py for the curriculum's new first section. It
guards the things the shared harness cannot see on its own:

1. The module's shape — both GUIDEs and exactly the four notebooks. Nothing
   else notices if a notebook silently disappears; the manifest would simply
   regenerate with a smaller count and every other test would stay green.
2. Each notebook is valid nbformat with graded exercises and a visible
   solutions section (this section, like 00-prereqs, keeps worked answers as
   its on-ramp).
3. The invariants the notebooks teach, re-implemented in plain NumPy, so a
   regression in the educational claims is caught even if the notebooks are
   rewritten around them.

The structural three-cell gate and the solved/unsolved execution gates live in
tests/test_exercise_checks.py, which discovers these notebooks by glob.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SECTION_DIR = REPO_ROOT / "00-linear-algebra"
NOTEBOOK_DIR = SECTION_DIR / "notebooks"
EXPECTED_NOTEBOOKS = [
    "01-linear-equations.ipynb",
    "02-matrices-add-subtract.ipynb",
    "03-matrix-multiplication.ipynb",
    "04-transpose-submatrix-properties.ipynb",
]


# ---------------------------------------------------------------------------
# Module structure
# ---------------------------------------------------------------------------


def test_guides_exist():
    assert (SECTION_DIR / "GUIDE.md").is_file(), "00-linear-algebra/GUIDE.md is required"
    assert (SECTION_DIR / "GUIDE.es.md").is_file(), (
        "00-linear-algebra/GUIDE.es.md is required — this section ships both locales"
    )


def test_all_notebooks_present():
    actual = {p.name for p in NOTEBOOK_DIR.glob("*.ipynb")}
    expected = set(EXPECTED_NOTEBOOKS)
    missing = expected - actual
    extra = actual - expected
    assert not missing, f"Missing notebooks: {sorted(missing)}"
    assert not extra, f"Unexpected notebooks in 00-linear-algebra/notebooks: {sorted(extra)}"


@pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
def test_notebook_is_valid_nbformat(name):
    nb = json.loads((NOTEBOOK_DIR / name).read_text())
    assert nb.get("nbformat") == 4, f"{name} is not nbformat-4"
    assert "cells" in nb and nb["cells"], f"{name} has no cells"
    assert any(c["cell_type"] == "code" for c in nb["cells"]), f"{name} has no code cells"
    assert any(c["cell_type"] == "markdown" for c in nb["cells"]), f"{name} has no markdown cells"


@pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
def test_notebook_has_exercises_and_solutions(name):
    nb = json.loads((NOTEBOOK_DIR / name).read_text())
    text = " ".join(
        ("".join(c["source"]) if isinstance(c["source"], list) else c["source"])
        for c in nb["cells"]
    ).lower()
    assert "# check exercise" in text, f"{name} is missing graded exercises"
    assert "solution" in text, f"{name} is missing a solutions section"


@pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
def test_notebook_is_browser_runnable(name):
    """The whole module runs in the lab: no install, no AWS, no quantum SDK.

    That promise is what lets the GUIDE tell a learner they need nothing but a
    browser, so it is worth pinning per notebook rather than trusting the
    section-wide manifest count.
    """
    nb = json.loads((NOTEBOOK_DIR / name).read_text())
    first_markdown = next(c for c in nb["cells"] if c["cell_type"] == "markdown")
    src = (
        "".join(first_markdown["source"])
        if isinstance(first_markdown["source"], list)
        else first_markdown["source"]
    )
    assert "<!-- browser-runnable -->" in src, (
        f"{name}: the browser-runnable marker must sit in the FIRST markdown cell"
    )


# ---------------------------------------------------------------------------
# The invariants the module teaches
# ---------------------------------------------------------------------------


def test_addition_is_entrywise_and_shape_bound():
    a = np.array([[1, 2], [3, 4]])
    b = np.array([[5, 6], [7, 8]])
    assert np.array_equal(a + b, np.array([[6, 8], [10, 12]]))
    with pytest.raises(ValueError):
        a + np.array([[1, 2, 3], [4, 5, 6]])


def test_multiplication_is_rows_times_columns_and_not_commutative():
    a = np.array([[1, 2], [3, 4]])
    b = np.array([[0, 1], [1, 0]])
    assert np.array_equal(a @ b, np.array([[2, 1], [4, 3]]))
    assert not np.array_equal(a @ b, b @ a), "AB and BA differ here — the notebook's whole point"
    assert np.array_equal(a @ np.eye(2, dtype=int), a)


def test_matmul_differs_from_elementwise():
    a = np.array([[1, 2], [3, 4]])
    b = np.array([[5, 6], [7, 8]])
    assert not np.array_equal(a @ b, a * b), "@ and * are different operations"


def test_shape_rule():
    a = np.zeros((2, 3))
    b = np.zeros((3, 4))
    assert (a @ b).shape == (2, 4)
    with pytest.raises(ValueError):
        b @ a[:, :2]


def test_the_five_transpose_facts():
    """The four identities, plus symmetry as the definition it is."""
    a = np.array([[1, 2], [3, 4]])
    b = np.array([[5, 6], [7, 8]])
    c = 3
    assert np.array_equal(a.T.T, a)
    assert np.array_equal((c * a).T, c * a.T)
    assert np.array_equal((a + b).T, a.T + b.T)
    assert np.array_equal((a @ b).T, b.T @ a.T)
    assert not np.array_equal((a @ b).T, a.T @ b.T), "the order reversal is not optional"
    sym = a + a.T
    assert np.array_equal(sym, sym.T), "M + M.T is always symmetric"
    gram = a @ a.T
    assert np.array_equal(gram, gram.T), "M @ M.T is always symmetric"


def test_submatrix_by_deletion_and_by_slicing():
    m = np.array([[4, 1, 7], [2, 9, 0], [5, 3, 6]])
    # Delete row 2 and column 2, one-based — the classical minor.
    deleted = m[np.ix_([0, 2], [0, 2])]
    assert np.array_equal(deleted, np.array([[4, 7], [5, 6]]))
    # Slice a block, zero-based and half-open — the NumPy convention.
    assert np.array_equal(m[0:2, 1:3], np.array([[1, 7], [9, 0]]))
