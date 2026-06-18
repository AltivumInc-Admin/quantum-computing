"""Result parsing utilities for Amazon Braket quantum task results."""

from collections import Counter


def parse_counts(result) -> Counter:
    """Extract measurement counts from a Braket result object.

    Bitstrings are built by COLUMN POSITION: column j of each measurement row is
    treated as qubit j. That equals the qubit index only when the measured qubits
    are the contiguous range 0..n-1, in order. If the result exposes a different
    ``measured_qubits`` ordering, this positional assumption would silently
    mislabel every outcome, so we validate it and raise instead.
    """
    measurements = result.measurements
    n = len(measurements[0]) if len(measurements) else 0
    measured = getattr(result, "measured_qubits", None)
    if measured is not None and list(measured) != list(range(n)):
        raise ValueError(
            f"parse_counts requires measured_qubits == 0..{n - 1} in order; "
            f"got {list(measured)}. Reorder the measurement columns by measured_qubits first."
        )
    bitstrings = ["".join(str(bit) for bit in row) for row in measurements]
    return Counter(bitstrings)


def top_results(counts: Counter, n: int = 5) -> list[tuple[str, int]]:
    """Return the top-n most frequent measurement outcomes."""
    return counts.most_common(n)


def expectation_from_counts(counts: Counter, observable_fn) -> float:
    """Compute expectation value of an observable from measurement counts."""
    total_shots = sum(counts.values())
    expectation = 0.0
    for bitstring, count in counts.items():
        expectation += observable_fn(bitstring) * count / total_shots
    return expectation
