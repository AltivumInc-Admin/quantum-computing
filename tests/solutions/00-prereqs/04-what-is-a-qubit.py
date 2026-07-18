"""Canonical solutions for 00-prereqs/notebooks/04-what-is-a-qubit.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
psi_ex1 = np.array([1 / 2, np.sqrt(3) / 2], dtype=complex)
probs_ex1 = measurement_probs(psi_ex1)
print(f"P(0) = {probs_ex1[0]:.3f}, P(1) = {probs_ex1[1]:.3f}")
""",
    2: """
psi_ex2 = np.array([1, 1j]) / np.sqrt(2)
probs_ex2 = measurement_probs(psi_ex2)
print(f"P(0) = {probs_ex2[0]:.3f}, P(1) = {probs_ex2[1]:.3f}")
""",
    3: """
probs_plus3 = measurement_probs(plus)
probs_minus3 = measurement_probs(minus)
print("|+> probabilities:", probs_plus3)
print("|-> probabilities:", probs_minus3)
""",
}
