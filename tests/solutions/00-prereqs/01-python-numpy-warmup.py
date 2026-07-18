"""Canonical solutions for 00-prereqs/notebooks/01-python-numpy-warmup.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
u = np.array([1, 2, 3, 4])
u_norm = np.linalg.norm(u)
print(u_norm)
""",
    2: """
Y = np.array([[0, -1j], [1j, 0]])
Y_squared = Y @ Y
print(Y_squared)
""",
    3: """
w = np.array([1, 1]) / np.sqrt(2)
w_tensor = np.kron(w, w)
print(w_tensor)
print("norm:", np.linalg.norm(w_tensor))
""",
}
