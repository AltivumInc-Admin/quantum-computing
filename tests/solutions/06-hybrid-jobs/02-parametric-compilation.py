"""Canonical solutions for 06-hybrid-jobs/notebooks/02-parametric-compilation.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
ex1_circuit = Circuit().rx(0, FreeParameter("alpha")).ry(1, FreeParameter("beta")).cnot(0, 1)
_grid = [(a, b) for a in (0.0, np.pi / 2) for b in (0.0, np.pi / 2, np.pi)]
ex1_grid_counts = [
    dict(
        device.run(
            ex1_circuit, inputs={"alpha": float(a), "beta": float(b)}, shots=500
        ).result().measurement_counts
    )
    for a, b in _grid
]
""",
    2: """
_compile2 = 2.0
_run2 = 0.05
ceiling2 = (_compile2 + _run2) / _run2
_n = np.arange(1, 4001)
_speedup2 = _n * (_compile2 + _run2) / (_compile2 + _run2 * _n)
n_90 = int(_n[_speedup2 >= 0.9 * ceiling2][0])
""",
    3: """
def _z0(_t):
    return device.run(circ_exp, inputs={"theta": float(_t)}, shots=0).result().values[0]


_evals = 0
_lo, _hi = 0.0, 2 * np.pi
theta_star = 0.0
for _ in range(4):
    _grid = np.linspace(_lo, _hi, 9)
    _vals = []
    for _t in _grid:
        _vals.append(_z0(_t))
        _evals += 1
    _best = int(np.argmin(_vals))
    theta_star = float(_grid[_best])
    _step = float(_grid[1] - _grid[0])
    _lo, _hi = theta_star - _step, theta_star + _step

n_evals = _evals
""",
}
