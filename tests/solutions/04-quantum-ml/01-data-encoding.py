"""Canonical solutions for 04-quantum-ml/notebooks/01-data-encoding.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
sv_ref = statevector(angle_encoding(np.array([0.6, 0.9])))
sv_4pi = statevector(angle_encoding(np.array([0.6 + 4 * np.pi, 0.9])))
sv_2pi = statevector(angle_encoding(np.array([0.6 + 2 * np.pi, 0.9])))

print("sv_ref :", np.round(sv_ref, 4))
print("sv_4pi :", np.round(sv_4pi, 4))
print("sv_2pi :", np.round(sv_2pi, 4))
print("max |sv_4pi - sv_ref| =", np.max(np.abs(sv_4pi - sv_ref)))
print("max |sv_2pi - sv_ref| =", np.max(np.abs(sv_2pi - sv_ref)))
print("max |sv_2pi + sv_ref| =", np.max(np.abs(sv_2pi + sv_ref)))
print("probabilities equal:", np.allclose(np.abs(sv_2pi) ** 2, np.abs(sv_ref) ** 2))
""",
    2: """
_sv_amp_a = statevector(amplitude_encoding(X[0]))
_sv_amp_b = statevector(amplitude_encoding(X[1]))
overlap_amp = np.abs(np.vdot(_sv_amp_a, _sv_amp_b)) ** 2

_sv_ang_a = statevector(angle_encoding(X[0]))
_sv_ang_b = statevector(angle_encoding(X[1]))
overlap_angle = np.abs(np.vdot(_sv_ang_a, _sv_ang_b)) ** 2

print(f"amplitude encoding: |<phi(X[0])|phi(X[1])>|^2 = {overlap_amp:.4f}")
print(f"angle encoding    : |<phi(X[0])|phi(X[1])>|^2 = {overlap_angle:.4f}")
""",
}
