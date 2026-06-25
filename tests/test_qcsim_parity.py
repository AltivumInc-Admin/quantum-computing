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
    # operator is a Gate-like object whose .name matches Braket's capitalization.
    assert c.instructions[0].operator.name == "H"
    assert c.instructions[1].operator.name == "CNot"
    assert c.instructions[2].operator.name == "Ry"


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


# ---------------------------------------------------------------------------
# Cross-SDK fidelity: qcsim must agree with real Braket on object shape, not
# just measurement distributions. Each test diffs qcsim against the real SDK so
# a future divergence fails CI. The asserted values were VERIFIED against the
# installed amazon-braket-sdk, not assumed.
# ---------------------------------------------------------------------------


def test_noncontiguous_qubits_compact_like_braket():
    """h(0).cnot(0, 2): Braket compacts to a 2-qubit register; qcsim must too."""
    q = QCircuit().h(0).cnot(0, 2)
    b = BraketCircuit().h(0).cnot(0, 2)
    assert q.qubit_count == b.qubit_count == 2
    np.random.seed(0)
    qr = QSimulator().run(q, shots=2000).result()
    br = _run_braket(lambda C: C().h(0).cnot(0, 2), shots=2000)
    # Bitstrings are length 2 (the compacted width), support {'00', '11'}.
    assert {len(k) for k in qr.measurement_counts} == {2}
    assert set(qr.measurement_counts) == set(br.measurement_counts) == {"00", "11"}
    # The two used qubits remain perfectly correlated (the entanglement the
    # IQM routing lesson relies on), regardless of their original labels.
    assert all(bitstring[0] == bitstring[1] for bitstring in qr.measurement_counts)


def test_instruction_target_keeps_original_labels_like_braket():
    """Braket compacts the register WIDTH but keeps each gate's qubit labels."""
    q = QCircuit().h(0).cnot(0, 2).ry(2, 0.3)
    b = BraketCircuit().h(0).cnot(0, 2).ry(2, 0.3)
    q_targets = [tuple(int(t) for t in ins.target) for ins in q.instructions]
    b_targets = [tuple(int(t) for t in ins.target) for ins in b.instructions]
    assert q_targets == b_targets == [(0,), (0, 2), (2,)]


def test_measured_qubits_match_braket_original_indices():
    """measured_qubits reports ORIGINAL labels (Braket does too): [0, 2], NOT [0, 1].

    Because of that, parse_counts' positional guard CORRECTLY raises on a
    non-contiguous circuit (column 1 is qubit 2, not qubit 1) and passes on a
    contiguous one. Before this change qcsim never set measured_qubits, so the
    guard was silently skipped.
    """
    from lib.utils.results import parse_counts

    np.random.seed(0)
    qr = QSimulator().run(QCircuit().h(0).cnot(0, 2), shots=100).result()
    br = _run_braket(lambda C: C().h(0).cnot(0, 2), shots=100)
    assert list(qr.measured_qubits) == list(br.measured_qubits) == [0, 2]
    # Non-contiguous: the guard now runs and correctly rejects positional labeling.
    with pytest.raises(ValueError, match="measured_qubits"):
        parse_counts(qr)

    # Contiguous: measured_qubits == range(n), so the guard runs AND passes.
    np.random.seed(0)
    qc = QSimulator().run(QCircuit().h(0).cnot(0, 1), shots=100).result()
    assert list(qc.measured_qubits) == [0, 1]
    assert all(len(k) == 2 for k in parse_counts(qc))


def test_measured_qubits_single_qubit():
    """A single-qubit circuit measures [0], matching Braket."""
    np.random.seed(0)
    qr = QSimulator().run(QCircuit().i(0), shots=10).result()
    assert list(qr.measured_qubits) == [0]


def test_empty_circuit_refuses_to_run_like_braket():
    """A gate-less circuit has qubit_count 0 and cannot run — Braket refuses too."""
    assert QCircuit().qubit_count == 0
    with pytest.raises(ValueError, match="at least one"):
        QSimulator().run(QCircuit(), shots=10)
    # Real Braket raises for the same reason (different message wording).
    with pytest.raises(ValueError):
        BraketSimulator().run(BraketCircuit(), shots=10).result()


def test_duplicate_target_gate_rejected_like_braket():
    """A multi-qubit gate on a repeated qubit is rejected at construction, as in Braket."""
    with pytest.raises(ValueError, match="distinct"):
        QCircuit().cnot(1, 1)
    with pytest.raises(ValueError, match="distinct"):
        QCircuit().ccnot(0, 1, 1)
    # Real Braket also raises at construction (qubit-count vs target-set size).
    with pytest.raises(ValueError):
        BraketCircuit().cnot(1, 1)


def _all_gates(C):
    """Build a circuit exercising every gate qcsim supports, on the given Circuit class."""
    return (
        C()
        .h(0)
        .x(0)
        .y(0)
        .z(0)
        .s(0)
        .t(0)
        .i(0)
        .rx(0, 0.2)
        .ry(0, 0.3)
        .rz(0, 0.4)
        .cnot(0, 1)
        .cz(0, 1)
        .swap(0, 1)
        .cphaseshift(0, 1, 0.5)
        .ccnot(0, 1, 2)
    )


def test_instruction_operator_name_matches_braket_for_every_gate():
    """Every qcsim gate's operator.name must equal the real Braket Gate.name.

    This is the authoritative anti-drift check: Braket's names are NOT all
    uppercase (CNot, Swap, CCNot, CPhaseShift), and a learner counting by
    .name must get the same answer in the browser and on hardware.
    """
    q_names = [ins.operator.name for ins in _all_gates(QCircuit).instructions]
    b_names = [ins.operator.name for ins in _all_gates(BraketCircuit).instructions]
    assert q_names == b_names
    # Spot the capitalization traps explicitly.
    assert "CNot" in q_names and "CNOT" not in q_names
    assert "Swap" in q_names and "SWAP" not in q_names
    assert "CCNot" in q_names and "CCNOT" not in q_names
    assert "CPhaseShift" in q_names


def test_operator_count_idiom_agrees_across_sdks():
    """The curriculum's `.operator.name == "CNot"` count idiom must agree."""
    q = QCircuit().h(0).cnot(0, 1).cnot(1, 2).ry(2, 0.3)
    b = BraketCircuit().h(0).cnot(0, 1).cnot(1, 2).ry(2, 0.3)
    q_cnots = sum(1 for ins in q.instructions if ins.operator.name == "CNot")
    b_cnots = sum(1 for ins in b.instructions if ins.operator.name == "CNot")
    assert q_cnots == b_cnots == 2


def test_operator_legacy_string_equality_still_counts():
    """Back-compat shim: the legacy `ins.operator == "CNOT"` idiom still counts.

    This leniency is qcsim-only (real Braket returns False for `gate == "CNot"`,
    since a Gate is not a str) and intentional, so a qcsim update does not
    silently break older learner code. New code should compare `.name`.
    """
    q = QCircuit().h(0).cnot(0, 1)
    assert sum(1 for ins in q.instructions if ins.operator == "CNOT") == 1  # legacy label
    assert sum(1 for ins in q.instructions if ins.operator == "CNot") == 1  # Braket name
    # Deliberately NOT case-insensitive: matching "cnot" would diverge further
    # from Braket, so the shim stays as narrow as the two real idioms.
    assert sum(1 for ins in q.instructions if ins.operator == "cnot") == 0
    # Real Braket, for contrast, does NOT match a Gate against a string at all.
    b = BraketCircuit().h(0).cnot(0, 1)
    assert sum(1 for ins in b.instructions if ins.operator == "CNot") == 0
