"""Canonical solutions for 04-quantum-ml/notebooks/06-barren-plateaus.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
def _signs_first_k(n, k):
    s = np.empty(2 ** n)
    for i in range(2 ** n):
        s[i] = 1.0 if bin(i >> (n - k)).count("1") % 2 == 0 else -1.0
    return s


var_by_k = {}
for _k in range(1, 6):
    _signs = _signs_first_k(5, _k)
    np.random.seed(0)
    _grads = [
        grad_param0(5, n_layers, np.random.uniform(0, 2 * np.pi, size=5 * n_layers), _signs)
        for _ in range(30)
    ]
    var_by_k[_k] = float(np.var(_grads))
""",
    2: """
_sg = signs_global(4)
var_by_depth = {}
for _L in [1, 2, 4, 8]:
    np.random.seed(0)
    _grads = [
        grad_param0(4, _L, np.random.uniform(0, 2 * np.pi, size=4 * _L), _sg)
        for _ in range(30)
    ]
    var_by_depth[_L] = float(np.var(_grads))
""",
}
