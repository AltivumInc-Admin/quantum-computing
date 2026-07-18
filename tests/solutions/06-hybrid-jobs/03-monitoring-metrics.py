"""Canonical solutions for 06-hybrid-jobs/notebooks/03-monitoring-metrics.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell. Every snippet assumes the local VQE
setup the notebook has already run: ``energy``, ``start``, ``lr``, ``max_iter``,
``shift``, ``energy_history``, and ``exact_min``.
"""

SOLUTIONS = {
    1: """
grad_norm_history = []
_params = start.copy()
for _i in range(max_iter):
    _grad = np.zeros(2)
    for _k in range(2):
        _plus = _params.copy()
        _plus[_k] += shift
        _minus = _params.copy()
        _minus[_k] -= shift
        _grad[_k] = 0.5 * (energy(_plus) - energy(_minus))
    grad_norm_history.append(float(np.linalg.norm(_grad)))
    _params = _params - lr * _grad
print(f"grad norm: {grad_norm_history[0]:.4f} -> {grad_norm_history[-1]:.4f}")
""",
    2: """
def run(tol):
    _params = start.copy()
    _prev = None
    _e = None
    for _i in range(max_iter):
        _e = energy(_params)
        if _prev is not None and abs(_prev - _e) < tol:
            return _i, float(_e)
        _prev = _e
        _grad = np.zeros(2)
        for _k in range(2):
            _plus = _params.copy()
            _plus[_k] += shift
            _minus = _params.copy()
            _minus[_k] -= shift
            _grad[_k] = 0.5 * (energy(_plus) - energy(_minus))
        _params = _params - lr * _grad
    return max_iter, float(_e)


stop_iters = {_tol: run(_tol)[0] for _tol in (1e-2, 1e-3, 1e-4)}
print(stop_iters)
""",
    3: """
lr_histories = {}
for _lr in (0.1, 0.3, 0.5, 0.8):
    _params = start.copy()
    _hist = []
    for _i in range(max_iter):
        _hist.append(energy(_params))
        _grad = np.zeros(2)
        for _k in range(2):
            _plus = _params.copy()
            _plus[_k] += shift
            _minus = _params.copy()
            _minus[_k] -= shift
            _grad[_k] = 0.5 * (energy(_plus) - energy(_minus))
        _params = _params - _lr * _grad
    lr_histories[_lr] = _hist
print({_lr: round(_h[-1], 4) for _lr, _h in lr_histories.items()})
""",
    4: """
metrics_records = [
    {"iteration_number": i, "metric_name": "energy", "value": float(e)}
    for i, e in enumerate(energy_history)
]
print(f"reconstructed {len(metrics_records)} metric rows")
""",
}
