"""Canonical solutions for 00-prereqs/notebooks/06-bloch-sphere-playground.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
_iplus = np.array([1, 1j]) / np.sqrt(2)
iplus_theta, iplus_phi = bloch_from_state(_iplus)
print(iplus_theta, iplus_phi)
""",
    2: """
p0_pi3 = np.cos((np.pi / 3) / 2) ** 2
print("P(0) =", p0_pi3)
""",
    3: """
_one = np.array([0, 1], dtype=complex)
h1_theta, h1_phi = bloch_from_state(H @ _one)
print(h1_theta, h1_phi)
""",
}
