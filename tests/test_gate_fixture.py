"""Drift guard: the committed gate-matrix fixture must still match qcsim.

``web/src/components/quantum/__fixtures__/gates.json`` pins qcsim's gate matrices
for the TS kernel to check itself against. ``math.test.ts`` guards the TS side
(math.ts must match the fixture); this guards the qcsim side (the fixture must
match qcsim's live matrices). Together they lock qcsim <-> fixture <-> math.ts,
so a change to a qcsim gate matrix that is not regenerated into the fixture fails
CI here instead of silently diverging the browser and Python simulators.

The coverage guarantee is only as good as what ``build_fixture()`` enumerates.
It used to hardcode ten gates, omitting CCNOT and CPhaseShift, so this file's
"no gate is added to or dropped from qcsim without regenerating the fixture"
claim was false and — because the check compared the fixture against that same
hardcoded list — structurally unable to notice. ``build_fixture()`` now derives
from ``qcsim.circuits._GATE_SPECS``, and
``test_fixture_covers_every_registered_gate`` asserts that against the registry
directly rather than against the generator's own opinion.

Regenerate with: ``.venv/bin/python scripts/gen_gate_fixture.py``
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import gen_gate_fixture as ggf  # noqa: E402

REGEN_HINT = "regenerate with `.venv/bin/python scripts/gen_gate_fixture.py` and commit"


def _to_complex(mat) -> np.ndarray:
    """A fixture matrix (rows of [real, imag] pairs) as a complex128 array."""
    return np.array([[complex(re, im) for re, im in row] for row in mat], dtype=np.complex128)


def _committed() -> dict:
    return json.loads(ggf.FIXTURE_PATH.read_text(encoding="utf-8"))


def test_fixture_file_exists_where_the_ts_test_reads_it():
    assert ggf.FIXTURE_PATH.exists(), f"missing gate fixture at {ggf.FIXTURE_PATH}"


def test_gate_set_matches_qcsim():
    """No gate is added to or dropped from qcsim without regenerating the fixture."""
    expected = ggf.build_fixture()
    committed = _committed()
    assert set(committed["gates"]) == set(expected["gates"]), f"gate set drifted — {REGEN_HINT}"
    assert set(committed["rotations"]) == set(expected["rotations"]), (
        f"rotation set drifted — {REGEN_HINT}"
    )
    for g in expected["rotations"]:
        assert set(committed["rotations"][g]) == set(expected["rotations"][g]), (
            f"rotation angles for {g} drifted — {REGEN_HINT}"
        )


def test_committed_matrices_match_qcsim():
    """Every committed matrix must equal what qcsim currently produces."""
    expected = ggf.build_fixture()
    committed = _committed()
    for name, mat in expected["gates"].items():
        assert np.allclose(
            _to_complex(committed["gates"][name]), _to_complex(mat), rtol=0, atol=1e-12
        ), f"gate {name} no longer matches qcsim — {REGEN_HINT}"
    for g, angles in expected["rotations"].items():
        for key, mat in angles.items():
            assert np.allclose(
                _to_complex(committed["rotations"][g][key]), _to_complex(mat), rtol=0, atol=1e-12
            ), f"rotation {g}[{key}] no longer matches qcsim — {REGEN_HINT}"


def test_fixture_covers_every_registered_gate():
    """Every gate in qcsim's registry is pinned — checked against the registry itself.

    This is the assertion that makes test_gate_set_matches_qcsim's promise real:
    it compares the COMMITTED fixture to ``_GATE_SPECS``, so it cannot be
    satisfied by the generator and the check sharing a blind spot.
    """
    from qcsim.circuits import _GATE_SPECS

    committed = _committed()
    fixed = {k for k, spec in _GATE_SPECS.items() if not callable(spec.matrix)}
    parameterized = {k.lower() for k, spec in _GATE_SPECS.items() if callable(spec.matrix)}
    assert set(committed["gates"]) == fixed, f"unpinned/stale fixed gates — {REGEN_HINT}"
    assert set(committed["rotations"]) == parameterized, (
        f"unpinned/stale parameterized gates — {REGEN_HINT}"
    )
    # The two that were missing and carry QFT, QPE and Grover.
    assert "CCNOT" in committed["gates"]
    assert "cp" in committed["rotations"]


def test_rotation_keys_match_the_ts_test_expectations():
    """The rotation angle keys are the ones math.test.ts evaluates rx/ry/rz at."""
    assert [k for k, _ in ggf.ROTATION_ANGLES] == ["0", "pi_4", "pi_3", "pi_2", "t0_9", "pi"]
