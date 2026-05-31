"""Executable contract for browser-runnable notebooks.

Every notebook marked ``<!-- browser-runnable -->`` promises to run in the
browser under Pyodide + qcsim. These tests enforce that promise off-line:

* ``test_*_static_contract`` — the AST denylist scan from
  ``scripts/validate_runnable.py`` (fast; runs everywhere).
* ``test_*_executes_under_qcsim`` — actually executes each notebook headlessly
  with qcsim forced ahead of any real Braket import, asserting no cell raises
  (marked ``slow``; deselect with ``-m "not slow"``).
* ``test_manifest_in_sync`` — the committed runnable manifest must match
  discovery, so the homepage list can never silently drift.

Forcing qcsim: the build-time Pyodide bootstrap is guarded by
``if "pyodide" in sys.modules`` and is therefore a no-op under CPython, so we
prepend our own ``import qcsim`` cell. In a fresh kernel ``braket`` is not yet
in ``sys.modules``, so importing qcsim registers its ``braket.*`` aliases and
the notebook's ``from braket.circuits import Circuit`` resolves to qcsim even
when the real ``amazon-braket-sdk`` is installed.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import validate_runnable as vr  # noqa: E402

RUNNABLE = vr.find_runnable_notebooks()
_IDS = [p.relative_to(REPO_ROOT).as_posix() for p in RUNNABLE]


def test_found_runnable_notebooks():
    """Guard against a discovery regression silently emptying the suite."""
    assert RUNNABLE, "no <!-- browser-runnable --> notebooks discovered"


@pytest.mark.parametrize("nb_path", RUNNABLE, ids=_IDS)
def test_runnable_notebook_static_contract(nb_path: Path):
    """Marked notebooks must not use APIs qcsim cannot run in the browser."""
    violations = vr.scan_notebook(nb_path)
    assert not violations, (
        f"{nb_path.relative_to(REPO_ROOT).as_posix()} is marked browser-runnable "
        f"but violates the qcsim contract:\n  " + "\n  ".join(violations)
    )


def test_manifest_in_sync():
    """The committed manifest must match a fresh scan (no drift)."""
    committed = json.loads(vr.MANIFEST_PATH.read_text(encoding="utf-8"))
    assert committed == vr.build_manifest(), (
        "runnable-manifest.json is stale; regenerate with "
        "`python scripts/validate_runnable.py --write-manifest`"
    )


@pytest.fixture(scope="session")
def contract_kernel() -> str:
    """Register an ipykernel spec bound to the current interpreter.

    Using the current ``sys.executable`` guarantees the kernel runs in the same
    environment as the test (where qcsim + the curriculum deps are installed),
    independent of whatever ``python3`` kernelspec may exist on the machine.
    """
    from ipykernel.kernelspec import install

    name = "qcsim-contract"
    install(user=True, kernel_name=name)
    return name


@pytest.mark.slow
@pytest.mark.parametrize("nb_path", RUNNABLE, ids=_IDS)
def test_runnable_notebook_executes_under_qcsim(nb_path: Path, contract_kernel: str):
    """Each marked notebook executes end-to-end under qcsim with no cell error."""
    nbformat = pytest.importorskip("nbformat")
    from nbclient import NotebookClient
    from nbclient.exceptions import CellExecutionError

    nb = nbformat.read(str(nb_path), as_version=4)
    bootstrap = nbformat.v4.new_code_cell(
        "import sys\n"
        f"sys.path.insert(0, {str(REPO_ROOT)!r})\n"
        "import qcsim  # registers braket.* aliases before any braket import\n"
    )
    nb.cells.insert(0, bootstrap)

    client = NotebookClient(
        nb,
        timeout=180,
        kernel_name=contract_kernel,
        resources={"metadata": {"path": str(nb_path.parent)}},
    )
    try:
        client.execute()
    except CellExecutionError as exc:
        pytest.fail(
            f"{nb_path.relative_to(REPO_ROOT).as_posix()} failed to execute under "
            f"qcsim (it is marked browser-runnable):\n{exc}"
        )
