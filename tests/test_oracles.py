"""Tests for 03-algorithms/scripts/oracles.py — the GUIDE-advertised oracle builders.

Until 2026-08-18 nothing imported this module: its Grover pair silently reduced
to the identity for every ``n_qubits`` outside {2, 3} (the multi-controlled-Z
sandwich had branches only for 2 and 3, so H·H cancelled and the X flips undid
themselves), and Grover "ran" at n >= 4 returning an exactly uniform
distribution with no error. These tests pin the repaired contract from both
sides: the oracle's exact unitary (a -1 phase on the marked state only, up to
global phase) and the end-to-end amplification the algorithm exists to deliver.

The scripts directory starts with a digit, so it is loaded by file path — the
same reason no test could passively import it before.
"""

from __future__ import annotations

import importlib.util
import math
from pathlib import Path

import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent

_spec = importlib.util.spec_from_file_location(
    "oracles", REPO_ROOT / "03-algorithms" / "scripts" / "oracles.py"
)
oracles = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(oracles)


# ---------------------------------------------------------------------------
# grover_oracle — exact unitary contract
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "marked",
    ["0", "1", "00", "10", "101", "0000", "1011", "10110"],
    ids=lambda m: f"n{len(m)}-{m}",
)
def test_grover_oracle_flips_exactly_the_marked_state(marked):
    """The oracle is diagonal with a -1 exactly on the marked index.

    Compared as ratios against an unmarked entry, so the check is insensitive
    to the global phase the n >= 4 phase-polynomial decomposition carries.
    The n >= 4 cases are the regression: they used to be the exact identity.
    """
    n = len(marked)
    unitary = oracles.grover_oracle(n, marked).to_unitary()
    idx = int(marked, 2)

    off_diagonal = unitary - np.diag(np.diag(unitary))
    assert np.max(np.abs(off_diagonal)) < 1e-10, "oracle must be diagonal"

    diag = np.diag(unitary)
    assert np.allclose(np.abs(diag), 1.0, atol=1e-10), "diagonal entries must be phases"

    reference = 1 if idx == 0 else 0  # any unmarked entry
    ratios = diag / diag[reference]
    expected = np.ones(2**n)
    expected[idx] = -1.0
    assert np.allclose(ratios, expected, atol=1e-10), (
        f"marked={marked}: oracle must flip only the marked state (got ratios {ratios})"
    )


def test_grover_diffusion_is_reflection_about_the_mean():
    """D = 2|s><s| - I on the uniform state |s>, up to global phase, for n=4.

    The n=4 case is the one the old code silently degraded to the identity.
    """
    n = 4
    dim = 2**n
    unitary = oracles.grover_diffusion(n).to_unitary()
    uniform = np.full((dim, 1), 1 / math.sqrt(dim))
    expected = 2 * (uniform @ uniform.T) - np.eye(dim)
    # Strip the decomposition's global phase before comparing.
    phase = unitary[0, 0] / expected[0, 0]
    assert np.isclose(abs(phase), 1.0, atol=1e-10)
    assert np.allclose(unitary / phase, expected, atol=1e-10)


# ---------------------------------------------------------------------------
# Full Grover — the amplification the identity bug destroyed
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("marked", "min_probability"),
    [("10", 0.99), ("101", 0.9), ("1011", 0.9), ("10110", 0.95)],
    ids=lambda v: v if isinstance(v, str) else None,
)
def test_grover_search_amplifies_the_marked_state(run_local, marked, min_probability):
    """floor(pi/4 * sqrt(N)) iterations concentrate probability on the marked state.

    Analytic values: n=2 -> 1.0 (one iteration), n=3 -> 0.945, n=4 -> 0.961,
    n=5 -> 0.999. Under the pre-fix identity oracle every case sat at uniform
    1/2^n, so these thresholds separate fixed from broken by a wide margin.
    """
    from braket.circuits import Circuit

    n = len(marked)
    iterations = max(1, math.floor(math.pi / 4 * math.sqrt(2**n)))
    circuit = Circuit()
    for q in range(n):
        circuit.h(q)
    for _ in range(iterations):
        circuit.add_circuit(oracles.grover_oracle(n, marked))
        circuit.add_circuit(oracles.grover_diffusion(n))

    shots = 4000
    result = run_local(circuit, shots=shots)
    probability = result.measurement_counts.get(marked, 0) / shots
    assert probability > min_probability, (
        f"n={n}: P({marked}) = {probability:.4f} — expected amplification, "
        f"uniform would be {1 / 2**n:.4f}"
    )


# ---------------------------------------------------------------------------
# The other GUIDE-advertised builders, so the module stays imported end to end
# ---------------------------------------------------------------------------


def test_constant_oracle_leaves_inputs_untouched():
    circuit = oracles.constant_oracle(2, output_value=1)
    # Only the ancilla (qubit 2) is touched, and only by an X.
    assert [str(i.operator.name) for i in circuit.instructions] == ["X"]
    assert [int(q) for i in circuit.instructions for q in i.target] == [2]


def test_balanced_oracle_copies_secret_pattern():
    circuit = oracles.balanced_oracle(3, secret_bits="101")
    controls = [int(i.target[0]) for i in circuit.instructions]
    assert controls == [0, 2], "CNOT exactly where the secret bit is 1"
