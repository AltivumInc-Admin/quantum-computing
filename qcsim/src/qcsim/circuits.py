"""Pure-NumPy Circuit compatible with the Braket Circuit API subset used by
this curriculum.

State-vector convention: qubit 0 is the most-significant bit of the basis
state index. This matches Braket's default for measurement output, where
``Circuit().h(0).cnot(0, 1)`` produces bitstrings ``"00"`` and ``"11"``.
"""

from __future__ import annotations

from typing import Iterable

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
# Instruction (minimal Braket-compatible view of an applied gate)
# ---------------------------------------------------------------------------

# qcsim's internal gate labels -> the ``.name`` real ``braket.circuits.Gate``
# objects report. Braket's capitalization is NOT uppercase-everywhere: a CNOT is
# ``"CNot"``, a SWAP is ``"Swap"``, a Toffoli is ``"CCNot"``. Matching these
# exactly is the whole point — a learner counting ``ins.operator.name == "CNot"``
# in the browser gets the same answer on real hardware.
_BRAKET_GATE_NAMES = {
    "H": "H",
    "X": "X",
    "Y": "Y",
    "Z": "Z",
    "S": "S",
    "T": "T",
    "I": "I",
    "CNOT": "CNot",
    "CZ": "CZ",
    "SWAP": "Swap",
    "CCNOT": "CCNot",
    # Parameterized labels carry a "(...)" suffix and are handled in _braket_name.
}


def _braket_name(label: str) -> str:
    """Map a qcsim gate label to the name the real Braket Gate would report."""
    if label.startswith("Rx("):
        return "Rx"
    if label.startswith("Ry("):
        return "Ry"
    if label.startswith("Rz("):
        return "Rz"
    if label.startswith("CP("):
        return "CPhaseShift"
    return _BRAKET_GATE_NAMES.get(label, label)


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

    def __init__(self, operator: "_Operator", target: tuple[int, ...]) -> None:
        self.operator = operator
        self.target = target

    def __repr__(self) -> str:
        return f"Instruction(operator={self.operator!r}, target={self.target})"


# ---------------------------------------------------------------------------
# Circuit
# ---------------------------------------------------------------------------


class Circuit:
    """Pure-NumPy circuit compatible with the Braket Circuit API subset."""

    def __init__(self) -> None:
        # Each gate is (name, matrix, qubits-tuple)
        self._gates: list[tuple[str, np.ndarray, tuple[int, ...]]] = []
        self._max_qubit: int = -1

    # ----- bookkeeping -----

    def _touch(self, qubits: Iterable[int]) -> None:
        qs = list(qubits)
        for q in qs:
            if q < 0:
                raise ValueError(f"qubit index must be non-negative, got {q}")
            if q > self._max_qubit:
                self._max_qubit = q
        # A multi-qubit gate needs distinct targets; Braket rejects e.g. cnot(1, 1)
        # at construction. Catch it here too, before the compaction map would
        # collapse both axes and numpy raised a cryptic "duplicate axes" error.
        if len(set(qs)) != len(qs):
            raise ValueError(f"a gate's target qubits must be distinct, got {tuple(qs)}")

    def _used_qubits(self) -> list[int]:
        """The distinct qubit indices touched by any gate, ascending.

        Braket compacts a circuit's register to exactly the qubits it uses, so
        ``Circuit().h(0).cnot(0, 2)`` is a TWO-qubit circuit (qubits 0 and 2),
        not three. We mirror that: this set is the measured register, in their
        ORIGINAL labels (qubit 2 stays "2" in ``measured_qubits`` / ``target``),
        while the state-vector math uses their compacted positions.
        """
        seen: set[int] = set()
        for _name, _gate, qubits in self._gates:
            seen.update(qubits)
        return sorted(seen)

    def _compaction_map(self) -> dict[int, int]:
        """Map each used qubit's ORIGINAL index to its 0..k-1 state-vector axis."""
        return {q: i for i, q in enumerate(self._used_qubits())}

    # ----- single-qubit gates -----

    def h(self, q: int) -> "Circuit":
        self._touch([q])
        self._gates.append(("H", _H, (q,)))
        return self

    def x(self, q: int) -> "Circuit":
        self._touch([q])
        self._gates.append(("X", _X, (q,)))
        return self

    def y(self, q: int) -> "Circuit":
        self._touch([q])
        self._gates.append(("Y", _Y, (q,)))
        return self

    def z(self, q: int) -> "Circuit":
        self._touch([q])
        self._gates.append(("Z", _Z, (q,)))
        return self

    def s(self, q: int) -> "Circuit":
        self._touch([q])
        self._gates.append(("S", _S, (q,)))
        return self

    def t(self, q: int) -> "Circuit":
        self._touch([q])
        self._gates.append(("T", _T, (q,)))
        return self

    def i(self, q: int) -> "Circuit":
        self._touch([q])
        self._gates.append(("I", _I, (q,)))
        return self

    def rx(self, q: int, theta: float) -> "Circuit":
        self._touch([q])
        self._gates.append((f"Rx({theta:.3f})", _rx(theta), (q,)))
        return self

    def ry(self, q: int, theta: float) -> "Circuit":
        self._touch([q])
        self._gates.append((f"Ry({theta:.3f})", _ry(theta), (q,)))
        return self

    def rz(self, q: int, theta: float) -> "Circuit":
        self._touch([q])
        self._gates.append((f"Rz({theta:.3f})", _rz(theta), (q,)))
        return self

    # ----- two-qubit gates -----

    def cnot(self, control: int, target: int) -> "Circuit":
        self._touch([control, target])
        self._gates.append(("CNOT", _CNOT, (control, target)))
        return self

    def cz(self, control: int, target: int) -> "Circuit":
        self._touch([control, target])
        self._gates.append(("CZ", _CZ, (control, target)))
        return self

    def cphaseshift(self, control: int, target: int, angle: float) -> "Circuit":
        self._touch([control, target])
        self._gates.append((f"CP({angle:.3f})", _cphaseshift(angle), (control, target)))
        return self

    def swap(self, a: int, b: int) -> "Circuit":
        self._touch([a, b])
        self._gates.append(("SWAP", _SWAP, (a, b)))
        return self

    # ----- three-qubit gates -----

    def ccnot(self, c1: int, c2: int, target: int) -> "Circuit":
        self._touch([c1, c2, target])
        self._gates.append(("CCNOT", _CCNOT, (c1, c2, target)))
        return self

    # ----- composition -----

    def add_circuit(
        self, other: "Circuit", target_mapping: dict[int, int] | None = None
    ) -> "Circuit":
        for name, gate, qubits in other._gates:
            mapped = tuple(target_mapping[q] if target_mapping else q for q in qubits)
            self._touch(mapped)
            self._gates.append((name, gate, mapped))
        return self

    def adjoint(self) -> "Circuit":
        """Return a NEW circuit implementing the inverse U-dagger of this one.

        For a gate sequence ``U = U_k ... U_2 U_1`` the inverse is
        ``U_dagger = U_1_dagger ... U_k_dagger``: reverse the gate order and
        replace each gate matrix with its conjugate transpose. This powers the
        compute-uncompute overlap in :func:`lib.ml.classifiers.quantum_kernel`,
        and mirrors ``braket.circuits.Circuit.adjoint``.

        The original circuit is not modified. Gate *labels* are preserved as-is
        (they are cosmetic, used only by ``__str__``); correctness comes from
        the daggered matrices, so e.g. ``Rz(theta)`` keeps its label while
        carrying the ``Rz(-theta)`` matrix.
        """
        inv = Circuit()
        inv._max_qubit = self._max_qubit
        inv._gates = [
            (name, np.conj(gate).T.copy(), qubits) for name, gate, qubits in reversed(self._gates)
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
        return [Instruction(_Operator(name), qubits) for name, _gate, qubits in self._gates]

    @property
    def qubit_count(self) -> int:
        """Number of DISTINCT used qubits — Braket's compacted register width."""
        return len(self._used_qubits())

    @property
    def depth(self) -> int:
        """Greedy DAG depth: longest gate sequence on any single qubit."""
        per_qubit: dict[int, int] = {}
        max_depth = 0
        for _name, _gate, qubits in self._gates:
            d = 1 + max((per_qubit.get(q, 0) for q in qubits), default=0)
            for q in qubits:
                per_qubit[q] = d
            if d > max_depth:
                max_depth = d
        return max_depth

    # ----- evaluation -----

    def state_vector(self) -> np.ndarray:
        """Apply all gates to |0...0> and return the final state vector.

        The vector spans the COMPACTED register (one axis per distinct used
        qubit), so ``Circuit().h(0).cnot(0, 2)`` is the 4-element Bell state, not
        an 8-element padded one — matching Braket. Each gate's original qubit
        indices are remapped to their compacted axis before application.
        """
        cmap = self._compaction_map()
        n = max(len(cmap), 1)
        state = np.zeros(2**n, dtype=np.complex128)
        state[0] = 1.0
        for _name, gate, qubits in self._gates:
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
        used = self._used_qubits()
        if not used:
            return "q0 : -"
        # Rows are the used qubits in their ORIGINAL labels (q0, q2, ...); gates
        # are placed by each qubit's compacted row position.
        cmap = {q: i for i, q in enumerate(used)}
        n = len(used)
        rows = ["" for _ in range(n)]
        if not self._gates:
            return "\n".join(f"q{q} : -" for q in used)
        for name, _gate, qubits in self._gates:
            col = [" - " for _ in range(n)]
            m = [cmap[q] for q in qubits]
            if len(m) == 1:
                # Use first character of name; for parameterized gates this is R
                col[m[0]] = f" {name[0]} "
            elif name == "CNOT":
                col[m[0]] = " C "
                col[m[1]] = " X "
            elif name == "CZ":
                col[m[0]] = " C "
                col[m[1]] = " Z "
            elif name == "SWAP":
                col[m[0]] = " S "
                col[m[1]] = " W "
            elif name.startswith("CP("):
                col[m[0]] = " C "
                col[m[1]] = " P "
            elif name == "CCNOT":
                col[m[0]] = " C "
                col[m[1]] = " C "
                col[m[2]] = " X "
            for i in range(n):
                rows[i] += col[i]
        return "\n".join(f"q{used[i]} :" + rows[i] for i in range(n))

    def __repr__(self) -> str:
        return f"Circuit(n_qubits={self.qubit_count}, depth={self.depth}, gates={len(self._gates)})"


__all__ = ["Circuit", "Instruction"]
