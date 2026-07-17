"""``lib.utils.statevector.statevector`` must return the same amplitudes under
BOTH engines.

``Circuit.state_vector()`` is the one place qcsim and the real SDK diverge
(qcsim returns the amplitudes; the real SDK registers a result type and
returns the circuit), so the curriculum funnels every state-vector read
through this helper. These tests pin its contract:

* real SDK — exercised IN-PROCESS (real Braket must already own the
  ``braket.*`` modules in the test session, as in ``test_qcsim_parity``);
* qcsim — exercised in a SUBPROCESS that imports ``qcsim`` before any
  ``braket`` module, so the aliases win exactly as they do in the browser
  (mirrors how ``test_notebook_contract`` forces the engine).
"""

from __future__ import annotations

# Real Braket first — its modules must own sys.modules before anything else
# in the session can alias them (same rule as test_qcsim_parity.py).
from braket.circuits import Circuit  # noqa: E402

import subprocess  # noqa: E402
import sys  # noqa: E402
from pathlib import Path  # noqa: E402

import numpy as np  # noqa: E402

from lib.utils.statevector import statevector  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent

BELL = np.array([1, 0, 0, 1], dtype=np.complex128) / np.sqrt(2)


def test_session_uses_real_braket():
    """Guard: if qcsim ever shadows braket in-process, every assertion below
    would silently test the wrong engine."""
    assert Circuit.__module__.startswith("braket."), (
        f"real Braket expected in-process, got {Circuit.__module__}"
    )


def test_real_sdk_returns_bell_amplitudes():
    sv = statevector(Circuit().h(0).cnot(0, 1))
    assert isinstance(sv, np.ndarray)
    assert sv.dtype == np.complex128
    np.testing.assert_allclose(sv, BELL, atol=1e-12)


def test_real_sdk_does_not_mutate_the_circuit():
    """The real ``state_vector()`` appends a result type; the helper must work
    on a copy so the caller's circuit stays clean and repeat calls agree."""
    circuit = Circuit().h(0).cnot(0, 1)
    first = statevector(circuit)
    assert list(circuit.result_types) == [], "helper mutated the caller's circuit"
    second = statevector(circuit)
    np.testing.assert_allclose(first, second, atol=1e-15)


def test_real_sdk_compacted_register():
    """Sparse qubit labels span the COMPACTED register — the same convention
    qcsim implements (h(0).cnot(0, 2) is a 4-element Bell state, not 8)."""
    sv = statevector(Circuit().h(0).cnot(0, 2))
    assert len(sv) == 4
    np.testing.assert_allclose(sv, BELL, atol=1e-12)


def test_qcsim_engine_matches_real_sdk():
    """Under qcsim (forced in a fresh interpreter, aliases winning) the helper
    must take the qcsim branch and return the identical Bell amplitudes."""
    script = (
        "import sys\n"
        f"sys.path.insert(0, {str(REPO_ROOT)!r})\n"
        f"sys.path.insert(1, {str(REPO_ROOT / 'qcsim' / 'src')!r})\n"
        "import qcsim  # registers braket.* aliases before any braket import\n"
        "from braket.circuits import Circuit\n"
        "assert Circuit.__module__.startswith('qcsim'), Circuit.__module__\n"
        "import numpy as np\n"
        "from lib.utils.statevector import statevector\n"
        "sv = statevector(Circuit().h(0).cnot(0, 1))\n"
        "assert isinstance(sv, np.ndarray) and sv.dtype == np.complex128, sv\n"
        "expected = np.array([1, 0, 0, 1], dtype=np.complex128) / np.sqrt(2)\n"
        "np.testing.assert_allclose(sv, expected, atol=1e-12)\n"
        "sparse = statevector(Circuit().h(0).cnot(0, 2))\n"
        "assert len(sparse) == 4, len(sparse)\n"
        "np.testing.assert_allclose(sparse, expected, atol=1e-12)\n"
        "print('qcsim-engine-ok')\n"
    )
    proc = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        timeout=120,
    )
    assert proc.returncode == 0, f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
    assert "qcsim-engine-ok" in proc.stdout
