"""Canonical solutions for 00-prereqs/notebooks/02-linear-algebra-for-quantum.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
ket0 = np.array([1, 0])
ket1 = np.array([0, 1])
ip_01 = ket0.conj() @ ket1
ip_00 = ket0.conj() @ ket0
ip_11 = ket1.conj() @ ket1
print("<0|1> =", ip_01, " <0|0> =", ip_00, " <1|1> =", ip_11)
""",
    2: """
A_matrix = np.array([[1, 1], [1, 1]])
AdagA = A_matrix.conj().T @ A_matrix
A_is_unitary = is_unitary(A_matrix)
print("A-dagger A =")
print(AdagA)
print("Is A unitary?", A_is_unitary)
""",
    3: """
psi_010 = np.kron(np.kron(zero, one), zero)
hot_index = int(np.argmax(np.abs(psi_010)))
print("length:", len(psi_010), " nonzero index:", hot_index)
""",
}
