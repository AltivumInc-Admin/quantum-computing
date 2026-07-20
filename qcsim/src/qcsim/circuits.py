"""Pure-NumPy Circuit compatible with the Braket Circuit API subset used by
this curriculum.

State-vector convention: qubit 0 is the most-significant bit of the basis
state index. This matches Braket's default for measurement output, where
``Circuit().h(0).cnot(0, 1)`` produces bitstrings ``"00"`` and ``"11"``.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import NamedTuple

import numpy as np


# ---------------------------------------------------------------------------
# Gate matrices (complex128)
# ---------------------------------------------------------------------------

_I = np.eye(2, dtype=np.complex128)
_X = np.array([[0, 1], [1, 0]], dtype=np.complex128)
_Y = np.array([[0, -1j], [1j, 0]], dtype=np.complex128)
_Z = np.array([[1, 0], [0, -1]], dtype=np.complex128)
_H = np.array([[1, 1], [1, -1]], dtype=np.complex128) / np.sqrt(2)
_S = np.array([[1, 0], [0, 1j]], dtype=np.complex128)
_T = np.array([[1, 0], [0, np.exp(1j * np.pi / 4)]], dtype=np.complex128)

# S-dagger / T-dagger. Real Braket exposes these as the distinct gates ``Si``
# and ``Ti``; qcsim only ever produces them via :meth:`Circuit.adjoint`.
_Si = _S.conj().T.copy()
_Ti = _T.conj().T.copy()


def _rx(theta: float) -> np.ndarray:
    c = np.cos(theta / 2)
    s = np.sin(theta / 2)
    return np.array([[c, -1j * s], [-1j * s, c]], dtype=np.complex128)


def _ry(theta: float) -> np.ndarray:
    c = np.cos(theta / 2)
    s = np.sin(theta / 2)
    return np.array([[c, -s], [s, c]], dtype=np.complex128)


def _rz(theta: float) -> np.ndarray:
    e_minus = np.exp(-1j * theta / 2)
    e_plus = np.exp(1j * theta / 2)
    return np.array([[e_minus, 0], [0, e_plus]], dtype=np.complex128)


def _cphaseshift(angle: float) -> np.ndarray:
    return np.diag([1, 1, 1, np.exp(1j * angle)]).astype(np.complex128)


_CNOT = np.array(
    [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 1],
        [0, 0, 1, 0],
    ],
    dtype=np.complex128,
)

_CZ = np.diag([1, 1, 1, -1]).astype(np.complex128)

_SWAP = np.array(
    [
        [1, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 1],
    ],
    dtype=np.complex128,
)

_CCNOT = np.eye(8, dtype=np.complex128)
_CCNOT[6, 6] = 0
_CCNOT[7, 7] = 0
_CCNOT[6, 7] = 1
_CCNOT[7, 6] = 1


# ---------------------------------------------------------------------------
# Gate registry — the SINGLE definition of every gate qcsim supports
# ---------------------------------------------------------------------------
#
# Everything a gate needs lives in one row here: its matrix (or the factory that
# builds it from an angle), the name real Braket reports for it, the glyphs
# ``__str__`` draws, and the Circuit method that constructs it. Before this table
# existed the same gate was defined at four unlinked sites and two of them failed
# OPEN — a forgotten name mapping silently reported qcsim's internal label as if
# it were Braket's, and a forgotten render branch drew blank wires. Both now fail
# CLOSED (see :func:`_spec`), and ``tests/test_qcsim_parity.py`` asserts this
# table, the public gate methods and the parity suite's coverage are the same set.


class _GateSpec(NamedTuple):
    """One gate's complete definition.

    Attributes:
        braket_name: The ``.name`` a real ``braket.circuits.Gate`` reports.
            Braket's capitalization is NOT uppercase-everywhere: a CNOT is
            ``"CNot"``, a SWAP is ``"Swap"``, a Toffoli is ``"CCNot"``. Matching
            these exactly is the whole point — a learner counting
            ``ins.operator.name == "CNot"`` in the browser gets the same answer
            on real hardware.
        glyphs: One label per target qubit, in target order, for ``__str__``.
            ``len(glyphs)`` is the gate's arity.
        matrix: The gate's unitary, or for a parameterized gate the factory that
            takes the angle and returns it.
        method: The public :class:`Circuit` method that appends this gate, or
            ``""`` for a label only :meth:`Circuit.adjoint` can produce.
    """

    braket_name: str
    glyphs: tuple[str, ...]
    matrix: np.ndarray | Callable[[float], np.ndarray]
    method: str = ""


_GATE_SPECS: dict[str, _GateSpec] = {
    "H": _GateSpec("H", ("H",), _H, "h"),
    "X": _GateSpec("X", ("X",), _X, "x"),
    "Y": _GateSpec("Y", ("Y",), _Y, "y"),
    "Z": _GateSpec("Z", ("Z",), _Z, "z"),
    "S": _GateSpec("S", ("S",), _S, "s"),
    "T": _GateSpec("T", ("T",), _T, "t"),
    "I": _GateSpec("I", ("I",), _I, "i"),
    "Rx": _GateSpec("Rx", ("Rx",), _rx, "rx"),
    "Ry": _GateSpec("Ry", ("Ry",), _ry, "ry"),
    "Rz": _GateSpec("Rz", ("Rz",), _rz, "rz"),
    "CNOT": _GateSpec("CNot", ("C", "X"), _CNOT, "cnot"),
    "CZ": _GateSpec("CZ", ("C", "Z"), _CZ, "cz"),
    "CP": _GateSpec("CPhaseShift", ("C", "P"), _cphaseshift, "cphaseshift"),
    "SWAP": _GateSpec("Swap", ("S", "W"), _SWAP, "swap"),
    "CCNOT": _GateSpec("CCNot", ("C", "C", "X"), _CCNOT, "ccnot"),
    # Adjoint-only labels. adjoint() daggers S -> Si and T -> Ti so the reported
    # operator.name matches real Braket, which has distinct Si/Ti gates. No
    # Circuit method constructs these directly, hence the empty `method`.
    "Si": _GateSpec("Si", ("Si",), _Si, ""),
    "Ti": _GateSpec("Ti", ("Ti",), _Ti, ""),
}

# Gate labels that carry an angle render as "Key(angle)"; the bare key is the
# registry lookup. adjoint() negates the angle in the label so it stays in step
# with the daggered matrix (real Braket prints ``Rz(-0.40)`` for the inverse).
_PARAMETERIZED = frozenset({"Rx", "Ry", "Rz", "CP"})

# adjoint() label mapping for the two gates whose inverse Braket names differently.
_ADJOINT_LABELS = {"S": "Si", "T": "Ti", "Si": "S", "Ti": "T"}


def _gate_key(label: str) -> str:
    """The registry key for a gate label (``"Rz(0.400)"`` -> ``"Rz"``)."""
    return label.split("(", 1)[0]


def _spec(label: str) -> _GateSpec:
    """Look a gate label up in the registry, failing CLOSED on an unknown one.

    Raises:
        KeyError: If the label has no ``_GATE_SPECS`` entry. This is deliberate:
            echoing an unregistered label back (the old behaviour) reported
            qcsim's internal name as if it were Braket's, which is exactly the
            CNOT-vs-CNot class of error the registry exists to prevent.
    """
    key = _gate_key(label)
    try:
        return _GATE_SPECS[key]
    except KeyError:
        raise KeyError(
            f"gate label {label!r} (key {key!r}) is not registered in _GATE_SPECS. "
            "Add a row there — braket_name, glyphs, matrix, method — so "
            "operator.name, the printed diagram and the parity suite stay in step."
        ) from None


def _braket_name(label: str) -> str:
    """Map a qcsim gate label to the name the real Braket Gate would report."""
    return _spec(label).braket_name


def _adjoint_label(label: str) -> str:
    """The label of a gate's inverse.

    Gate labels are NOT cosmetic — they are the sole input to ``operator.name``
    — so :meth:`Circuit.adjoint` must dagger the label in lockstep with the
    matrix. S/T become Si/Ti (matching Braket's distinct inverse gates), and a
    parameterized gate's angle is negated (Braket prints ``Rz(-0.40)`` too).
    Every other gate qcsim supports is self-inverse, so its label is unchanged.
    """
    key = _gate_key(label)
    if key in _ADJOINT_LABELS:
        return _ADJOINT_LABELS[key]
    if key in _PARAMETERIZED:
        angle = -float(label[len(key) + 1 : -1])
        return f"{key}({angle if angle else 0.0:.3f})"
    return label


class _Operator:
    """Gate-like stand-in for a ``braket.circuits.Gate``.

    Real Braket exposes ``ins.operator`` as a Gate object whose ``.name`` uses
    Braket's own capitalization (e.g. ``"CNot"``, not ``"CNOT"``). This wrapper
    matches that so the curriculum's ``ins.operator.name == "CNot"`` idiom
    teaches the real-hardware answer.

    ``__eq__`` additionally accepts a bare string for backward compatibility with
    the legacy ``ins.operator == "CNOT"`` idiom some older learner code uses, so
    a qcsim update does not silently break it. NOTE: real Braket returns ``False``
    for ``gate == "CNot"`` (a Gate is not a str); this leniency is qcsim-only and
    intentional. New code should compare ``.name``.
    """

    __slots__ = ("name", "_label")

    def __init__(self, label: str) -> None:
        self._label = label
        self.name = _braket_name(label)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, _Operator):
            return self.name == other.name
        if isinstance(other, str):
            # Back-compat only: accept the Braket name ("CNot") and the legacy
            # qcsim label ("CNOT"). Deliberately NOT case-insensitive — matching
            # "cnot"/"rx" would diverge FURTHER from Braket (which returns False
            # for any string compare), the opposite of this change's intent.
            return other in (self.name, self._label)
        return NotImplemented

    def __hash__(self) -> int:
        return hash(self.name)

    def __str__(self) -> str:
        return self.name

    def __repr__(self) -> str:
        return self.name


class Instruction:
    """Minimal stand-in for ``braket.circuits.Instruction``.

    Exposes the two attributes curriculum notebooks read — ``operator`` (a
    Gate-like object whose ``.name`` matches Braket) and ``target`` (a tuple of
    the gate's qubit indices, in their ORIGINAL labeling) — and supports the
    common ``sum(1 for _ in circuit.instructions)`` gate-count idiom.
    """

    __slots__ = ("operator", "target")

    def __init__(self, operator: _Operator, target: tuple[int, ...]) -> None:
        self.operator = operator
        self.target = target

    def __repr__(self) -> str:
        return f"Instruction(operator={self.operator!r}, target={self.target})"


# ---------------------------------------------------------------------------
# State-vector application helpers
# ---------------------------------------------------------------------------


def _apply_single(state: np.ndarray, gate: np.ndarray, q: int, n: int) -> np.ndarray:
    """Apply a 2x2 gate on qubit q (big-endian: q=0 is the leftmost axis)."""
    state = state.reshape((2,) * n)
    state = np.tensordot(gate, state, axes=([1], [q]))
    state = np.moveaxis(state, 0, q)
    return state.reshape(2**n)


def _apply_two(state: np.ndarray, gate: np.ndarray, q1: int, q2: int, n: int) -> np.ndarray:
    """Apply a 4x4 gate on qubits (q1, q2)."""
    state = state.reshape((2,) * n)
    g = gate.reshape(2, 2, 2, 2)
    state = np.tensordot(g, state, axes=([2, 3], [q1, q2]))
    state = np.moveaxis(state, [0, 1], [q1, q2])
    return state.reshape(2**n)


def _apply_three(
    state: np.ndarray, gate: np.ndarray, q1: int, q2: int, q3: int, n: int
) -> np.ndarray:
    """Apply an 8x8 gate on qubits (q1, q2, q3)."""
    state = state.reshape((2,) * n)
    g = gate.reshape(2, 2, 2, 2, 2, 2)
    state = np.tensordot(g, state, axes=([3, 4, 5], [q1, q2, q3]))
    state = np.moveaxis(state, [0, 1, 2], [q1, q2, q3])
    return state.reshape(2**n)


# ---------------------------------------------------------------------------
# Circuit
# ---------------------------------------------------------------------------


class Circuit:
    """Pure-NumPy circuit compatible with the Braket Circuit API subset.

    Every gate method appends to this circuit and returns it, so calls chain:
    ``Circuit().h(0).cnot(0, 1)``. Qubit indices are the learner's own labels;
    Braket compacts the register to the qubits actually used (see
    :meth:`_used_qubits`) and qcsim mirrors that.

    Raises:
        TypeError: From any gate method, if a qubit index is not an integer.
            Real Braket rejects ``h(n / 2)`` — float division — the same way,
            so a circuit that builds in the browser also builds on the real SDK.
        ValueError: From any gate method, if a qubit index is negative, or if a
            multi-qubit gate's targets are not distinct (e.g. ``cnot(1, 1)``).
    """

    def __init__(self) -> None:
        # Each gate is (label, matrix, qubits-tuple)
        self._gates: list[tuple[str, np.ndarray, tuple[int, ...]]] = []

    # ----- bookkeeping -----

    def _touch(self, qubits: Iterable[int]) -> None:
        """Validate a gate's target qubits exactly as real Braket does."""
        qs = list(qubits)
        for q in qs:
            # bool is an int subclass and numpy integers are np.integer, so this
            # accepts precisely what Braket accepts (int, np.int64/int32/uint8,
            # bool) and rejects precisely what it rejects (float, np.float64).
            if not isinstance(q, (int, np.integer)):
                raise TypeError(f"Supplied qubit index, {q}, must be an integer.")
            if q < 0:
                raise ValueError(f"qubit index must be non-negative, got {q}")
        # A multi-qubit gate needs distinct targets; Braket rejects e.g. cnot(1, 1)
        # at construction. Catch it here too, before the compaction map would
        # collapse both axes and numpy raised a cryptic "duplicate axes" error.
        if len(set(qs)) != len(qs):
            raise ValueError(f"a gate's target qubits must be distinct, got {tuple(qs)}")

    def _add(
        self, label: str, qubits: tuple[int, ...], matrix: np.ndarray | None = None
    ) -> Circuit:
        """Validate, record and return self — the shared body of every gate method.

        ``matrix`` is only passed for parameterized gates, whose unitary depends
        on the angle; every other gate takes its matrix straight from the registry.
        """
        self._touch(qubits)
        if matrix is None:
            matrix = _spec(label).matrix
        self._gates.append((label, matrix, qubits))
        return self

    def _used_qubits(self) -> list[int]:
        """The distinct qubit indices touched by any gate, ascending.

        Braket compacts a circuit's register to exactly the qubits it uses, so
        ``Circuit().h(0).cnot(0, 2)`` is a TWO-qubit circuit (qubits 0 and 2),
        not three. We mirror that: this set is the measured register, in their
        ORIGINAL labels (qubit 2 stays "2" in ``measured_qubits`` / ``target``),
        while the state-vector math uses their compacted positions.
        """
        seen: set[int] = set()
        for _label, _gate, qubits in self._gates:
            seen.update(qubits)
        return sorted(seen)

    def _compaction_map(self) -> dict[int, int]:
        """Map each used qubit's ORIGINAL index to its 0..k-1 state-vector axis."""
        return {q: i for i, q in enumerate(self._used_qubits())}

    def _moment_indices(self) -> list[int]:
        """The 1-based moment (time slice) each gate is packed into, in gate order.

        Greedy left-packing: a gate occupies the first moment after the last one
        used by any of its qubits. This is the rule real Braket uses BOTH for
        ``.depth`` and for the column layout of its printed diagram, so deriving
        both from this one helper is what guarantees ``str(circuit)`` shows
        exactly ``.depth`` columns instead of one column per gate.
        """
        per_qubit: dict[int, int] = {}
        moments: list[int] = []
        for _label, _gate, qubits in self._gates:
            m = 1 + max((per_qubit.get(q, 0) for q in qubits), default=0)
            for q in qubits:
                per_qubit[q] = m
            moments.append(m)
        return moments

    # ----- single-qubit gates -----

    def h(self, q: int) -> Circuit:
        """Hadamard gate: creates an equal superposition from a basis state.

        Args:
            q: Target qubit.
        """
        return self._add("H", (q,))

    def x(self, q: int) -> Circuit:
        """Pauli-X (bit flip): swaps the |0> and |1> amplitudes.

        Args:
            q: Target qubit.
        """
        return self._add("X", (q,))

    def y(self, q: int) -> Circuit:
        """Pauli-Y: a bit flip and a phase flip together.

        Args:
            q: Target qubit.
        """
        return self._add("Y", (q,))

    def z(self, q: int) -> Circuit:
        """Pauli-Z (phase flip): negates the |1> amplitude.

        Args:
            q: Target qubit.
        """
        return self._add("Z", (q,))

    def s(self, q: int) -> Circuit:
        """S gate: a quarter turn about Z, adding a phase of i to |1>.

        Args:
            q: Target qubit.
        """
        return self._add("S", (q,))

    def t(self, q: int) -> Circuit:
        """T gate: an eighth turn about Z, adding a phase of e^(i*pi/4) to |1>.

        Args:
            q: Target qubit.
        """
        return self._add("T", (q,))

    def i(self, q: int) -> Circuit:
        """Identity: leaves the qubit unchanged but occupies a moment.

        Args:
            q: Target qubit.
        """
        return self._add("I", (q,))

    def rx(self, q: int, theta: float) -> Circuit:
        """Rotation about the X axis of the Bloch sphere by ``theta`` radians.

        Args:
            q: Target qubit.
            theta: Rotation angle in radians.
        """
        return self._add(f"Rx({theta:.3f})", (q,), _rx(theta))

    def ry(self, q: int, theta: float) -> Circuit:
        """Rotation about the Y axis of the Bloch sphere by ``theta`` radians.

        Args:
            q: Target qubit.
            theta: Rotation angle in radians.
        """
        return self._add(f"Ry({theta:.3f})", (q,), _ry(theta))

    def rz(self, q: int, theta: float) -> Circuit:
        """Rotation about the Z axis of the Bloch sphere by ``theta`` radians.

        Args:
            q: Target qubit.
            theta: Rotation angle in radians.
        """
        return self._add(f"Rz({theta:.3f})", (q,), _rz(theta))

    # ----- two-qubit gates -----

    def cnot(self, control: int, target: int) -> Circuit:
        """Controlled NOT: applies X to ``target`` when ``control`` is |1>.

        Args:
            control: The control qubit; it is never modified.
            target: The qubit that flips.
        """
        return self._add("CNOT", (control, target))

    def cz(self, control: int, target: int) -> Circuit:
        """Controlled Z: negates the amplitude of the |11> component.

        The two qubits are symmetric despite the argument names.

        Args:
            control: The control qubit.
            target: The qubit Z is applied to.
        """
        return self._add("CZ", (control, target))

    def cphaseshift(self, control: int, target: int, angle: float) -> Circuit:
        """Controlled phase shift: multiplies |11> by e^(i*angle).

        The two qubits are symmetric. This is the entangling primitive the
        quantum Fourier transform is built from (``lib.circuits.common.qft_circuit``).

        Args:
            control: The control qubit.
            target: The qubit the phase is conditioned on.
            angle: Phase angle in radians.
        """
        return self._add(f"CP({angle:.3f})", (control, target), _cphaseshift(angle))

    def swap(self, a: int, b: int) -> Circuit:
        """Exchange the states of two qubits.

        Args:
            a: First qubit.
            b: Second qubit.
        """
        return self._add("SWAP", (a, b))

    # ----- three-qubit gates -----

    def ccnot(self, c1: int, c2: int, target: int) -> Circuit:
        """Toffoli gate: applies X to ``target`` only when BOTH controls are |1>.

        Args:
            c1: First control qubit.
            c2: Second control qubit.
            target: The qubit that flips.
        """
        return self._add("CCNOT", (c1, c2, target))

    # ----- composition -----

    def add_circuit(self, other: Circuit, target_mapping: dict[int, int] | None = None) -> Circuit:
        """Append every gate of ``other`` to this circuit.

        Args:
            other: The sub-circuit to append. It is not modified.
            target_mapping: Optional PARTIAL remap of ``other``'s qubit indices.
                Listed qubits are remapped; any qubit not listed passes through
                at its original index, exactly as real Braket does.
        """
        remap = target_mapping or {}
        for label, gate, qubits in other._gates:
            mapped = tuple(remap.get(q, q) for q in qubits)
            self._touch(mapped)
            self._gates.append((label, gate, mapped))
        return self

    def adjoint(self) -> Circuit:
        """Return a NEW circuit implementing the inverse U-dagger of this one.

        For a gate sequence ``U = U_k ... U_2 U_1`` the inverse is
        ``U_dagger = U_1_dagger ... U_k_dagger``: reverse the gate order and
        replace each gate matrix with its conjugate transpose. This powers the
        compute-uncompute overlap in :func:`lib.ml.classifiers.quantum_kernel`,
        and mirrors ``braket.circuits.Circuit.adjoint``.

        The original circuit is not modified. Gate LABELS are daggered in
        lockstep with the matrices, because a label is the sole input to
        ``operator.name`` (see :class:`_Operator`) and is therefore not
        cosmetic: S/T become Si/Ti and a rotation's angle is negated, so an
        inverted circuit reports the same instruction names real Braket does.
        """
        inv = Circuit()
        inv._gates = [
            (_adjoint_label(label), np.conj(gate).T.copy(), qubits)
            for label, gate, qubits in reversed(self._gates)
        ]
        return inv

    # ----- properties -----

    @property
    def instructions(self) -> list[Instruction]:
        """Applied instructions in order (Braket-compatible; for iteration/counting).

        ``operator`` is a Gate-like object whose ``.name`` matches Braket, and
        ``target`` keeps the gate's ORIGINAL qubit labels (Braket does too — it
        compacts the *register width*, not the qubit numbers on each gate).
        """
        return [Instruction(_Operator(label), qubits) for label, _gate, qubits in self._gates]

    @property
    def qubit_count(self) -> int:
        """Number of DISTINCT used qubits — Braket's compacted register width."""
        return len(self._used_qubits())

    @property
    def depth(self) -> int:
        """Greedy DAG depth: the number of moments the gates pack into.

        Verified equal to ``braket.circuits.Circuit.depth`` on a randomized
        sweep; ``str(self)`` renders exactly this many columns.
        """
        return max(self._moment_indices(), default=0)

    # ----- evaluation -----

    def state_vector(self) -> np.ndarray:
        """Apply all gates to |0...0> and return the final state vector.

        The vector spans the COMPACTED register (one axis per distinct used
        qubit), so ``Circuit().h(0).cnot(0, 2)`` is the 4-element Bell state, not
        an 8-element padded one — matching Braket. Each gate's original qubit
        indices are remapped to their compacted axis before application.

        Raises:
            ValueError: If the circuit has no gates. Real Braket refuses a
                gate-less circuit on every path, and so does
                :meth:`qcsim.LocalSimulator.run`; returning a phantom
                one-qubit |0> here would contradict ``qubit_count == 0``.
        """
        cmap = self._compaction_map()
        n = len(cmap)
        if n == 0:
            raise ValueError("Circuit must have at least one non-zero-qubit gate to run")
        state = np.zeros(2**n, dtype=np.complex128)
        state[0] = 1.0
        for _label, gate, qubits in self._gates:
            mapped = tuple(cmap[q] for q in qubits)
            if len(mapped) == 1:
                state = _apply_single(state, gate, mapped[0], n)
            elif len(mapped) == 2:
                state = _apply_two(state, gate, mapped[0], mapped[1], n)
            elif len(mapped) == 3:
                state = _apply_three(state, gate, mapped[0], mapped[1], mapped[2], n)
            else:
                raise NotImplementedError(f"gate on {len(mapped)} qubits is not supported")
        return state

    # ----- rendering -----

    def __str__(self) -> str:
        """An ASCII diagram, ONE COLUMN PER MOMENT — the layout Braket prints.

        Columns come from :meth:`_moment_indices`, the same greedy packing
        ``.depth`` reports, so the diagram and the number printed beside it
        always agree. (They used to not: the render loop allocated a column per
        GATE, so a two-Bell-pair circuit drew 4 columns above its own
        "Circuit depth: 2".) Gate glyphs come from the registry, so a rotation
        shows its axis (``Rx``/``Ry``/``Rz``) instead of collapsing to ``R``.

        Real Braket wraps very wide diagrams into stacked blocks and labels each
        with a ``T : | 0 | 1 |`` moment header; qcsim keeps its single-block
        plain-ASCII form, so on a wide circuit compare the TOTAL column count
        against the sum of Braket's blocks.
        """
        used = self._used_qubits()
        if not used:
            # Real Braket prints an empty string for a gate-less circuit; the old
            # phantom "q0 : -" row contradicted qubit_count == 0.
            return ""
        # Rows are the used qubits in their ORIGINAL labels (q0, q2, ...); gates
        # are placed by each qubit's compacted row position.
        cmap = self._compaction_map()
        n = len(used)
        moments = self._moment_indices()
        columns: list[list[str]] = [[""] * n for _ in range(max(moments, default=0))]
        for (label, _gate, qubits), moment in zip(self._gates, moments):
            col = columns[moment - 1]
            for glyph, q in zip(_spec(label).glyphs, qubits):
                col[cmap[q]] = glyph
        rows = [f"q{q} :" for q in used]
        for col in columns:
            width = max((len(glyph) for glyph in col if glyph), default=1)
            for i in range(n):
                cell = col[i] or "-" * width
                rows[i] += f" {cell:^{width}} "
        return "\n".join(rows)

    def __repr__(self) -> str:
        return f"Circuit(n_qubits={self.qubit_count}, depth={self.depth}, gates={len(self._gates)})"


__all__ = ["Circuit", "Instruction"]
