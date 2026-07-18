"""Canonical solutions for 05-quantum-chemistry/notebooks/03-vqe-h2.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell. Names beyond the Define contract
are underscore-prefixed so they never collide with the notebook.
"""

SOLUTIONS = {
    1: """
_lo, _hi = 0.0, 2 * np.pi
cd_theta = 0.0
for _ in range(50):
    _grid = np.linspace(_lo, _hi, 21)
    _energies = np.array([tapered_energy(t) for t in _grid])
    _j = int(np.argmin(_energies))
    cd_theta = float(_grid[_j])
    _half = (_hi - _lo) / 4.0
    _lo, _hi = cd_theta - _half, cd_theta + _half
cd_energy = tapered_energy(cd_theta)
""",
    2: """
def _ps_grad(theta):
    return (tapered_energy(theta + np.pi / 2) - tapered_energy(theta - np.pi / 2)) / 2

def _fd_grad(theta, h=1e-5):
    return (tapered_energy(theta + h) - tapered_energy(theta - h)) / (2 * h)

_test_angles = [0.0, 0.7, 1.9, 3.1, 4.5]
ps_grads = np.array([_ps_grad(t) for t in _test_angles])
fd_grads = np.array([_fd_grad(t) for t in _test_angles])

gd_theta = 0.0
for _ in range(200):
    gd_theta = gd_theta - 0.3 * _ps_grad(gd_theta)
""",
    3: """
corr_energy = H2_HF - H2_FCI
hf_from_ansatz = double_excitation_energy(0.0)
""",
    4: """
_tapered_angles = np.random.uniform(0.0, 2 * np.pi, 20)
_dbl_angles = np.random.uniform(-np.pi, np.pi, 20)
tapered_random_energies = np.array([tapered_energy(t) for t in _tapered_angles])
dbl_random_energies = np.array([double_excitation_energy(t) for t in _dbl_angles])
""",
}
