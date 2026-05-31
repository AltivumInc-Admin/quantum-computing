"""Parity tests: qcsim must agree with real Braket on a curated set of
reference circuits.

Order of imports matters. We import real Braket FIRST so that its modules
populate ``sys.modules`` and qcsim's alias-registration is a safe no-op.
"""

from __future__ import annotations

# Real Braket first — its modules must be in sys.modules before qcsim's
# alias-registration runs, or qcsim will shadow real Braket.
from braket.circuits import Circuit as BraketCircuit  # noqa: E402
from braket.devices import LocalSimulator as BraketSimulator  # noqa: E402

import math  # noqa: E402

import numpy as np  # noqa: E402
import pytest  # noqa: E402

from qcsim import Circuit as QCircuit  # noqa: E402
from qcsim import LocalSimulator as QSimulator  # noqa: E402


SHOTS = 1000
SIGMA_TOL = 4.0  # be generous; finite-sample noise + numpy RNG vs Braket RNG


def _run_qcsim(builder, shots: int = SHOTS, seed: int = 0):
    np.random.seed(seed)
    circuit = builder(QCircuit)
    return QSimulator().run(circuit, shots=shots).result()


def _run_braket(builder, shots: int = SHOTS):
    circuit = builder(BraketCircuit)
    return BraketSimulator().run(circuit, shots=shots).result()


def _assert_distributions_close(qcounts, bcounts, shots: int):
    """Compare two empirical bitstring distributions with a 4-sigma allowance."""
    keys = set(qcounts) | set(bcounts)
    for k in keys:
        q = qcounts.get(k, 0)
        b = bcounts.get(k, 0)
        p_avg = (q + b) / (2 * shots)
        if p_avg < 1e-9 or p_avg > 1 - 1e-9:
            # Deterministic outcome — must match exactly.
            assert q == b, f"deterministic bin {k!r}: qcsim={q}, braket={b}"
            continue
        sigma = math.sqrt(shots * p_avg * (1 - p_avg))
        diff = abs(q - b)
        assert diff <= SIGMA_TOL * sigma + 5, (
            f"distribution mismatch on bin {k!r}: qcsim={q}, braket={b}, "
            f"diff={diff}, {SIGMA_TOL}-sigma={SIGMA_TOL * sigma:.1f}"
        )


# ---------------------------------------------------------------------------
# Circuit builders. Each builder takes a Circuit class and returns a circuit.
# ---------------------------------------------------------------------------


def _single_h(C):
    return C().h(0)


def _bell(C):
    return C().h(0).cnot(0, 1)


def _ghz3(C):
    return C().h(0).cnot(0, 1).cnot(1, 2)


def _identity(C):
    # Empty 1-qubit circuit -> always |0>
    return C().i(0)


def _x_then_measure(C):
    return C().x(0)


def _double_h(C):
    # H H = I -> deterministic |0>
    return C().h(0).h(0)


def _parameterized_ry(C):
    # P(|1>) = sin^2(theta/2) for theta = pi/3 = 0.25
    return C().ry(0, math.pi / 3)


def _deutsch_jozsa_balanced(C):
    """2-input Deutsch–Jozsa, balanced oracle f(x) = x_0 XOR x_1.

    Implemented as the canonical algorithm:
        - prepare ancilla |1>, then H on all three qubits
        - oracle: CNOT(q0, q2); CNOT(q1, q2)
        - H on the two input qubits
        - Measurement on q0,q1 should be "11" deterministically (non-constant).
    """
    return C().x(2).h(0).h(1).h(2).cnot(0, 2).cnot(1, 2).h(0).h(1)


def _grover_n2_marked_11(C):
    """Single-iteration Grover on 2 qubits marking |11>.

    Should produce |11> with high probability.
    """
    return (
        C()
        .h(0)
        .h(1)
        # Oracle for |11>: CZ flips phase of |11>
        .cz(0, 1)
        # Diffusion: H, X, CZ, X, H on each input qubit
        .h(0)
        .h(1)
        .x(0)
        .x(1)
        .cz(0, 1)
        .x(0)
        .x(1)
        .h(0)
        .h(1)
    )


def _adjoint_identity(C):
    """U followed by U-dagger must return to |00> deterministically.

    Exercises Circuit.adjoint() against real Braket, which also provides
    ``.adjoint()``. Uses a non-self-inverse gate (Ry) plus entanglement so a
    naive (order-preserving or non-conjugated) adjoint would fail.
    """
    base = C().ry(0, 0.7).cnot(0, 1)
    return base.add_circuit(base.adjoint())


CIRCUITS = [
    ("single_h", _single_h, True),  # name, builder, probabilistic
    ("bell", _bell, True),
    ("ghz3", _ghz3, True),
    ("identity", _identity, False),
    ("x_then_measure", _x_then_measure, False),
    ("double_h", _double_h, False),
    ("parameterized_ry", _parameterized_ry, True),
    ("deutsch_jozsa_balanced", _deutsch_jozsa_balanced, False),
    ("grover_n2_marked_11", _grover_n2_marked_11, False),
    ("adjoint_identity", _adjoint_identity, False),
]


@pytest.mark.parametrize("name,builder,_probabilistic", CIRCUITS, ids=[c[0] for c in CIRCUITS])
def test_qcsim_matches_braket(name, builder, _probabilistic):
    """For each reference circuit, measurement distributions must agree."""
    q_result = _run_qcsim(builder, shots=SHOTS, seed=0)
    b_result = _run_braket(builder, shots=SHOTS)
    _assert_distributions_close(
        q_result.measurement_counts,
        b_result.measurement_counts,
        SHOTS,
    )


def test_state_vector_bell():
    """The Bell state vector is exactly (|00> + |11>) / sqrt(2)."""
    c = QCircuit().h(0).cnot(0, 1)
    sv = c.state_vector()
    expected = np.array([1, 0, 0, 1], dtype=np.complex128) / np.sqrt(2)
    assert np.allclose(sv, expected, atol=1e-12)


def test_state_vector_adjoint_identity():
    """A circuit composed with its adjoint returns the |0...0> state exactly."""
    base = QCircuit().ry(0, 0.9).cnot(0, 1).rz(1, 0.4)
    base.add_circuit(base.adjoint())  # snapshot adjoint, then append in place
    sv = base.state_vector()
    expected = np.zeros(4, dtype=np.complex128)
    expected[0] = 1.0
    assert np.allclose(sv, expected, atol=1e-12)


def test_adjoint_does_not_mutate_original():
    """adjoint() must return a new circuit and leave the original untouched."""
    base = QCircuit().s(0).t(1)
    n_before = len(base._gates)
    adj = base.adjoint()
    assert len(base._gates) == n_before
    assert adj is not base
    # S-dagger is diag(1, -1j): the daggered matrix differs from the original.
    assert np.allclose(adj._gates[-1][1], np.array([[1, 0], [0, -1j]], dtype=np.complex128))


def test_state_vector_random_norm_preserved():
    """100 random gate sequences preserve the L2 norm to machine precision."""
    rng = np.random.default_rng(42)
    for trial in range(100):
        c = QCircuit()
        n_qubits = int(rng.integers(1, 5))
        n_gates = int(rng.integers(1, 12))
        single_gate_names = ["h", "x", "y", "z", "s", "t"]
        rot_gate_names = ["rx", "ry", "rz"]
        for _ in range(n_gates):
            kind = rng.choice(["single", "rot", "two", "three"])
            if kind == "single":
                getattr(c, rng.choice(single_gate_names))(int(rng.integers(0, n_qubits)))
            elif kind == "rot":
                getattr(c, rng.choice(rot_gate_names))(
                    int(rng.integers(0, n_qubits)),
                    float(rng.uniform(0, 2 * math.pi)),
                )
            elif kind == "two" and n_qubits >= 2:
                q1, q2 = rng.choice(n_qubits, size=2, replace=False)
                getattr(c, rng.choice(["cnot", "cz", "swap"]))(int(q1), int(q2))
            elif kind == "three" and n_qubits >= 3:
                qs = list(rng.choice(n_qubits, size=3, replace=False))
                c.ccnot(int(qs[0]), int(qs[1]), int(qs[2]))
        sv = c.state_vector()
        norm = np.sum(np.abs(sv) ** 2)
        assert abs(norm - 1.0) < 1e-10, (
            f"trial {trial}: norm = {norm}, gates = {n_gates}, qubits = {n_qubits}"
        )


def test_instructions_iterable_and_counts():
    """circuit.instructions supports the curriculum's gate-count idiom."""
    c = QCircuit().h(0).cnot(0, 1).ry(1, 0.3)
    assert len(c.instructions) == 3
    assert sum(1 for _ in c.instructions) == 3
    assert c.instructions[0].target == (0,)
    assert c.instructions[1].target == (0, 1)


def test_qubit_count_and_depth():
    c = QCircuit().h(0).cnot(0, 1).cnot(1, 2)
    assert c.qubit_count == 3
    # Greedy DAG depth: H(0)->CNOT(0,1)->CNOT(1,2). q0 depth = 2, q1 = 3, q2 = 3.
    assert c.depth == 3


def test_measurement_counts_match_braket_for_bell():
    """Empirical check that Bell-state bitstrings are exactly 00 and 11."""
    np.random.seed(7)
    r = QSimulator().run(QCircuit().h(0).cnot(0, 1), shots=2000).result()
    assert set(r.measurement_counts) == {"00", "11"}
    assert sum(r.measurement_counts.values()) == 2000
