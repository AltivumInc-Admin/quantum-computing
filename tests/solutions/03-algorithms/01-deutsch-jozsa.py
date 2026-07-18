"""Canonical solutions for 03-algorithms/notebooks/01-deutsch-jozsa.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
def oracle_balanced_x1x2():
    _c = Circuit()
    _c.cnot(1, ANCILLA)
    _c.cnot(2, ANCILLA)
    return _c


p_x1x2 = input_register_zero_prob(deutsch_jozsa(oracle_balanced_x1x2()))
print("balanced (f = x1 XOR x2): P(input == 000) =", p_x1x2)
""",
    2: """
_c = Circuit()
_c.x(ANCILLA)
for _q in range(N_TOTAL):
    _c.h(_q)
_c.add_circuit(oracle_balanced_parity())
sv_kickback = statevector(_c)
print(np.round(sv_kickback, 3))
""",
}
