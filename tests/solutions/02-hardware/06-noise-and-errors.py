"""Canonical solutions for 02-hardware/notebooks/06-noise-and-errors.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
def phase_damping(rho, q, n, g):
    K0 = np.array([[1, 0], [0, np.sqrt(1 - g)]], dtype=complex)
    K1 = np.array([[0, 0], [0, np.sqrt(g)]], dtype=complex)
    K0q, K1q = embed(K0, q, n), embed(K1, q, n)
    return K0q @ rho @ K0q.conj().T + K1q @ rho @ K1q.conj().T


rho_dephased = phase_damping(rho_plus, 0, 1, 1.0)
print("dephased |+>:\\n", np.round(rho_dephased, 4))
""",
    2: """
_Hmat = np.array([[1, 1], [1, -1]], dtype=complex) / np.sqrt(2)
_kick = 0.05
gate_depths = list(range(1, 11))
depth_fids = []
for _d in gate_depths:
    _rho = np.outer(zero, zero.conj())
    _ideal = zero.copy()
    for _ in range(_d):
        _rho = _Hmat @ _rho @ _Hmat.conj().T
        _rho = depolarizing(_rho, 0, 1, _kick)
        _ideal = _Hmat @ _ideal
    depth_fids.append(fidelity(_ideal, _rho))

plt.plot(gate_depths, depth_fids, "o-")
plt.xlabel("gates applied")
plt.ylabel("fidelity to ideal")
plt.show()
""",
    3: """
_curved_base = 0.15
_noisy = np.array([bell_fidelity_at(_curved_base * s) for s in scales])
_A = np.vstack([scales, np.ones_like(scales)]).T
_slope, lin_estimate = np.linalg.lstsq(_A, _noisy, rcond=None)[0]
_coeffs = np.polyfit(scales, _noisy, 2)
quad_estimate = float(np.polyval(_coeffs, 0.0))
print("raw 1x:", round(float(_noisy[0]), 4))
print("linear ZNE:", round(float(lin_estimate), 4), " quadratic ZNE:", round(quad_estimate, 4))
""",
}
