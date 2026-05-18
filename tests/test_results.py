"""Tests for lib/utils/results.py."""

from collections import Counter
from lib.utils.results import parse_counts, top_results, expectation_from_counts


class MockResult:
    """Mock Braket result for testing without AWS."""

    def __init__(self, measurements):
        self.measurements = measurements


def test_parse_counts_basic():
    result = MockResult([[0, 0], [0, 0], [1, 1], [0, 0]])
    counts = parse_counts(result)
    assert counts["00"] == 3
    assert counts["11"] == 1


def test_top_results_ordering():
    counts = Counter({"00": 500, "11": 300, "01": 150, "10": 50})
    top = top_results(counts, n=2)
    assert top[0] == ("00", 500)
    assert top[1] == ("11", 300)


def test_expectation_from_counts_z_observable():
    counts = Counter({"0": 700, "1": 300})

    def z_eigenvalue(bitstring):
        return 1.0 if bitstring == "0" else -1.0

    exp = expectation_from_counts(counts, z_eigenvalue)
    assert abs(exp - 0.4) < 1e-10
