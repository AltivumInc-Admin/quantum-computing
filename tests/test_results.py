"""Tests for lib/utils/results.py."""

from collections import Counter

import pytest

from lib.utils.results import parse_counts, top_results, expectation_from_counts


def test_parse_counts_basic(mock_result_factory):
    result = mock_result_factory([[0, 0], [0, 0], [1, 1], [0, 0]])
    counts = parse_counts(result)
    assert counts["00"] == 3
    assert counts["11"] == 1


def test_parse_counts_pins_column_order(mock_result_factory):
    # Asymmetric rows: column 0 is qubit 0 (big-endian). A column reversal would
    # turn these into "10"; pin the convention so a regression is caught.
    result = mock_result_factory([[0, 1], [0, 1]])
    counts = parse_counts(result)
    assert counts["01"] == 2
    assert "10" not in counts


def test_parse_counts_rejects_noncontiguous_measured_qubits(mock_result_factory):
    # If the device measured qubits in a different order, positional joining would
    # silently mislabel outcomes — parse_counts must reject it rather than guess.
    result = mock_result_factory([[0, 1]], measured_qubits=[1, 0])
    with pytest.raises(ValueError, match="measured_qubits"):
        parse_counts(result)


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
