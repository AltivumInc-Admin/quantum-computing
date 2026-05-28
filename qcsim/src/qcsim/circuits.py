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
        for q in qubits:
            if q < 0:
                raise ValueError(f"qubit index must be non-negative, got {q}")
            if q > self._max_qubit:
                self._max_qubit = q

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

    def add_circuit(self, other: "Circuit", target_mapping: dict[int, int] | None = None) -> "Circuit":
        for name, gate, qubits in other._gates:
            mapped = tuple(target_mapping[q] if target_mapping else q for q in qubits)
            self._touch(mapped)
            self._gates.append((name, gate, mapped))
        return self

    # ----- properties -----

    @property
    def qubit_count(self) -> int:
        return self._max_qubit + 1

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
        """Apply all gates to |0...0> and return the final state vector."""
        n = max(self.qubit_count, 1)
        state = np.zeros(2**n, dtype=np.complex128)
        state[0] = 1.0
        for _name, gate, qubits in self._gates:
            if len(qubits) == 1:
                state = _apply_single(state, gate, qubits[0], n)
            elif len(qubits) == 2:
                state = _apply_two(state, gate, qubits[0], qubits[1], n)
            elif len(qubits) == 3:
                state = _apply_three(state, gate, qubits[0], qubits[1], qubits[2], n)
            else:
                raise NotImplementedError(
                    f"gate on {len(qubits)} qubits is not supported"
                )
        return state

    # ----- rendering -----

    def __str__(self) -> str:
        n = self.qubit_count
        if n == 0:
            return "q0 : -"
        rows = ["" for _ in range(n)]
        if not self._gates:
            for q in range(n):
                rows[q] = f"q{q} : -"
            return "\n".join(rows)
        for name, _gate, qubits in self._gates:
            col = [" - " for _ in range(n)]
            if len(qubits) == 1:
                # Use first character of name; for parameterized gates this is R
                col[qubits[0]] = f" {name[0]} "
            elif name == "CNOT":
                col[qubits[0]] = " C "
                col[qubits[1]] = " X "
            elif name == "CZ":
                col[qubits[0]] = " C "
                col[qubits[1]] = " Z "
            elif name == "SWAP":
                col[qubits[0]] = " S "
                col[qubits[1]] = " W "
            elif name.startswith("CP("):
                col[qubits[0]] = " C "
                col[qubits[1]] = " P "
            elif name == "CCNOT":
                col[qubits[0]] = " C "
                col[qubits[1]] = " C "
                col[qubits[2]] = " X "
            for q in range(n):
                rows[q] += col[q]
        out = []
        for q in range(n):
            out.append(f"q{q} :" + rows[q])
        return "\n".join(out)

    def __repr__(self) -> str:
        return (
            f"Circuit(n_qubits={self.qubit_count}, depth={self.depth}, "
            f"gates={len(self._gates)})"
        )


__all__ = ["Circuit"]
