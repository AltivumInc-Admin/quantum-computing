"""Canonical solutions for 00-prereqs/notebooks/03-probability-and-measurement.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
dist4 = np.array([0.1, 0.2, 0.3, 0.4])
_samples4 = np.random.choice(4, size=50_000, p=dist4)
emp_freqs = np.bincount(_samples4, minlength=4) / 50_000
print('true     :', dist4)
print('empirical:', emp_freqs)
""",
    2: """
_faces = np.arange(1, 7)
_face_probs = np.full(6, 1 / 6)
die_ev = (_faces * _face_probs).sum()
die_ev_sampled = np.random.choice(_faces, size=100_000).mean()
print('EV (analytic) =', die_ev)
print('EV (sampled)  =', die_ev_sampled)
""",
    3: """
psi_ex = np.array([1 / np.sqrt(3), np.sqrt(2) / np.sqrt(3)])
p_zero = np.abs(psi_ex[0]) ** 2
p_one = np.abs(psi_ex[1]) ** 2
print('P(0) =', p_zero)
print('P(1) =', p_one)
""",
}
