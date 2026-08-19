"""Tests for 05-quantum-chemistry/scripts/vqe_runner.py — the GUIDE-advertised VQE runner.

Until 2026-08-18 nothing imported this module, and its expectation loop indexed
raw ``result.measurement_counts`` bitstrings by absolute qubit index — the exact
hazard its hardened twin (06-hybrid-jobs/algorithms/vqe_chemistry_job.py) routes
through ``lib.utils.results.parse_counts`` to prevent. Braket COMPACTS the
measured register, so an ansatz skipping a qubit used to yield silently
mislabelled parities (a wrong energy, no error). These tests pin the repaired
contract: exact expectations on deterministic circuits, a small end-to-end VQE,
and loud failures for a skipped qubit or an out-of-range Hamiltonian term.

The Hamiltonian argument is duck-typed (anything with a ``.terms`` dict, the
OpenFermion QubitOperator shape), so the tests need no OpenFermion install.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from braket.circuits import Circuit

REPO_ROOT = Path(__file__).resolve().parent.parent

_spec = importlib.util.spec_from_file_location(
    "vqe_runner", REPO_ROOT / "05-quantum-chemistry" / "scripts" / "vqe_runner.py"
)
vqe_runner = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vqe_runner)


# ---------------------------------------------------------------------------
# The expectation path, on deterministic states (no optimizer, no noise)
# ---------------------------------------------------------------------------


def test_pauli_expectations_on_a_deterministic_state(run_local):
    """|01> (X on qubit 1): <Z0> = +1, <Z1> = -1, <Z0 Z1> = -1, exactly.

    Routed through parse_counts exactly as run_vqe's energy loop is, so this
    exercises the repaired counts contract, not a private shortcut.
    """
    from lib.utils.results import parse_counts

    circuit = Circuit().i(0).x(1)
    counts = parse_counts(run_local(circuit, shots=500))

    expect = vqe_runner._expectation_from_pauli_counts
    assert expect(counts, ((0, "Z"),), 2) == pytest.approx(1.0)
    assert expect(counts, ((1, "Z"),), 2) == pytest.approx(-1.0)
    assert expect(counts, ((0, "Z"), (1, "Z")), 2) == pytest.approx(-1.0)


def test_ansatz_that_skips_a_qubit_is_rejected_loudly():
    """The pre-fix behaviour was a silently mislabelled energy; now it names the fix."""
    with pytest.raises(ValueError, match="spans qubits \\[0, 2\\]"):
        vqe_runner._validate_ansatz_span(Circuit().h(0).x(2), 3)


def test_hamiltonian_term_beyond_n_qubits_is_rejected_before_optimizing():
    hamiltonian = SimpleNamespace(terms={((3, "Z"),): 1.0})
    with pytest.raises(ValueError, match="acts on qubit 3"):
        vqe_runner.run_vqe(hamiltonian, lambda p: Circuit().ry(0, p[0]), n_qubits=2, n_params=1)


def test_run_vqe_rejects_skipping_ansatz_end_to_end():
    """The span check must fire through the public entry point, not only the helper."""
    hamiltonian = SimpleNamespace(terms={((0, "Z"),): 1.0})
    with pytest.raises(ValueError, match="Braket compacts the measured register"):
        vqe_runner.run_vqe(
            hamiltonian,
            lambda p: Circuit().ry(1, p[0]),  # touches qubit 1, skips qubit 0
            n_qubits=2,
            n_params=1,
            maxiter=2,
            shots=100,
        )


# ---------------------------------------------------------------------------
# End-to-end: a 1-qubit Hamiltonian whose ground energy is known exactly
# ---------------------------------------------------------------------------


def test_run_vqe_finds_the_ground_state_of_z():
    """H = 0.5*I + Z has ground energy -0.5 at |1>; COBYLA over Ry must find it.

    Seeded initial parameters and enough shots that the assertion window
    (-0.6, -0.35) sits many standard errors from both the starting energy
    (~+1.5) and the identity-circuit energy (+1.5).
    """
    np.random.seed(7)
    hamiltonian = SimpleNamespace(terms={(): 0.5, ((0, "Z"),): 1.0})

    result = vqe_runner.run_vqe(
        hamiltonian,
        lambda p: Circuit().ry(0, p[0]),
        n_qubits=1,
        n_params=1,
        shots=800,
        maxiter=30,
    )

    assert -0.6 < result["optimal_energy"] < -0.35
    assert result["n_evaluations"] > 0
    assert len(result["history"]) == result["n_evaluations"]
    assert result["history"][0] > result["optimal_energy"], "the optimizer improved"
