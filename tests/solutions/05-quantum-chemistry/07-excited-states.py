"""Canonical solutions for 05-quantum-chemistry/notebooks/07-excited-states.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
loss_equal = np.array([e0 + e1 for e0, e1 in (energies_numpy(t) for t in thetas)])
print("loss spread over the grid:", float(np.ptp(loss_equal)))
""",
    2: """
def _loss(t):
    _e0, _e1 = energies_numpy(t)
    return w0 * _e0 + w1 * _e1

theta_refined = float(np.random.uniform(0.0, 2.0 * np.pi))
for _ in range(200):
    _grad = (_loss(theta_refined + np.pi / 2) - _loss(theta_refined - np.pi / 2)) / 2.0
    theta_refined -= 0.3 * _grad
print("theta_refined =", theta_refined, "->", energies_numpy(theta_refined))
""",
    3: """
_H16 = hamiltonian_matrix(H2_TERMS)
_, _U = np.linalg.eigh(_H16)
energies_3state = []
for _i in range(3):
    _inp = np.zeros(_H16.shape[0], dtype=complex)
    _inp[_i] = 1.0
    _psi = _U @ _inp
    energies_3state.append(float((_psi.conj() @ _H16 @ _psi).real))
energies_3state = np.array(energies_3state)
print("three lowest H2 energies:", energies_3state)
""",
}
