"""Canonical solutions for 03-algorithms/notebooks/06-amplitude-estimation.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
a_target = 0.35
_theta_target = 2 * np.arcsin(np.sqrt(a_target))
A_target = Circuit().ry(0, _theta_target)


def _make_Q_target():
    _A_dag = A_target.adjoint()
    _q = Circuit()
    _q.add_circuit(S_f())
    _q.add_circuit(_A_dag)
    _q.add_circuit(S_0())
    _q.add_circuit(A_target)
    return _q


def _circuit_for_k_target(k):
    _c = Circuit()
    _c.add_circuit(A_target)
    for _ in range(k):
        _c.add_circuit(_make_Q_target())
    return _c


p_exact_target = []
for _k in range(5):
    _sv = statevector(_circuit_for_k_target(_k))
    p_exact_target.append(float(np.abs(_sv[1]) ** 2))

_powers_target = [0, 1, 2, 3]
_hits_target = []
for _k in _powers_target:
    _res = device.run(_circuit_for_k_target(_k), shots=shots).result()
    _hits_target.append(_res.measurement_counts.get("1", 0))

_grid_target = np.linspace(0.001, 0.999, 400)


def _log_likelihood_target(a):
    _theta_a = 2 * np.arcsin(np.sqrt(a))
    _ll = 0.0
    for _k, _h in zip(_powers_target, _hits_target):
        _p = np.sin((2 * _k + 1) * _theta_a / 2) ** 2
        _p = min(max(_p, 1e-12), 1 - 1e-12)
        _ll += _h * np.log(_p) + (shots - _h) * np.log(1 - _p)
    return _ll


a_hat_target = float(
    _grid_target[np.argmax([_log_likelihood_target(a) for a in _grid_target])]
)
print(f"a_target = {a_target}, a_hat_target = {a_hat_target:.4f}")
""",
    2: """
schedules = [[0], [0, 1], [0, 1, 2, 3, 4]]
_max_power = max(k for _sched in schedules for k in _sched)
_hits_by_power = {}
for _k in range(_max_power + 1):
    _res = device.run(circuit_for_k(_k), shots=shots).result()
    _hits_by_power[_k] = _res.measurement_counts.get("1", 0)

_grid_sched = np.linspace(0.001, 0.999, 400)


def _log_likelihood_sched(a, sched):
    _theta_a = 2 * np.arcsin(np.sqrt(a))
    _ll = 0.0
    for _k in sched:
        _h = _hits_by_power[_k]
        _p = np.sin((2 * _k + 1) * _theta_a / 2) ** 2
        _p = min(max(_p, 1e-12), 1 - 1e-12)
        _ll += _h * np.log(_p) + (shots - _h) * np.log(1 - _p)
    return _ll


errors_by_schedule = []
for _sched in schedules:
    _a_hat = _grid_sched[np.argmax([_log_likelihood_sched(a, _sched) for a in _grid_sched])]
    errors_by_schedule.append(float(abs(_a_hat - a_true)))
    print(f"schedule {_sched}: |a_hat - a_true| = {abs(_a_hat - a_true):.4f}")
""",
    3: """
shot_budget = [200, 500, 1000, 3000]
_powers_budget = [0, 1, 2, 3]
_grid_budget = np.linspace(0.001, 0.999, 400)


def _mlae_estimate(n_shots):
    _hits = []
    for _k in _powers_budget:
        _res = device.run(circuit_for_k(_k), shots=n_shots).result()
        _hits.append(_res.measurement_counts.get("1", 0))

    def _ll(a):
        _theta_a = 2 * np.arcsin(np.sqrt(a))
        _total = 0.0
        for _k, _h in zip(_powers_budget, _hits):
            _p = np.sin((2 * _k + 1) * _theta_a / 2) ** 2
            _p = min(max(_p, 1e-12), 1 - 1e-12)
            _total += _h * np.log(_p) + (n_shots - _h) * np.log(1 - _p)
        return _total

    return _grid_budget[np.argmax([_ll(a) for a in _grid_budget])]


budget_errors = [float(abs(_mlae_estimate(_s) - a_true)) for _s in shot_budget]

_queries = [_s * sum(1 + 2 * _k for _k in _powers_budget) for _s in shot_budget]
plt.figure(figsize=(7, 5))
plt.loglog(_queries, budget_errors, "o-", label="MLAE error")
plt.xlabel("total A applications (query budget N)")
plt.ylabel("|a_hat - a_true|")
plt.title("MLAE error falls as the shot budget grows")
plt.legend()
plt.grid(True, which="both", alpha=0.3)
plt.show()
print("budget_errors =", [round(e, 4) for e in budget_errors])
""",
}
