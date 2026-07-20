"""Result parsing utilities for Amazon Braket quantum task results."""

from collections import Counter

import numpy as np


def parse_counts(result) -> Counter:
    """Extract measurement counts from a Braket result object.

    Bitstrings are built by COLUMN POSITION: column j of each measurement row is
    treated as qubit j. That equals the qubit index only when the measured qubits
    are the contiguous range 0..n-1, in order. If the result exposes a different
    ``measured_qubits`` ordering, this positional assumption would silently
    mislabel every outcome, so we validate it and raise instead.

    Raises ValueError for an analytic (``shots=0``) result, which carries no
    measurements at all.
    """
    measurements = result.measurements
    measured = getattr(result, "measured_qubits", None)

    if measurements is None:
        # A real shots=0 (analytic) task sets BOTH `measurements` and `measured_qubits`
        # to None — `len(None)` used to die here with a bare
        # `TypeError: object of type 'NoneType' has no len()`. The curriculum runs
        # shots=0 routinely for state-vector work, so name the cause and point at the
        # helper that actually answers the question.
        raise ValueError(
            "this result has no measurements — it came from a shots=0 analytic run. "
            "Use lib.utils.statevector.statevector(circuit) to read amplitudes, or "
            "re-run with shots > 0 to get counts."
        )

    if len(measurements) == 0:
        # No shots recorded: nothing to count, and no register width to validate a
        # column order against (deriving n = 0 here would report an impossible
        # "measured_qubits == 0..-1" range).
        return Counter()

    n = len(measurements[0])
    if measured is not None and list(measured) != list(range(n)):
        raise ValueError(
            f"parse_counts requires measured_qubits == 0..{n - 1} in order; "
            f"got {list(measured)}. Reorder the measurement columns by measured_qubits first."
        )
    # One C-level conversion to native-int lists (also transparently accepts the plain-list
    # test mocks); str() on native ints + map() avoids per-element numpy-scalar boxing.
    rows = np.asarray(measurements).tolist()
    return Counter("".join(map(str, row)) for row in rows)


def top_results(counts: Counter, n: int = 5) -> list[tuple[str, int]]:
    """Return the top-n most frequent measurement outcomes."""
    return counts.most_common(n)


def expectation_from_counts(counts: Counter, observable_fn) -> float:
    """Compute expectation value of an observable from measurement counts."""
    total_shots = sum(counts.values())
    if total_shots == 0:
        # No distribution to average over. A silent 0.0 (empty Counter) or a bare
        # ZeroDivisionError (zero-total Counter) both mislead — fail clearly instead.
        raise ValueError(
            "expectation_from_counts requires at least one shot (got empty/zero-total counts)"
        )
    expectation = 0.0
    for bitstring, count in counts.items():
        expectation += observable_fn(bitstring) * count / total_shots
    return expectation
