"""Endless pen-and-paper matrix drills for the linear-algebra prereqs.

Why this file exists, and why it looks the way it does:

- **Practice, not assessment.** ``lib.grading.check`` grades one exercise once,
  and a notebook's pass/fail contract is built on it. A drill is the opposite:
  an unlimited supply of the same small arithmetic, which is the only thing
  that makes matrix multiplication automatic. Nothing here imports
  ``lib.grading``, so a drill can never leak into that contract, and a learner
  can run a hundred of them without touching a check cell.
- **Browser-safe.** ``web/jupyterlite-build/build.sh`` stages ``lib/`` verbatim
  into the Pyodide lab (step 4, ``cp -R ../../lib files/lib``), so this module
  is stdlib + numpy only: no scipy, no matplotlib, no file or network I/O.
  Everything it produces goes to stdout.
- **Reproducible by construction.** A learner who gets stuck has to be able to
  hand someone else the exact problem. Every drill therefore derives from one
  integer seed through ``numpy.random.default_rng`` -- never the legacy global
  ``numpy.random`` state, which any other notebook cell is free to reseed --
  and a drill built without a seed PRINTS the seed it drew.
- **One-based labels.** ``show()`` labels rows ``r1..rm`` and columns
  ``c1..cn`` because that is the convention the notebooks and every textbook
  use on paper. NumPy's zero-based indexing is a separate lesson; mixing the
  two in the drill output is how a learner mis-locates their own error.
- **Feedback reports magnitude, never the answer.** ``check`` names the entries
  that are wrong and how far off each one is, in ABSOLUTE value. A signed
  difference would let the learner recover the answer by subtraction, which
  makes redoing the arithmetic optional. ``reveal()`` is the only path to the
  answer, and it is a deliberate, separate keystroke.

Usage::

    from lib.linalg_drills import drill

    d = drill("multiply", level=2, seed=7)
    d.show()
    d.check([[1, 2], [3, 4]])
    d.reveal()
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

__all__ = ["KINDS", "LEVELS", "Drill", "Level", "drill"]

#: Every drill kind. A notebook offers only the kinds it has already taught.
KINDS: tuple[str, ...] = (
    "add",
    "subtract",
    "scale",
    "multiply",
    "matvec",
    "transpose",
    "submatrix",
    "defined",
)

# Seeds are drawn from [0, MAX_SEED) so the printed value stays short enough to
# retype from a screenshot or a message to a study partner.
MAX_SEED = 1_000_000

# How often level 3 hands "multiply" a deliberately impossible product. Low
# enough that most level-3 drills are still arithmetic, high enough that the
# learner cannot stop checking the inner dimensions.
UNDEFINED_RATE = 0.35

# Tolerance for a learner who typed 3.0 where the answer is 3. Entries are
# always small integers, so this only ever forgives float REPRESENTATION.
ATOL = 1e-9

_UNDEFINED_WORDS = frozenset({"undefined", "not defined", "no", "none", "false"})


@dataclass(frozen=True)
class Level:
    """The generator's dials for one difficulty level.

    ``sizes`` are the square dimensions the value kinds draw from; ``dims`` is
    the wider pool used wherever a shape may be rectangular (level 3's value
    kinds, and the "defined" kind at every level, which is a question ABOUT
    shapes and would be vacuous on same-size squares). Entries are drawn from
    ``range(low, high + 1)`` and stay small integers at every level.
    """

    sizes: tuple[int, ...]
    dims: tuple[int, ...]
    low: int
    high: int
    rectangular: bool
    may_be_undefined: bool


LEVELS: dict[int, Level] = {
    # 1: small non-negative 2x2 -- the arithmetic, with nothing else going on.
    1: Level(
        sizes=(2,),
        dims=(2, 3),
        low=0,
        high=5,
        rectangular=False,
        may_be_undefined=False,
    ),
    # 2: negatives and 3x3 -- sign errors and one more row to keep track of.
    2: Level(
        sizes=(2, 3),
        dims=(2, 3),
        low=-5,
        high=5,
        rectangular=False,
        may_be_undefined=False,
    ),
    # 3: rectangular, including products that do not exist at all.
    3: Level(
        sizes=(2, 3, 4),
        dims=(2, 3, 4),
        low=-6,
        high=6,
        rectangular=True,
        may_be_undefined=True,
    ),
}


def _num(value: Any) -> str:
    """Format one number for feedback: integral values print without a tail."""
    number = float(value)
    if abs(number - round(number)) < ATOL:
        return str(int(round(number)))
    return f"{number:.3f}"


def _shape_text(shape: tuple[int, ...]) -> str:
    if shape == ():
        return "a single number"
    if len(shape) == 1:
        return f"one row of {int(shape[0])} entries"
    return " x ".join(str(int(dim)) for dim in shape)


def _format_matrix(name: str, matrix: np.ndarray) -> str:
    """Render a matrix with one-based row and column labels.

    A 1-D array prints as a COLUMN, because that is what a vector is in every
    product the curriculum writes down.
    """
    array = np.asarray(matrix)
    grid = array.reshape(-1, 1) if array.ndim == 1 else np.atleast_2d(array)
    rows, cols = grid.shape
    row_labels = [f"r{i + 1}" for i in range(rows)]
    col_labels = [f"c{j + 1}" for j in range(cols)]
    cells = [[_num(value) for value in row] for row in grid]
    width = max(
        max(len(cell) for row in cells for cell in row),
        max(len(label) for label in col_labels),
    )
    label_width = max(len(label) for label in row_labels)
    lines = [f"{name} ({rows} x {cols})"]
    lines.append(" " * label_width + "".join(f"  {label:>{width}}" for label in col_labels))
    for label, row in zip(row_labels, cells):
        lines.append(f"{label:<{label_width}}" + "".join(f"  {cell:>{width}}" for cell in row))
    return "\n".join(lines)


def _keep_count(rng: np.random.Generator, size: int) -> int:
    """How many of ``size`` rows (or columns) a submatrix keeps.

    Always fewer than all of them -- "the whole matrix" is not a drill -- and
    never fewer than two below, so a 4x4 never collapses to a single entry the
    learner can read straight off the page.
    """
    return int(rng.integers(max(1, size - 2), size))


def _reads_as_undefined(answer: Any) -> bool:
    """True when the learner is saying "this product does not exist".

    Accepted spellings are ``False``, ``None`` and a few words, because the
    drill is about the inner dimensions and not about guessing the sentinel
    the module happens to use.
    """
    if answer is None:
        return True
    if isinstance(answer, (bool, np.bool_)):
        return not bool(answer)
    if isinstance(answer, str):
        return answer.strip().lower() in _UNDEFINED_WORDS
    return False


def _as_shape(answer: Any) -> tuple[int, int] | None:
    """Read a (rows, columns) answer, or None if it is not one."""
    if isinstance(answer, (str, bytes)) or isinstance(answer, (bool, np.bool_)):
        return None
    try:
        values = [int(v) for v in np.asarray(answer).reshape(-1)]
    except (TypeError, ValueError):
        return None
    if len(values) != 2:
        return None
    return values[0], values[1]


class Drill:
    """One generated problem: its operands, its prompt, and its answer.

    Built by :func:`drill`; constructing one directly is fine but skips the
    kind/level validation and the "no seed given" message.
    """

    def __init__(self, kind: str, level: int, seed: int):
        self.kind = kind
        self.level = level
        self.seed = int(seed)
        #: Display name -> operand, in the order ``show()`` prints them.
        self.operands: dict[str, np.ndarray] = {}
        #: The multiplier, for the "scale" kind only.
        self.scalar: int | None = None
        #: One-based rows/columns kept, for the "submatrix" kind only.
        self.sub_rows: tuple[int, ...] | None = None
        self.sub_cols: tuple[int, ...] | None = None
        self._answer = self._build(np.random.default_rng(self.seed))

    # ---------------------------------------------------------------- build

    @property
    def _level(self) -> Level:
        return LEVELS[self.level]

    def _entries(self, rng: np.random.Generator, rows: int, cols: int) -> np.ndarray:
        level = self._level
        return np.asarray(rng.integers(level.low, level.high + 1, size=(rows, cols)), dtype=int)

    def _square(self, rng: np.random.Generator) -> int:
        return int(rng.choice(self._level.sizes))

    def _shape(self, rng: np.random.Generator) -> tuple[int, int]:
        level = self._level
        if level.rectangular:
            return int(rng.choice(level.dims)), int(rng.choice(level.dims))
        size = self._square(rng)
        return size, size

    def _scalar_value(self, rng: np.random.Generator) -> int:
        level = self._level
        # 0 and 1 are excluded: multiplying by either teaches nothing.
        pool = [k for k in range(level.low, level.high + 1) if k not in (0, 1)]
        return int(rng.choice(pool))

    def _build(self, rng: np.random.Generator) -> Any:
        """Draw the problem and return its answer.

        The answer is an ndarray for the value kinds, ``None`` for a
        deliberately undefined product, and ``(rows, columns)`` or ``False``
        for the "defined" kind.
        """
        kind = self.kind
        level = self._level

        if kind in ("add", "subtract"):
            rows, cols = self._shape(rng)
            a = self._entries(rng, rows, cols)
            b = self._entries(rng, rows, cols)
            self.operands = {"A": a, "B": b}
            return a + b if kind == "add" else a - b

        if kind == "scale":
            rows, cols = self._shape(rng)
            a = self._entries(rng, rows, cols)
            self.operands = {"A": a}
            self.scalar = self._scalar_value(rng)
            return self.scalar * a

        if kind == "multiply":
            if level.rectangular:
                left_rows = int(rng.choice(level.dims))
                inner = int(rng.choice(level.dims))
                right_cols = int(rng.choice(level.dims))
            else:
                left_rows = inner = right_cols = self._square(rng)
            right_rows = inner
            if level.may_be_undefined and float(rng.random()) < UNDEFINED_RATE:
                right_rows = int(rng.choice([d for d in level.dims if d != inner]))
            a = self._entries(rng, left_rows, inner)
            b = self._entries(rng, right_rows, right_cols)
            self.operands = {"A": a, "B": b}
            return None if right_rows != inner else a @ b

        if kind == "matvec":
            rows, cols = self._shape(rng)
            a = self._entries(rng, rows, cols)
            v = self._entries(rng, cols, 1).reshape(cols)
            self.operands = {"A": a, "v": v}
            return a @ v

        if kind == "transpose":
            rows, cols = self._shape(rng)
            a = self._entries(rng, rows, cols)
            self.operands = {"A": a}
            return np.array(a.T)

        if kind == "submatrix":
            rows, cols = self._shape(rng)
            a = self._entries(rng, rows, cols)
            kept_rows = np.sort(rng.choice(rows, size=_keep_count(rng, rows), replace=False))
            kept_cols = np.sort(rng.choice(cols, size=_keep_count(rng, cols), replace=False))
            self.operands = {"A": a}
            self.sub_rows = tuple(int(i) + 1 for i in kept_rows)
            self.sub_cols = tuple(int(j) + 1 for j in kept_cols)
            return np.array(a[np.ix_(kept_rows, kept_cols)])

        if kind == "defined":
            pool = level.dims
            left_rows = int(rng.choice(pool))
            inner = int(rng.choice(pool))
            right_cols = int(rng.choice(pool))
            right_rows = inner
            if float(rng.random()) < 0.5:
                right_rows = int(rng.choice([d for d in pool if d != inner]))
            a = self._entries(rng, left_rows, inner)
            b = self._entries(rng, right_rows, right_cols)
            self.operands = {"A": a, "B": b}
            return (left_rows, right_cols) if right_rows == inner else False

        raise ValueError(f"unknown drill kind {kind!r}")

    # ----------------------------------------------------------------- show

    def _question(self) -> str:
        kind = self.kind
        if kind == "add":
            return "Compute A + B."
        if kind == "subtract":
            return "Compute A - B."
        if kind == "scale":
            return f"Compute {self.scalar} A: every entry of A scaled by {self.scalar}."
        if kind == "multiply":
            return "Compute the matrix product A B."
        if kind == "matvec":
            return "Compute A v."
        if kind == "transpose":
            return "Write down A transposed: its rows become columns."
        if kind == "submatrix":
            rows = ", ".join(str(i) for i in self.sub_rows or ())
            cols = ", ".join(str(j) for j in self.sub_cols or ())
            return (
                f"Write down the submatrix of A formed by rows {rows} "
                f"and columns {cols}, numbering from 1."
            )
        return "Does the product A B exist? If it does, what shape is the result?"

    def _how_to_answer(self) -> str:
        if self.kind == "defined":
            return (
                "Answer False if the product does not exist, or its shape as "
                "(rows, columns) if it does, then call check(your_answer)."
            )
        if self.kind == "matvec":
            return "Answer with a flat list of the result's entries, then call check(your_answer)."
        lead = (
            "Answer with a nested list of rows -- [[1, 2], [3, 4]] -- or a "
            "NumPy array, then call check(your_answer)."
        )
        if self.kind == "multiply" and self._level.may_be_undefined:
            lead += " If the product does not exist, answer False."
        return lead

    def show(self) -> None:
        """Print the problem: header, question, operands, and how to answer."""
        print(f"Drill: {self.kind} | level {self.level} | seed {self.seed}")
        print()
        print(self._question())
        for name, operand in self.operands.items():
            print()
            print(_format_matrix(name, operand))
        print()
        print(self._how_to_answer())

    # ---------------------------------------------------------------- check

    def check(self, answer: Any) -> bool:
        """Score ``answer``; print what is wrong and by how much. Returns a bool.

        ``answer`` may be a nested list, a NumPy array, or -- where the drill
        allows it -- ``False`` for "this product does not exist". For the
        "defined" kind it is a bool or a ``(rows, columns)`` shape.
        """
        if self.kind == "defined":
            return self._check_defined(answer)

        if self._answer is None:
            if _reads_as_undefined(answer):
                print(
                    "[drill] yes: A's column count and B's row count disagree, "
                    "so A B does not exist."
                )
                return True
            print(
                "[drill] not yet -- check that the product exists before computing "
                "entries: for A B, A's column count must equal B's row count."
            )
            return False

        if _reads_as_undefined(answer):
            print(
                "[drill] not yet -- count A's columns against B's rows once more, "
                "then compute the entries."
            )
            return False

        return self._check_values(answer)

    def _check_values(self, answer: Any) -> bool:
        expected = np.asarray(self._answer)
        try:
            given = np.asarray(answer)
        except (TypeError, ValueError):
            print(
                "[drill] not yet -- that is not a rectangular block of numbers. "
                "Every row of your answer needs the same number of entries."
            )
            return False
        if given.dtype.kind not in "biufc":
            print(
                "[drill] not yet -- your answer has to be numbers (a nested list "
                "of rows, or a NumPy array)."
            )
            return False
        # A column/row vector typed as [[1], [2]] is the same answer as [1, 2].
        if expected.ndim == 1 and given.ndim == 2 and 1 in given.shape:
            given = given.reshape(-1)
        if given.shape != expected.shape:
            print(
                f"[drill] not yet -- your answer is {_shape_text(given.shape)}, but "
                f"this drill's result is {_shape_text(expected.shape)}. Re-count the "
                "rows and columns before re-computing."
            )
            return False

        wrong = ~np.isclose(given.astype(float), expected.astype(float), atol=ATOL, rtol=0.0)
        if not wrong.any():
            print(f"[drill] {self.kind}: every entry matches. Draw another one.")
            return True

        count = int(wrong.sum())
        plural = "entry" if count == 1 else "entries"
        print(f"[drill] not yet -- {count} {plural} of {expected.size} do not match:")
        for index in zip(*np.nonzero(wrong)):
            if expected.ndim == 1:
                where = f"entry {index[0] + 1}"
            else:
                where = f"r{index[0] + 1}c{index[1] + 1}"
            gap = abs(float(given[index]) - float(expected[index]))
            print(f"  {where}: you wrote {_num(given[index])}, off by {_num(gap)}")
        print("Redo those entries and call check again; reveal() shows the answer.")
        return False

    def _check_defined(self, answer: Any) -> bool:
        expected = self._answer
        if expected is False:
            if _reads_as_undefined(answer):
                print("[drill] yes: the inner dimensions disagree, so A B does not exist.")
                return True
            print(
                "[drill] not yet -- for A B to exist, A's column count must equal "
                "B's row count. Compare those two numbers again."
            )
            return False

        if _reads_as_undefined(answer):
            print("[drill] not yet -- compare A's column count with B's row count once more.")
            return False
        if isinstance(answer, (bool, np.bool_)):
            print(
                "[drill] yes, A B exists. For the whole answer, give its shape as (rows, columns)."
            )
            return True
        shape = _as_shape(answer)
        if shape is None:
            print(
                "[drill] not yet -- answer False, or give the shape as two numbers, "
                "(rows, columns)."
            )
            return False
        if shape == expected:
            print("[drill] defined: that is the shape. Draw another one.")
            return True
        print(
            "[drill] not yet -- the result takes its row count from A and its "
            "column count from B. Read those two off again."
        )
        return False

    # --------------------------------------------------------------- reveal

    def reveal(self) -> Any:
        """Print and return the answer. The only path to it."""
        if self.kind == "defined":
            if self._answer is False:
                print(
                    f"[drill] A B does not exist: A has {self.operands['A'].shape[1]} "
                    f"columns and B has {self.operands['B'].shape[0]} rows."
                )
                return False
            rows, cols = self._answer
            print(f"[drill] A B exists, and the result is {rows} x {cols}.")
            return (rows, cols)

        if self._answer is None:
            print(
                f"[drill] A B does not exist: A has {self.operands['A'].shape[1]} "
                f"columns and B has {self.operands['B'].shape[0]} rows, so the "
                "inner dimensions disagree."
            )
            return None

        print("[drill] answer:")
        print(_format_matrix("result", np.asarray(self._answer)))
        # A copy: a learner poking at the returned array must not edit the drill.
        return np.array(self._answer)


def drill(kind: str, level: int = 1, seed: int | None = None) -> Drill:
    """Build one drill of ``kind`` at ``level``.

    ``drill(kind, level, seed)`` is a pure function of its three arguments: the
    same call always produces the same problem. Omit ``seed`` and one is drawn
    and PRINTED, so the problem stays reproducible after the fact.
    """
    if kind not in KINDS:
        raise ValueError(f"unknown drill kind {kind!r}; choose one of {', '.join(KINDS)}")
    if level not in LEVELS:
        levels = ", ".join(str(key) for key in sorted(LEVELS))
        raise ValueError(f"unknown level {level!r}; levels are {levels}")
    if seed is None:
        # default_rng() with no argument seeds from OS entropy -- it does NOT
        # touch (or read) the legacy global numpy.random state, so a drill can
        # neither disturb nor be disturbed by a np.random.seed call elsewhere
        # in the notebook.
        seed = int(np.random.default_rng().integers(0, MAX_SEED))
        print(
            f"[drill] no seed given -- using seed={seed}. "
            f"Pass seed={seed} to get this same problem again."
        )
    return Drill(kind, level, int(seed))
