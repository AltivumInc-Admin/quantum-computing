"""Canonical solutions for 03-algorithms/notebooks/05-qaoa-maxcut.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
square_edges = [(0, 1), (1, 2), (2, 3), (3, 0)]
_n4 = 4
_gammas4 = np.linspace(0.0, np.pi, 24, endpoint=False)
_betas4 = np.linspace(0.0, np.pi / 2, 24, endpoint=False)
best_cut_square = 0.0
for _beta in _betas4:
    for _gamma in _gammas4:
        _circ = build_qaoa([_gamma], [_beta], square_edges, _n4)
        _res = device.run(_circ, shots=SHOTS).result()
        _val = expected_cut(_res.measurement_counts, square_edges)
        if _val > best_cut_square:
            best_cut_square = _val
print("best expected cut on the square:", round(best_cut_square, 4))
""",
    2: """
def _grid_best(res):
    _g = np.linspace(0.0, np.pi, res, endpoint=False)
    _b = np.linspace(0.0, np.pi / 2, res, endpoint=False)
    _best = 0.0
    for _beta in _b:
        for _gamma in _g:
            _r = device.run(build_qaoa([_gamma], [_beta], edges, n_qubits), shots=SHOTS).result()
            _best = max(_best, expected_cut(_r.measurement_counts, edges))
    return _best


coarse_best = _grid_best(12)
fine_best = _grid_best(24)
print(f"coarse (12x12) best = {coarse_best:.4f}, fine (24x24) best = {fine_best:.4f}")
""",
}
