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
import os
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import validate_runnable as vr  # noqa: E402

from tests.conftest import notebook_group  # noqa: E402

RUNNABLE = vr.find_runnable_notebooks()
_IDS = [p.relative_to(REPO_ROOT).as_posix() for p in RUNNABLE]
# Same group name test_exercise_checks.py uses for the same notebook -- that is
# the point. xdist groups are a global namespace, so naming both after the
# notebook's repo-relative path is what pins this tier's qcsim execution onto
# the same worker as that tier's solved/unsolved executions of the same file.
_PARAMS = [pytest.param(p, id=rel, marks=notebook_group(rel)) for p, rel in zip(RUNNABLE, _IDS)]


def test_found_runnable_notebooks():
    """Guard against a discovery regression silently emptying the suite."""
    assert RUNNABLE, "no <!-- browser-runnable --> notebooks discovered"


@pytest.mark.parametrize("nb_path", _PARAMS)
def test_runnable_notebook_static_contract(nb_path: Path):
    """Marked notebooks must not use APIs qcsim cannot run in the browser."""
    violations = vr.scan_notebook(nb_path)
    assert not violations, (
        f"{nb_path.relative_to(REPO_ROOT).as_posix()} is marked browser-runnable "
        f"but violates the qcsim contract:\n  " + "\n  ".join(violations)
    )


def test_manifest_in_sync():
    """The committed manifest must match a fresh scan (no drift).

    Derived from content-manifest.json's per-notebook ``runnable`` booleans —
    the manifest the web app actually reads. This used to assert against a
    second generated file, runnable-manifest.json, whose flat list was exactly
    this one-line derivation and which no TypeScript ever imported.
    """
    committed = json.loads(vr.CONTENT_MANIFEST_PATH.read_text(encoding="utf-8"))
    runnable_in_manifest = sorted(
        f"{s['dirName']}/notebooks/{nb['filename']}"
        for s in committed["sections"]
        for nb in s["notebooks"]
        if nb["runnable"]
    )
    assert runnable_in_manifest == vr.runnable_notebook_paths(), (
        "content-manifest.json is stale; regenerate with "
        "`python scripts/validate_runnable.py --write-manifest`"
    )


@pytest.fixture(scope="session")
def contract_kernel(install_notebook_kernel) -> str:
    """Register an ipykernel spec bound to the current interpreter.

    Using the current ``sys.executable`` guarantees the kernel runs in the same
    environment as the test (where qcsim + the curriculum deps are installed),
    independent of whatever ``python3`` kernelspec may exist on the machine.

    Installed into this pytest process's private Jupyter home rather than the
    developer's, because installing a spec is an rmtree of the destination and
    xdist workers would otherwise race for it — see install_notebook_kernel in
    tests/conftest.py.
    """
    return install_notebook_kernel("qcsim-contract")


@pytest.mark.slow
@pytest.mark.parametrize("nb_path", _PARAMS)
def test_runnable_notebook_executes_under_qcsim(nb_path: Path, contract_kernel: str):
    """Each marked notebook executes end-to-end under qcsim with no cell error."""
    nbformat = pytest.importorskip("nbformat")
    from nbclient import NotebookClient
    from nbclient.exceptions import CellExecutionError

    nb = nbformat.read(str(nb_path), as_version=4)
    bootstrap = nbformat.v4.new_code_cell(
        "import sys\n"
        f"sys.path.insert(0, {str(REPO_ROOT)!r})\n"
        # qcsim/src directly: with only REPO_ROOT on the path, `import qcsim`
        # resolves to the bare namespace directory qcsim/ (no __init__, no
        # Circuit, no aliases) whenever the package is not pip-installed, and
        # the notebook then executes under the real SDK while this test's name
        # still says qcsim. The assert makes that failure loud instead.
        f"sys.path.insert(1, {str(REPO_ROOT / 'qcsim' / 'src')!r})\n"
        "import qcsim  # registers braket.* aliases before any braket import\n"
        "from braket.circuits import Circuit as _AliasProbe\n"
        "assert _AliasProbe.__module__.startswith('qcsim'), (\n"
        "    'notebook would execute under the real SDK, not qcsim: '\n"
        "    + _AliasProbe.__module__\n"
        ")\n"
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
    except Exception as exc:  # noqa: BLE001 - re-raised below with context
        # Anything that is NOT a cell raising is a HARNESS failure: a kernel that
        # would not start, one that died mid-notebook, a client timeout. Those
        # read as "this notebook is broken" unless the message says otherwise,
        # and under -n auto they are also the only failures that can be
        # load-dependent — which makes them the ones most likely to be dismissed
        # as flake and least likely to be diagnosed.
        #
        # This exists because one such failure was seen once, at 16 workers, on a
        # machine also running a web build and a JS suite, and was never
        # explained: it did not recur in 12 further full runs (6 idle, 4 loaded),
        # and the two obvious causes were measured and ruled out (kernel startup
        # is ~1s against a 60s timeout at 16-way concurrency; matplotlib's font
        # cache is lock-protected upstream). If it happens again, the exception
        # type and the worker id are the two facts nobody had, so name them.
        worker = os.environ.get("PYTEST_XDIST_WORKER", "serial")
        raise RuntimeError(
            f"HARNESS failure executing "
            f"{nb_path.relative_to(REPO_ROOT).as_posix()} under qcsim on worker "
            f"{worker}: {type(exc).__name__}: {exc}. This is the notebook "
            f"harness failing, not a cell in the notebook raising."
        ) from exc
