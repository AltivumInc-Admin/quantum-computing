"""Package-level utilities: result parsing and the portable state-vector read.

These are the names re-exported here. The package also ships ``lib.utils.cost`` (cost
estimation) and ``lib.utils.visualization`` (matplotlib figures), which are deliberately
NOT re-exported — import those by their full module path so this module stays free of a
matplotlib dependency.
"""

from lib.utils.results import (
    expectation_from_counts as expectation_from_counts,
    parse_counts as parse_counts,
    top_results as top_results,
)
from lib.utils.statevector import statevector as statevector
