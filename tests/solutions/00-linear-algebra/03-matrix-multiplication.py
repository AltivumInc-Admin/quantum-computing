"""Canonical solutions for 00-linear-algebra/notebooks/03-matrix-multiplication.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
ex1_iv = [4, -3]
print("I x =", ex1_iv)
""",
    2: """
ex2_sv = [-3, 4]
print("S x =", ex2_sv)
""",
    3: """
ex3_mv = [8, 23]
print("N u =", ex3_mv)
""",
    4: """
ex4_product = [[2, 1], [4, 3]]
print("J K =", ex4_product)
""",
    5: """
ex5_product = [[2, 8], [7, 1]]
print("P Q =", ex5_product)
""",
    6: """
ex6_product = [[5, 15], [0, -10]]
print("E F =", ex6_product)
""",
    7: """
ex7_tw = [8, -6, 7]
print("T w =", ex7_tw)
""",
    8: """
ex8_product = [[3, 1, 1], [0, 2, 6], [2, 2, 3]]
print("G H =", ex8_product)
""",
    9: """
ex9_uv = [[5, 2], [2, 13]]
ex9_vu = [[1, 2, 0], [2, 5, 3], [0, 4, 12]]
print("U V =", ex9_uv)
print("V U =", ex9_vu)
""",
    10: """
ex10_shapes = {
    "a": (2, 4),
    "b": None,
    "c": (4, 4),
    "d": (1, 1),
    "e": None,
}
print("ex10_shapes =", ex10_shapes)
""",
    11: """
ex11_cd = [[2, 1], [1, 1]]
ex11_dc = [[1, 1], [1, 2]]
ex11_commute = False
print("C D =", ex11_cd)
print("D C =", ex11_dc)
print("do they commute?", ex11_commute)
""",
    12: """
ex12_p = np.array([[2, 0], [1, 3]])
ex12_q = np.array([[1, 4], [2, -1]])
ex12_r = np.array([[1, 1], [0, 2]])
ex12_star = ex12_p * ex12_q
ex12_assoc = np.allclose((ex12_p @ ex12_q) @ ex12_r, ex12_p @ (ex12_q @ ex12_r))
print("P @ Q =", (ex12_p @ ex12_q).tolist(), "   P * Q =", ex12_star.tolist())
print("associative?", ex12_assoc)
""",
}
