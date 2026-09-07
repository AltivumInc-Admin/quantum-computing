"""Canonical solutions for 00-linear-algebra/notebooks/02-matrices-add-subtract.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
ex1_shape = (2, 3)
ex1_p13 = 7
ex1_p21 = 2
print("shape:", ex1_shape, " p_13 =", ex1_p13, " p_21 =", ex1_p21)
""",
    2: """
ex2_sum = np.array([[5, 9],
                    [13, 9]])
print(ex2_sum)
""",
    3: """
ex3_sum = np.array([[6, 1, 3],
                    [7, 4, 5]])
print(ex3_sum)
""",
    4: """
ex4_diff = np.array([[7, -2, -2],
                     [-4, 6, 0],
                     [-4, -3, -1]])
print(ex4_diff)
""",
    5: """
ex5_scaled = np.array([[6, -3],
                       [0, 12],
                       [9, 15]])
print(ex5_scaled)
""",
    6: """
ex6_can_add = [True, False, True, False, False]
print(ex6_can_add)
""",
    7: """
ex7_zero = np.zeros((3, 4), dtype=int)
ex7_identity = np.eye(4, dtype=int)
print(ex7_zero)
print(ex7_identity)
""",
    8: """
ex8_j = np.array([[5, 1], [2, 8]])
ex8_k = np.array([[3, 6], [7, 0]])
ex8_l = np.array([[1, 2], [4, 3]])
ex8_result = ex8_j + ex8_k - 2 * ex8_l
ex8_by_hand = np.array([[6, 3],
                        [1, 2]])
print("NumPy:", ex8_result.tolist(), " by hand:", ex8_by_hand.tolist())
""",
}
