"""Canonical solutions for 00-linear-algebra/notebooks/04-transpose-submatrix-properties.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
ex1_t = np.array([[3, 2],
                  [1, 7],
                  [4, 5]])
print(ex1_t)
""",
    2: """
ex2_col = np.array([[5],
                    [2],
                    [9]])
ex2_row = ex2_col.T
print("column shape:", ex2_col.shape, " row shape:", ex2_row.shape)
print(ex2_row)
""",
    3: """
ex3_prod_t = np.array([[8, 12],
                       [11, 3]])
ex3_swapped = np.array([[8, 12],
                        [11, 3]])
print(ex3_prod_t)
print(ex3_swapped)
""",
    4: """
ex4_sum_t = np.array([[3, 7],
                      [5, 5],
                      [7, 7]])
ex4_t_sum = np.array([[3, 7],
                      [5, 5],
                      [7, 7]])
print(ex4_sum_t)
print(ex4_t_sum)
""",
    5: """
ex5_flags = [True, False, True, False]
print(ex5_flags)
""",
    6: """
ex6_sum = np.array([[3, 1], [8, 5]]) + np.array([[3, 1], [8, 5]]).T
ex6_prod = np.array([[3, 1], [8, 5]]) @ np.array([[3, 1], [8, 5]]).T
print(ex6_sum)
print(ex6_prod)
""",
    7: """
ex7_minor = np.delete(
    np.delete(np.array([[5, 2, 9, 1],
                        [3, 8, 4, 6],
                        [7, 0, 2, 5],
                        [1, 6, 3, 9]]), 1, axis=0),
    3, axis=1,
)
print(ex7_minor)
""",
    8: """
ex8_block = np.array([[4, 1, 0, 2],
                      [6, 3, 5, 7],
                      [8, 2, 9, 1],
                      [0, 5, 3, 6]])[1:3, 1:3]
print(ex8_block)
""",
    9: """
ex9_a = np.array([[2, 0], [0, 0]])
ex9_b = np.array([[1, 3], [5, 2]])
ex9_c = np.array([[1, 3], [0, 7]])
print(ex9_a @ ex9_b)
print(ex9_a @ ex9_c)
""",
    10: """
ex10_a = np.array([[1, 2, 0], [0, 3, 1], [4, 1, 2]])
ex10_b = np.array([[2, 1, 3], [1, 0, 2], [5, 4, 1]])
ex10_checks = {
    "double": np.allclose(ex10_a.T.T, ex10_a),
    "scalar": np.allclose((3 * ex10_a).T, 3 * ex10_a.T),
    "product": np.allclose((ex10_a @ ex10_b).T, ex10_b.T @ ex10_a.T),
    "sum": np.allclose((ex10_a + ex10_b).T, ex10_a.T + ex10_b.T),
    "symmetric": np.allclose(ex10_a + ex10_a.T, (ex10_a + ex10_a.T).T),
    "swapped": np.allclose((ex10_a @ ex10_b).T, ex10_a.T @ ex10_b.T),
}
print(ex10_checks)
""",
}
