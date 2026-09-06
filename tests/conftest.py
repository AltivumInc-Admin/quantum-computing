"""Shared pytest fixtures for the quantum workspace test suite."""

import os
from pathlib import Path

import pytest
from braket.devices import LocalSimulator


@pytest.fixture(scope="session")
def local_simulator():
    """Session-scoped local simulator instance."""
    return LocalSimulator()


class MockResult:
    """Mock Braket result for testing without AWS."""

    def __init__(self, measurements, measured_qubits=None):
        self.measurements = measurements
        # Only set the attribute when provided, so parse_counts' getattr default
        # path (no measured_qubits exposed) stays exercised by existing tests.
        if measured_qubits is not None:
            self.measured_qubits = measured_qubits


@pytest.fixture
def mock_result_factory():
    """Factory fixture for creating mock Braket results."""

    def _create(measurements, measured_qubits=None):
        return MockResult(measurements, measured_qubits)

    return _create


@pytest.fixture
def run_local(local_simulator):
    """Helper fixture that runs a circuit on the local simulator and returns the result."""

    def _run(circuit, shots=1000):
        return local_simulator.run(circuit, shots=shots).result()

    return _run


@pytest.fixture(autouse=True)
def _deterministic_qcsim_sampling():
    """Pin qcsim's sampler so the notebook tier cannot flake.

    Category F moved qcsim off numpy's global legacy RNG onto a private
    Generator, because real Braket never reads or advances the global one --
    a `np.random.seed(...)` in a notebook silently made qcsim's measurement
    sampling reproducible in the browser while the same cell was stochastic
    against the real SDK. That divergence is gone, which is correct, but it
    also means the 16 notebooks pairing a seed with `device.run(...)` now
    produce genuinely random histograms in CI.

    Seeding the private sampler here restores CI determinism WITHOUT restoring
    the divergence: notebooks still see Braket-faithful behavior, and only the
    test process pins the stream.
    """
    try:
        from qcsim import devices as _qcsim_devices
    except ImportError:  # qcsim not installed in this environment
        return
    seed = getattr(_qcsim_devices, "_seed_sampler", None)
    if seed is not None:
        seed(0)


# --------------------------------------------------------------------------
# The notebook tiers, and what it takes to run them in parallel
#
# Three modules -- test_exercise_checks.py, test_notebook_contract.py and
# test_notebook_real_sdk.py -- each start a fresh Jupyter kernel per test and
# execute a curriculum notebook end to end. That is ~98% of this suite's wall
# clock and it is embarrassingly parallel work, so `make test` runs it under
# pytest-xdist. A notebook is not a pure function, though, and the two helpers
# below are what make the parallel run mean the same thing as the serial one.


def notebook_group(rel_path: str):
    """The xdist group EVERY test that executes this notebook must carry.

    Notebooks write files, and they write them RELATIVE to their own directory,
    because that is the working directory a learner has and the one nbclient
    reproduces (``resources={"metadata": {"path": ...}}``). Four such writes
    ship today, all of them in 06-hybrid-jobs/notebooks/: first_job_entry.py,
    results.json, vqe_monitored_job.py, and qml_job_src/qml_train.py. Each is
    written by exactly ONE notebook under a name taken from that notebook's own
    lesson, so notebooks never collide with each other.

    A notebook collides with ITSELF. Every one of them is executed two or three
    times across the tiers above -- with canonical solutions injected, unsolved,
    and (when it is browser-runnable) under qcsim -- and two of those running at
    once truncate and rewrite the same path underneath each other. The
    01-first-hybrid-job solution makes the stakes concrete: it writes
    first_job_entry.py and then SPAWNS it as a subprocess, so a concurrent
    rewrite is a python interpreter executing half a file.

    Grouping on the notebook path pins every test that executes it to one
    worker, which serialises exactly the runs that share a path and nothing
    else. Deliberately uniform rather than an allowlist of the notebooks that
    write today: an allowlist is a thing to forget, and what it lets through is
    an INTERMITTENT failure -- the kind that gets re-run and dismissed as flake
    rather than diagnosed. The cost is that a notebook's runs no longer overlap
    each other, which bounds the suite below by its slowest single notebook.

    Requires ``--dist=loadgroup``. `make test` passes it; ``pytest_configure``
    below refuses to start under any other distributed scheduler, because a
    hand-typed `pytest -n 8` would otherwise run with the marks inert.
    """
    return pytest.mark.xdist_group(name=rel_path)


# openfermionpyscf writes its result to a path derived from the MOLECULE, and
# only from the molecule: MolecularData names the file H2_sto-3g_singlet.hdf5
# regardless of bond length, and MolecularData.save() then does os.remove(dest)
# followed by shutil.move(tmp, dest) into openfermion's own site-packages data
# directory. So the five build_h2_hamiltonian() calls in tests/test_hamiltonians.py
# — spread over four tests at three different bond lengths — all race for one
# file, and the loser sees a missing or half-written hdf5. Verified against the
# installed openfermion, not inferred: 0.5, 0.735 and 1.5 A all resolve to
#   .venv/.../openfermion/testing/data/H2_sto-3g_singlet
#
# No notebook reaches this path today. Two mention build_h2_hamiltonian, but
# 05-quantum-chemistry/01-molecular-hamiltonians only in prose, and
# 06-hybrid-jobs/05-custom-containers only inside a textwrap.dedent string that
# ships to a container rather than executing here. If one ever does call it,
# give it this group instead of notebook_group() — the two cannot be combined,
# and this collision is the one that spans files.
#
# notebook_group() cannot cover it either way. It keys on the notebook path,
# which is exactly right for a notebook racing ITSELF and exactly wrong here:
# these four tests live in one file and collide through a third one.
PYSCF_GROUP = "openfermion-pyscf-shared-datafile"


def pyscf_group():
    """The xdist group every test that can reach ``run_pyscf`` must carry."""
    return pytest.mark.xdist_group(name=PYSCF_GROUP)


def pytest_configure(config):
    """Refuse to distribute this suite under a scheduler that ignores groups.

    The notebook tiers are only parallel-safe because same-group tests share a
    worker, and ``--dist=loadgroup`` is the sole scheduler that honours the
    mark. Under ``load`` (what bare ``-n`` selects), ``worksteal``, ``each``, or
    even ``loadfile``/``loadscope`` — the groups here deliberately span three
    modules, so per-file affinity is not enough — the marks are silently inert
    and the failures are intermittent file-corruption, the kind that gets
    re-run and dismissed as flake.

    This is a guard and not a fix on purpose: setting ``config.option.dist``
    here does not work. Each worker rebuilds the value in ``xdist/remote.py``
    ``setup_config``, so the controller's mutation never reaches the scheduler
    that matters. Measured — two tests in one group landed on gw0 and gw1.
    """
    dist = getattr(config.option, "dist", "no")
    if dist not in ("no", "loadgroup"):
        raise pytest.UsageError(
            f"this suite cannot run under --dist={dist}: it relies on xdist "
            "groups (see notebook_group() in tests/conftest.py) and only "
            "--dist=loadgroup honours them. Use `make test`, or add "
            "--dist=loadgroup to your own pytest invocation."
        )


@pytest.fixture(scope="session")
def notebook_kernel_home(tmp_path_factory) -> Path:
    """A private Jupyter + IPython home for THIS pytest process.

    Each notebook tier installs an ipykernel spec so nbclient can launch a
    kernel bound to this interpreter. They used to install it into the
    developer's own ~/Library/Jupyter/kernels, and jupyter_client installs a
    spec by rmtree-ing the destination and copying over it. Serially that is
    merely rude. Under xdist it is a race with teeth: one worker's rmtree can
    delete the spec another worker is mid-launch on, and the symptom -- a
    NoSuchKernel, or a kernel.json read back half-written -- looks like a broken
    notebook rather than a broken harness.

    Pointing JUPYTER_PATH at a per-process directory removes the shared
    destination instead of locking it. tmp_path_factory hands each xdist worker
    its own base, so no two installs can name the same path, and the spec dies
    with the temp dir -- which also stops the suite leaving a `qcsim-contract`
    entry in the developer's JupyterLab launcher.

    IPYTHONDIR rides along for the same reason one step removed: IPython
    persists shell history to a SQLite file underneath it, and N kernels writing
    one SQLite file concurrently buys lock contention for no benefit at all.


    matplotlib's font cache is the one shared write DELIBERATELY left alone. 43
    of the 45 notebooks import matplotlib, every kernel shares ~/.matplotlib,
    and a cold CI runner has no cache, so every worker enters the build path at
    once. It is still safe: font_manager.json_dump holds cbook._lock_path across
    the write, and _load_fontmanager wraps the read in a bare `except Exception`
    and rebuilds. Redirecting MPLCONFIGDIR per worker was tried and reverted —
    it buys nothing and costs a separate font-cache build per worker.
    """
    home = tmp_path_factory.mktemp("jupyter-home")
    search_path = str(home / "share" / "jupyter")
    # Prepend rather than replace. jupyter_core reads JUPYTER_PATH at call time
    # and searches it in order, so ours wins the lookup while a developer who
    # exports JUPYTER_PATH for their own reasons keeps theirs.
    existing = os.environ.get("JUPYTER_PATH")
    os.environ["JUPYTER_PATH"] = f"{search_path}{os.pathsep}{existing}" if existing else search_path
    return home


@pytest.fixture(scope="session")
def install_notebook_kernel(notebook_kernel_home):
    """Install a named kernelspec into this process's private Jupyter home.

    Returns the kernel name, so a tier's fixture stays a one-liner and the
    isolation rule above lives in exactly one place.
    """

    def _install(name: str) -> str:
        from ipykernel.kernelspec import install

        install(
            kernel_name=name,
            prefix=str(notebook_kernel_home),
            env={"IPYTHONDIR": str(notebook_kernel_home / "ipython")},
        )
        return name

    return _install
