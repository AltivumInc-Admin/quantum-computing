"""Real-SDK sample tier: representative curriculum notebooks must execute under
the REAL ``amazon-braket-sdk`` — the engine the documented local path installs
(``make setup`` + ``make lab``).

``test_notebook_contract.py`` executes every browser-runnable notebook under
qcsim (bootstrap forces the alias), which leaves the OTHER engine dark: an
idiom that only works under qcsim — the very bug class this tier exists for
was ``sv = circuit.state_vector()``, which returns the amplitudes under qcsim
but registers a result type and returns the circuit under the real SDK —
sails through a fully green CI yet crashes for every local learner.

Executing all 32 notebooks twice would be too slow, so this runs a SAMPLE:
one notebook per curriculum track that historically used the divergent idiom.
No qcsim bootstrap — the kernel imports ``braket`` and gets the real SDK.
"""

from __future__ import annotations

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent

# One per track that used the divergent state_vector() idiom, chosen for
# runtime (the whole sample stays around a minute).
SAMPLE = [
    "03-algorithms/notebooks/01-deutsch-jozsa.ipynb",
    "04-quantum-ml/notebooks/01-data-encoding.ipynb",
    "05-quantum-chemistry/notebooks/03-vqe-h2.ipynb",
]


@pytest.fixture(scope="session")
def real_sdk_kernel() -> str:
    """A kernelspec bound to the current interpreter (same env as the tests),
    mirroring test_notebook_contract's fixture."""
    from ipykernel.kernelspec import install

    name = "real-sdk-sample"
    install(user=True, kernel_name=name)
    return name


@pytest.mark.slow
@pytest.mark.parametrize("rel_path", SAMPLE)
def test_notebook_executes_under_real_sdk(rel_path: str, real_sdk_kernel: str):
    """The sampled notebook runs end-to-end with real Braket — no qcsim."""
    nbformat = pytest.importorskip("nbformat")
    from nbclient import NotebookClient
    from nbclient.exceptions import CellExecutionError

    nb_path = REPO_ROOT / rel_path
    nb = nbformat.read(str(nb_path), as_version=4)

    # NO `import qcsim` here — that is the whole point of this tier. The
    # path insert only makes `import lib` resolvable from the kernel's cwd
    # (the notebook dir), like the editable install does for local learners.
    bootstrap = nbformat.v4.new_code_cell(
        "import sys\n"
        f"sys.path.insert(0, {str(REPO_ROOT)!r})\n"
        "import braket.circuits\n"
        "assert braket.circuits.Circuit.__module__.startswith('braket.'), (\n"
        "    'real Braket expected, got ' + braket.circuits.Circuit.__module__)\n"
    )
    nb.cells.insert(0, bootstrap)

    client = NotebookClient(
        nb,
        timeout=180,
        kernel_name=real_sdk_kernel,
        resources={"metadata": {"path": str(nb_path.parent)}},
    )
    try:
        client.execute()
    except CellExecutionError as exc:
        pytest.fail(
            f"{rel_path} failed to execute under the REAL amazon-braket-sdk "
            f"(the engine `make setup` installs):\n{exc}"
        )


def test_sample_notebooks_exist():
    """Guard against a rename silently emptying this tier."""
    for rel_path in SAMPLE:
        assert (REPO_ROOT / rel_path).is_file(), f"missing sample notebook: {rel_path}"
