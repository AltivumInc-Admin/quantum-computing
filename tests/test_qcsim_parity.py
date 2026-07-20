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
from qcsim import circuits as qcsim_circuits  # noqa: E402
from qcsim import devices as qcsim_devices  # noqa: E402


SHOTS = 1000
# qcsim's seeded empirical sample is compared against Braket's EXACT distribution
# (one finite sample against a deterministic ground truth), so this tolerance
# guards only qcsim's own shot noise — there is no second random sample to double
# the variance, and with a fixed seed the result is fully reproducible.
SIGMA_TOL = 4.0


def _run_qcsim(builder, shots: int = SHOTS, seed: int = 0):
    # Seed qcsim's PRIVATE sampler, not numpy's global legacy RNG. Real Braket
    # ignores np.random.seed entirely, so qcsim honouring it was itself a
    # divergence (see test_run_does_not_honour_the_global_numpy_seed_like_braket
    # and test_run_does_not_advance_the_global_numpy_rng_like_braket).
    qcsim_devices._seed_sampler(seed)
    circuit = builder(QCircuit)
    return QSimulator().run(circuit, shots=shots).result()


def _run_braket(builder, shots: int = SHOTS):
    circuit = builder(BraketCircuit)
    return BraketSimulator().run(circuit, shots=shots).result()


def _braket_analytic(builder):
    """Braket's EXACT state vector and probability distribution (shots=0, analytic).

    Using the analytic result instead of a second finite sample is what makes the
    parity comparison deterministic: the only randomness left is qcsim's own seeded
    sampler, so a passing circuit can never flake on RNG luck. (The previous version
    compared two independent random samples and flaked ~occasionally.)
    """
    circuit = builder(BraketCircuit)
    circuit.state_vector()
    circuit.probability()
    result = BraketSimulator().run(circuit, shots=0).result()
    state_vector = np.asarray(result.values[0], dtype=np.complex128)
    probs = np.asarray(result.values[1], dtype=float)
    n = int(round(math.log2(len(probs))))
    dist = {format(i, f"0{n}b"): float(p) for i, p in enumerate(probs)}
    return state_vector, dist


def _assert_state_vectors_equal(sv_q, sv_b):
    """qcsim and Braket must agree ELEMENTWISE — same amplitudes, same phases.

    Deliberately stricter than ``abs(np.vdot(...))``. Global phase is
    unobservable in a measurement, but qcsim's raw amplitudes are not only
    measured: browser-runnable notebooks plot ``np.angle(amplitude)`` directly
    and ``web/src/lib/pyodide-grader.ts`` grades exercises on the real and
    imaginary part of every amplitude. A phase-blind assertion let a gate
    convention drift (e.g. the textbook ``Rz = diag(1, e^{i*theta})`` instead of
    Braket's symmetric one) move every plotted phase with CI green. qcsim
    matches Braket exactly today — measured max|diff| is 0 for single-gate
    circuits and ~3e-17 for the full 15-gate one — so atol=1e-12 has orders of
    margin. The overlap stays in the message to separate "wrong state" from
    "right state, wrong phase".
    """
    sv_q = np.asarray(sv_q, dtype=np.complex128)
    sv_b = np.asarray(sv_b, dtype=np.complex128)
    assert sv_q.shape == sv_b.shape, f"state shape differs: {sv_q.shape} vs {sv_b.shape}"
    overlap = abs(np.vdot(sv_q, sv_b))
    assert np.allclose(sv_q, sv_b, rtol=0, atol=1e-12), (
        f"state vectors differ elementwise: max|diff| = {np.max(np.abs(sv_q - sv_b)):.3e}, "
        f"|<qcsim|braket>| = {overlap:.12f} "
        f"({'global-phase drift only' if abs(overlap - 1.0) < 1e-9 else 'different state'})\n"
        f"  qcsim  = {np.round(sv_q, 4)}\n  braket = {np.round(sv_b, 4)}"
    )


def _assert_sampling_matches_distribution(qcounts, exact, shots: int):
    """qcsim's seeded empirical counts must match Braket's EXACT distribution.

    Deterministic bins (p ~ 0 or 1) must match exactly; probabilistic bins must fall
    within SIGMA_TOL sigma of the expected count. Because qcsim is seeded and ``exact``
    is analytic, the outcome is fully reproducible — no RNG flake.
    """
    for k in set(qcounts) | set(exact):
        q = qcounts.get(k, 0)
        p = exact.get(k, 0.0)
        expected = p * shots
        if p < 1e-9 or p > 1 - 1e-9:
            # Deterministic outcome — must match the analytic result exactly.
            assert q == round(expected), (
                f"deterministic bin {k!r}: qcsim={q}, expected={round(expected)}"
            )
            continue
        sigma = math.sqrt(shots * p * (1 - p))
        diff = abs(q - expected)
        assert diff <= SIGMA_TOL * sigma + 5, (
            f"sampling mismatch on bin {k!r}: qcsim={q}, exact_expected={expected:.1f}, "
            f"diff={diff:.1f}, {SIGMA_TOL}-sigma={SIGMA_TOL * sigma:.1f}"
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


# ---------------------------------------------------------------------------
# Per-gate coverage builders.
#
# The parity table used to be built from h/x/i/ry/cnot/cz ONLY, so nine of
# qcsim's fifteen gate matrices could be silently wrong and this file stayed
# green — proven by mutation: rz, rx, y, z, s, t, swap, cphaseshift and ccnot
# all survived. Tightening the state-vector assertion was necessary but NOT
# sufficient; the gap was that no CIRCUIT reached those gates. These builders
# close it, each isolating one gate group so a failure names the culprit, with
# the states chosen so a wrong matrix changes the amplitudes (a control in
# superposition rather than a definite basis state, phases applied to a
# populated amplitude).
# ---------------------------------------------------------------------------


def _pauli_and_clifford_chain(C):
    """y, z, s, t and i on a superposed qubit, where each one moves an amplitude."""
    return C().h(0).y(0).z(0).s(0).t(0).i(0)


def _rotations_all_axes(C):
    """rx, ry and rz at distinct angles, pinning each axis AND its phase convention."""
    return C().h(0).rx(0, 0.7).ry(0, 1.1).rz(0, 0.35).rx(0, -0.4)


def _rz_relative_phase(C):
    """rz on a superposition, where its phase is RELATIVE (not global) and observable.

    On |0> an rz is a pure global phase; on |+> the two amplitudes separate, so
    the textbook diag(1, e^{i*theta}) convention diverges from Braket's
    symmetric diag(e^{-i*theta/2}, e^{i*theta/2}) elementwise.
    """
    return C().h(0).rz(0, 0.9).h(1).cnot(0, 1).rz(1, 1.3)


def _swap_and_cz(C):
    """swap on an asymmetric two-qubit state, then cz on a superposition."""
    return C().h(0).x(1).swap(0, 1).h(0).h(1).cz(0, 1)


def _cphaseshift_pair(C):
    """cphaseshift on |++>, where its phase lands on a populated |11> amplitude.

    This is the gate ``lib.circuits.common.qft_circuit`` is built entirely from;
    before this builder existed a pure global-phase mutation of it left the
    ENTIRE test suite green.
    """
    return C().h(0).h(1).cphaseshift(0, 1, 0.7).h(1).cphaseshift(1, 0, -1.25)


def _ccnot_superposed_controls(C):
    """Toffoli with both controls superposed, so a wrong control pair changes the state."""
    return C().h(0).h(1).x(2).ccnot(0, 1, 2).h(0).ccnot(1, 0, 2)


def _descending_qubit_order(C):
    """Multi-qubit gates with control > target, pinning the axis ORDER in _apply_two/_three.

    Every other builder lists its qubits ascending, which cannot distinguish
    ``(q1, q2)`` from ``(q2, q1)`` in the tensor contraction.
    """
    return C().h(2).h(1).cnot(2, 0).ccnot(2, 1, 0).swap(2, 0).cphaseshift(2, 0, 0.4).cz(2, 1)


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
    # Every gate qcsim implements, numerically compared to real Braket.
    ("all_gates", _all_gates, True),
    ("pauli_and_clifford_chain", _pauli_and_clifford_chain, True),
    ("rotations_all_axes", _rotations_all_axes, True),
    ("rz_relative_phase", _rz_relative_phase, True),
    ("swap_and_cz", _swap_and_cz, True),
    ("cphaseshift_pair", _cphaseshift_pair, True),
    ("ccnot_superposed_controls", _ccnot_superposed_controls, True),
    ("descending_qubit_order", _descending_qubit_order, True),
]


@pytest.mark.parametrize("_name,builder,_probabilistic", CIRCUITS, ids=[c[0] for c in CIRCUITS])
def test_qcsim_matches_braket(_name, builder, _probabilistic):
    """qcsim must agree with real Braket on both the exact state and the sampled distribution.

    Deterministic by construction: the state vectors are compared analytically, and
    qcsim's sampler is seeded and checked against Braket's EXACT distribution — so a
    passing circuit can never flake on finite-sample RNG luck the way the old
    sample-vs-sample comparison did.
    """
    sv_b, exact = _braket_analytic(builder)
    sv_q = builder(QCircuit).state_vector()
    _assert_state_vectors_equal(sv_q, sv_b)

    q_counts = _run_qcsim(builder, shots=SHOTS, seed=0).measurement_counts
    _assert_sampling_matches_distribution(q_counts, exact, SHOTS)


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
        if not c._gates:
            # The kind/qubit-count draw can land on no eligible gate at all (e.g.
            # "two" on a 1-qubit circuit). A gate-less circuit has no state to
            # normalize — both qcsim and Braket refuse it, which
            # test_empty_circuit_refuses_to_run_like_braket covers.
            continue
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
    # A circuit where depth != gate count, so this test can actually TELL the DAG
    # depth apart from len(self._gates). The previous single case had 3 gates and
    # depth 3, which is why replacing the whole computation with a gate count
    # passed the entire suite.
    parallel = QCircuit().h(0).h(1).cnot(0, 1)
    assert len(parallel.instructions) == 3
    assert parallel.depth == 2


# Circuits whose greedy moment depth deliberately differs from their gate count,
# so a gate-count-shaped regression in Circuit.depth cannot hide.
_DEPTH_CIRCUITS = [
    ("parallel_h_then_cnot", lambda C: C().h(0).h(1).cnot(0, 1)),
    ("three_parallel_singles", lambda C: C().h(0).h(1).h(2)),
    ("two_bell_pairs", lambda C: C().h(0).cnot(0, 1).h(2).cnot(2, 3)),
    ("idle_middle_qubit", lambda C: C().h(0).h(2).cnot(0, 2).x(0)),
    ("noncontiguous", lambda C: C().h(0).cnot(0, 2).ry(2, 0.3)),
    ("staggered_chain", lambda C: C().h(0).cnot(0, 1).cnot(1, 2).cnot(2, 3)),
    ("ccnot_mixed", lambda C: C().h(0).h(1).h(2).ccnot(0, 1, 2).x(0).x(1)),
    ("all_gates", _all_gates),
    ("descending", _descending_qubit_order),
]


@pytest.mark.parametrize("_name,builder", _DEPTH_CIRCUITS, ids=[c[0] for c in _DEPTH_CIRCUITS])
def test_depth_matches_braket(_name, builder):
    """Circuit.depth must equal real Braket's depth — it is the hardware-cost
    number 13 browser-runnable notebooks print, and the column count
    ``str(circuit)`` renders.

    Unlike qubit_count / measured_qubits / target / operator.name, depth had NO
    cross-SDK diff: its one assertion used a 3-gate circuit of depth 3, so
    replacing the whole DAG computation with ``len(self._gates)`` passed all 575
    tests. Every circuit here has depth != gate count.
    """
    q = builder(QCircuit)
    b = builder(BraketCircuit)
    assert q.depth == b.depth, f"{_name}: qcsim depth {q.depth} != braket depth {b.depth}"


def test_printed_diagram_has_one_column_per_moment_not_per_gate():
    """str(circuit) must render exactly .depth columns, as real Braket does.

    The render loop used to allocate one column per GATE, so a notebook printed a
    4-column diagram immediately above its own "Circuit depth: 2". Columns are
    now derived from the same greedy packing depth reports.
    """
    for _name, builder in _DEPTH_CIRCUITS:
        q = builder(QCircuit)
        lines = str(q).split("\n")
        assert len(lines) == q.qubit_count
        for line in lines:
            # "q0 :" prefix, then one padded cell per moment. Glyphs never
            # contain a space, so whitespace tokens == columns.
            cells = line.split(":", 1)[1].split()
            assert len(cells) == q.depth, (
                f"{_name}: rendered {len(cells)} columns for depth {q.depth}\n{q}"
            )


def test_printed_diagram_distinguishes_rotation_axes():
    """Rx/Ry/Rz must not all collapse to an indistinguishable 'R'."""
    rendered = str(QCircuit().rx(0, 0.1).ry(0, 0.2).rz(0, 0.3).s(0).t(0).h(0))
    for axis in ("Rx", "Ry", "Rz"):
        assert axis in rendered, f"{axis} missing from diagram:\n{rendered}"
    # Real Braket carries the axis too (it prints "Rx(0.10)").
    b_rendered = str(BraketCircuit().rx(0, 0.1).ry(0, 0.2).rz(0, 0.3))
    for axis in ("Rx", "Ry", "Rz"):
        assert axis in b_rendered


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


def test_adjoint_operator_names_match_braket_for_every_gate():
    """.adjoint() must report Braket's inverse names — Si/Ti, not S/T.

    adjoint() daggered each gate MATRIX but copied its label through, so an
    inverted circuit (03-qft, 04-qpe and 06-amplitude-estimation all call
    .adjoint()) reported "S"/"T" where real hardware reports "Si"/"Ti".
    """
    q_names = [ins.operator.name for ins in _all_gates(QCircuit).adjoint().instructions]
    b_names = [ins.operator.name for ins in _all_gates(BraketCircuit).adjoint().instructions]
    assert q_names == b_names
    assert "Si" in q_names and "Ti" in q_names


def test_adjoint_of_adjoint_restores_labels_and_state():
    """Daggering twice is the identity on the labels as well as the matrices."""
    original = _all_gates(QCircuit)
    twice = original.adjoint().adjoint()
    assert [label for label, _g, _q in twice._gates] == [label for label, _g, _q in original._gates]
    _assert_state_vectors_equal(twice.state_vector(), original.state_vector())


def test_adjoint_negates_rotation_angle_in_the_label():
    """A rotation's label must track its daggered matrix — Braket prints Rz(-0.40) too."""
    adj = QCircuit().rz(0, 0.4).adjoint()
    assert adj._gates[0][0] == "Rz(-0.400)"
    assert str(BraketCircuit().rz(0, 0.4).adjoint()).count("Rz(-0.40)") == 1


# ---------------------------------------------------------------------------
# Structural coverage: a gate cannot be added to qcsim without being registered
# AND parity-tested. Before this, a half-added gate failed OPEN — _braket_name
# echoed qcsim's internal label back as if it were Braket's, and __str__ drew
# blank wires — with the whole parity suite still green.
# ---------------------------------------------------------------------------


def _public_gate_methods() -> set[str]:
    """Every public Circuit method that appends a gate (i.e. returns a Circuit)."""
    skip = {"add_circuit", "adjoint", "state_vector"}
    return {
        name
        for name in dir(QCircuit)
        if not name.startswith("_") and name not in skip and callable(getattr(QCircuit, name, None))
    }


def test_every_gate_method_is_registered_and_parity_tested():
    registry_methods = {spec.method for spec in qcsim_circuits._GATE_SPECS.values() if spec.method}
    methods = _public_gate_methods()
    assert methods == registry_methods, (
        "every public gate method must have a _GATE_SPECS row and vice versa; "
        f"only in methods: {methods - registry_methods}, "
        f"only in registry: {registry_methods - methods}"
    )
    exercised = {ins.operator.name for ins in _all_gates(QCircuit).instructions}
    registry_names = {
        spec.braket_name for spec in qcsim_circuits._GATE_SPECS.values() if spec.method
    }
    assert exercised == registry_names, (
        f"_all_gates must exercise every registered gate; missing: {registry_names - exercised}"
    )


def test_registry_glyph_count_matches_gate_arity():
    """glyphs carry the arity __str__ draws; a mismatch would silently drop a wire."""
    for label, _gate, qubits in _all_gates(QCircuit)._gates:
        assert len(qcsim_circuits._spec(label).glyphs) == len(qubits), label


def test_unregistered_gate_label_fails_closed():
    """An unregistered label must RAISE, not echo qcsim's internal name as Braket's."""
    with pytest.raises(KeyError, match="not registered in _GATE_SPECS"):
        qcsim_circuits._braket_name("SDG")


# ---------------------------------------------------------------------------
# Construction-time validation parity
# ---------------------------------------------------------------------------


def test_float_qubit_index_rejected_like_braket():
    """`h(n / 2)` is float division — Braket raises TypeError and qcsim must too.

    This is the wrong direction of divergence: qcsim used to build a materially
    DIFFERENT circuit (qubit_count 1 instead of 4) and run it to completion,
    so the browser went green on code that hard-crashes on the real SDK.
    """
    n = 4
    with pytest.raises(TypeError, match="must be an integer"):
        QCircuit().h(n / 2)
    with pytest.raises(TypeError, match="must be an integer"):
        BraketCircuit().h(n / 2)
    for bad in (1.5, np.float64(1.0)):
        with pytest.raises(TypeError):
            QCircuit().h(bad)
        with pytest.raises(TypeError):
            BraketCircuit().h(bad)


def test_integer_like_qubit_indices_accepted_like_braket():
    """Braket accepts int, numpy integers and bool — qcsim must not be stricter."""
    for good in (1, np.int64(1), np.int32(1), np.uint8(1), True):
        assert QCircuit().h(good).qubit_count == 1
        assert BraketCircuit().h(good).qubit_count == 1


def test_partial_target_mapping_passes_unmapped_qubits_through_like_braket():
    """A mapping covering SOME qubits must remap those and leave the rest alone.

    qcsim indexed the dict directly, so a partial mapping raised a bare
    `KeyError: 1` where real Braket returns a valid circuit.
    """

    def build(C):
        return C().x(0).add_circuit(C().h(0).cnot(0, 1), target_mapping={0: 2})

    q_targets = [tuple(int(t) for t in ins.target) for ins in build(QCircuit).instructions]
    b_targets = [tuple(int(t) for t in ins.target) for ins in build(BraketCircuit).instructions]
    assert q_targets == b_targets == [(0,), (2,), (2, 1)]

    # Control cases the old code happened to get right must stay right.
    for mapping in ({}, {0: 5, 1: 6}, {0: 3, 9: 4}):

        def build_m(C, mapping=mapping):
            return C().add_circuit(C().h(0).cnot(0, 1), target_mapping=mapping)

        q = [tuple(int(t) for t in ins.target) for ins in build_m(QCircuit).instructions]
        b = [tuple(int(t) for t in ins.target) for ins in build_m(BraketCircuit).instructions]
        assert q == b, f"mapping {mapping}: qcsim {q} != braket {b}"


def test_empty_circuit_state_vector_raises_like_braket():
    """All three qcsim paths agree with the real SDK: a gate-less circuit is refused.

    state_vector() used to manufacture a phantom qubit and return [1, 0] while
    qubit_count reported 0 — and web/src/lib/pyodide-grader.ts grades tier:"py"
    exercises by calling exactly that method on a starter `Circuit()`.
    """
    assert QCircuit().qubit_count == 0
    with pytest.raises(ValueError, match="at least one"):
        QCircuit().state_vector()
    with pytest.raises(ValueError, match="at least one"):
        QSimulator().run(QCircuit(), shots=10)
    with pytest.raises(ValueError):
        BraketSimulator().run(BraketCircuit(), shots=10).result()
    # str() must not print a q0 row that qubit_count denies exists; Braket
    # prints an empty string for a gate-less circuit.
    assert str(QCircuit()) == str(BraketCircuit()) == ""


# ---------------------------------------------------------------------------
# LocalSimulator backend parity
# ---------------------------------------------------------------------------


def test_backend_name_validated_like_braket():
    """An unknown backend must raise, as it does on the real SDK."""
    with pytest.raises(ValueError, match="Only the following devices are available"):
        QSimulator("totally_bogus_backend")
    with pytest.raises(ValueError, match="Only the following devices are available"):
        BraketSimulator("totally_bogus_backend")


def test_backends_braket_accepts_are_accepted():
    """qcsim must not reject a name real Braket takes — but must warn where the
    real backend means different physics than qcsim's one noiseless engine."""
    for name in (None, "default", "braket_sv"):
        assert QSimulator(name) is not None
        assert (BraketSimulator() if name is None else BraketSimulator(name)) is not None
    for name in ("braket_dm", "braket_ahs"):
        BraketSimulator(name)  # real Braket accepts these
        with pytest.warns(RuntimeWarning, match="noiseless state-vector"):
            QSimulator(name)


# ---------------------------------------------------------------------------
# RNG parity: real Braket neither honours np.random.seed nor advances the
# global legacy stream. qcsim did both, so a seeded notebook froze in the
# browser while varying on the documented local path, and every classical draw
# after a run desynchronised.
# ---------------------------------------------------------------------------


def test_run_does_not_honour_the_global_numpy_seed_like_braket():
    """`np.random.seed(n)` must NOT freeze the histogram — real Braket ignores it.

    Deliberately uses a 6-qubit uniform superposition (64 bins, 400 shots) rather
    than a coin flip: two independent 2-bin samples coincide exactly a few
    percent of the time, which would make this test flaky. Across 64 bins an
    exact repeat is not going to happen by chance.
    """

    def counts_after_global_seed(run):
        np.random.seed(123)
        return dict(run())

    def uniform(C):
        c = C()
        for q in range(6):
            c.h(q)
        return c

    q1 = counts_after_global_seed(
        lambda: QSimulator().run(uniform(QCircuit), shots=400).result().measurement_counts
    )
    q2 = counts_after_global_seed(
        lambda: QSimulator().run(uniform(QCircuit), shots=400).result().measurement_counts
    )
    b1 = counts_after_global_seed(
        lambda: BraketSimulator().run(uniform(BraketCircuit), shots=400).result().measurement_counts
    )
    b2 = counts_after_global_seed(
        lambda: BraketSimulator().run(uniform(BraketCircuit), shots=400).result().measurement_counts
    )
    # Braket's histogram moves despite the identical global seed; qcsim's must too.
    assert b1 != b2
    assert q1 != q2, (
        "qcsim froze its histogram under np.random.seed — real Braket does not, "
        "so a shot-noise demonstration is a constant in the browser and varies locally"
    )


def test_run_does_not_advance_the_global_numpy_rng_like_braket():
    np.random.seed(123)
    baseline = np.random.rand()

    np.random.seed(123)
    BraketSimulator().run(BraketCircuit().h(0), shots=50).result()
    assert np.random.rand() == baseline

    np.random.seed(123)
    QSimulator().run(QCircuit().h(0), shots=50).result()
    assert np.random.rand() == baseline, (
        "a qcsim run consumed the global legacy RNG stream, so every later "
        "np.random.* draw differs browser-vs-local"
    )


def test_private_sampler_seed_is_reproducible():
    """The private generator still gives the parity suite full determinism."""
    qcsim_devices._seed_sampler(11)
    first = QSimulator().run(QCircuit().h(0), shots=500).result().measurement_counts
    qcsim_devices._seed_sampler(11)
    second = QSimulator().run(QCircuit().h(0), shots=500).result().measurement_counts
    assert dict(first) == dict(second)
