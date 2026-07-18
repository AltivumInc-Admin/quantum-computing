"""Notebook exercise self-checks.

``check`` is the single primitive behind every "Check Exercise N" cell in the
curriculum: a context manager that turns the cell's plain ``assert``
statements into learner-facing feedback instead of tracebacks.

Design constraints (why this file looks the way it does):

- Browser-safe: stdlib only, so the JupyterLite lab (Pyodide + qcsim) imports
  it exactly like ``lib.utils.statevector`` with no extra wheels and no cloud
  modules dragged into the import graph.
- Unsolved notebooks must execute clean end-to-end (the runnable-contract CI
  executes every cell): an exercise not attempted yet is a message, never an
  error.
- The solutions harness (``tests/test_exercise_checks.py``) must be able to
  make failures fatal: ``QL_GRADING_STRICT=1`` re-raises everything, so a
  wrong check or a wrong canonical solution fails CI instead of printing.

The printed markers are machine-parsed by the harness — change them only in
lockstep with ``tests/test_exercise_checks.py``.
"""

from __future__ import annotations

import os

STRICT_ENV = "QL_GRADING_STRICT"

# Harness-parsed markers (ASCII, stable).
CORRECT_MARKER = "correct."
NOT_ATTEMPTED_MARKER = "not attempted yet"
NOT_YET_MARKER = "not yet"


class check:
    """Wrap the asserts of one exercise's check cell.

    Usage inside a notebook check cell::

        with check("Exercise 1"):
            assert set(counts) <= {"000", "111"}, "only the two GHZ outcomes"

    Outcomes (non-strict, the learner's default):
    - all asserts hold        -> "[check] Exercise 1: correct."
    - a name is undefined     -> "not attempted yet" guidance (the scaffold's
                                 variables don't exist until the learner runs
                                 their attempt)
    - an assert fails         -> "not yet" + the assert's guidance message
    - any other Exception     -> reported with its type, still non-fatal

    KeyboardInterrupt/SystemExit always propagate. With ``QL_GRADING_STRICT=1``
    every failure propagates, which is how the solutions harness turns these
    cells into a hard gate.
    """

    def __init__(self, label: str):
        self.label = label

    def __enter__(self) -> "check":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc_type is None:
            print(f"[check] {self.label}: {CORRECT_MARKER}")
            return False
        # Never swallow interrupts/system-exit; never swallow anything in
        # strict mode -- the harness needs the real failure.
        if not (isinstance(exc, Exception)) or os.environ.get(STRICT_ENV) == "1":
            return False
        if isinstance(exc, NameError):
            print(
                f"[check] {self.label}: {NOT_ATTEMPTED_MARKER} ({exc}). "
                "Complete the exercise cell above, run it, then re-run this check."
            )
        elif isinstance(exc, AssertionError):
            reason = str(exc) or "a check did not hold"
            print(
                f"[check] {self.label}: {NOT_YET_MARKER} - {reason}. "
                "Revisit the hints and try again."
            )
        else:
            print(f"[check] {self.label}: your attempt raised {exc_type.__name__}: {exc}")
        return True
