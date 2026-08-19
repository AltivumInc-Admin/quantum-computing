"""Unit tests for scripts/validate_runnable.py's magic-stripping and scan gate.

Regression source (2026-08-18 audit): ``_strip_magics`` deleted ANY line whose
first non-space character was ``%`` — including the continuation line of a
multi-line ``print("... %.6f" % (values))`` — which made the cell unparseable,
and ``scan_notebook`` then swallowed the SyntaxError as a stderr warning and
``continue``d, silently exempting the whole cell from the qcsim contract scan
while ``--check`` still exited 0. The fix strips only genuine magics (sigil
followed by an identifier character) and treats an unparseable cell as a
violation, so it can never clear the scan.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import validate_runnable as vr  # noqa: E402


# ---------------------------------------------------------------------------
# _strip_magics
# ---------------------------------------------------------------------------


def test_printf_continuation_line_is_preserved():
    """The exact shape from 05-quantum-chemistry/notebooks/07-excited-states.ipynb."""
    source = 'print("spectral gap = %.6f   (exact %.6f)"\n      % (1.0 - 0.5, 0.5))\n'
    stripped = vr._strip_magics(source)
    assert "% (1.0 - 0.5, 0.5))" in stripped
    import ast

    ast.parse(stripped)  # must stay parseable — this used to raise


def test_line_magics_and_shell_escapes_are_stripped():
    source = "%matplotlib inline\n!pip install foo\nx = 1\n%timeit x + 1\n"
    stripped = vr._strip_magics(source)
    assert stripped.strip() == "x = 1"


def test_cell_magic_skips_the_whole_cell():
    assert vr._strip_magics("%%bash\necho hi\n") is None


def test_modulo_arithmetic_continuation_is_preserved():
    source = "total = (a\n         % 7)\n"
    assert vr._strip_magics(source) == source.rstrip("\n")


# ---------------------------------------------------------------------------
# scan_notebook: unparseable == violation, never a silent exemption
# ---------------------------------------------------------------------------


def _notebook_with_code(source: str) -> dict:
    return {
        "cells": [
            {"cell_type": "markdown", "source": ["<!-- browser-runnable -->"]},
            {"cell_type": "code", "source": [source]},
        ],
        "metadata": {},
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def test_unparseable_cell_is_a_violation_not_a_warning(tmp_path):
    nb_path = tmp_path / "broken.ipynb"
    nb_path.write_text(json.dumps(_notebook_with_code("def broken(:\n")), encoding="utf-8")
    violations = vr.scan_notebook(nb_path)
    assert len(violations) == 1
    assert "does not parse" in violations[0]


def test_previously_exempt_cell_is_now_scanned(tmp_path):
    """A forbidden import behind a printf continuation used to escape the scan."""
    source = 'import pennylane\nprint("gap = %.6f"\n      % (1.0,))\n'
    nb_path = tmp_path / "hidden.ipynb"
    nb_path.write_text(json.dumps(_notebook_with_code(source)), encoding="utf-8")
    violations = vr.scan_notebook(nb_path)
    assert any("pennylane" in v for v in violations), violations
