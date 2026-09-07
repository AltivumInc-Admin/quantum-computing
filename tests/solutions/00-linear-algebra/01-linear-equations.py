"""Canonical solutions for 00-linear-algebra/notebooks/01-linear-equations.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
ex1_linear = [True, False, True, False, False, True]
print("linear? (a)-(f):", ex1_linear)
""",
    2: """
ex2_x = 2
ex2_y = 3 * ex2_x - 1
print("x =", ex2_x, " y =", ex2_y)
""",
    3: """
ex3_x = 4
ex3_y = (25 - 4 * ex3_x) / 3
print("x =", ex3_x, " y =", ex3_y)
""",
    4: """
ex4_no_solution = "P"
ex4_infinite = "Q"
print("no solution:", ex4_no_solution, " infinitely many:", ex4_infinite)
""",
    5: """
ex5_x, ex5_y = 1, 2
ex5_z = 6 - ex5_x - ex5_y
print("x, y, z =", ex5_x, ex5_y, ex5_z)
""",
    6: """
ex6_coeffs = np.array([[1, 1, 1], [2, -1, 1], [1, 2, -1]])
ex6_rhs = np.array([6, 3, 2])
ex6_sol = np.array([1, 2, 3])
ex6_lhs = np.sum(ex6_coeffs * ex6_sol, axis=1)
print("substituted:", ex6_lhs, " constants:", ex6_rhs)
""",
}
