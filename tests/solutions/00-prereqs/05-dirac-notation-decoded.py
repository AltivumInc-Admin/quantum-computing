"""Canonical solutions for 00-prereqs/notebooks/05-dirac-notation-decoded.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
sandwich_value = plus.conj() @ H @ zero
print('<+|H|0> =', sandwich_value)
""",
    2: """
P_plus = np.outer(plus, plus.conj())
print('P|+> =', P_plus @ plus)
print('P|-> =', P_plus @ minus)
""",
    3: """
probs_plus0 = np.abs(np.kron(plus, zero)) ** 2
print('probs over (|00>, |01>, |10>, |11>):', probs_plus0)
""",
}
