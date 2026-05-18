"""Result parsing utilities for Amazon Braket quantum task results."""

from collections import Counter


def parse_counts(result) -> Counter:
    """Extract measurement counts from a Braket result object."""
    measurements = result.measurements
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
