"""Canonical solutions for 05-quantum-chemistry/notebooks/08-hybrid-chemistry-job.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell. Names beyond the Define contract
are underscore-prefixed so they never collide with the notebook.
"""

SOLUTIONS = {
    1: """
pes_bond_lengths = np.linspace(0.4, 2.0, 12)
pes_energies = []
for _R in pes_bond_lengths:
    _theta_min, _energy_min, _hist = run_vqe(state_vector_energy, theta0=0.0, n_iters=14)
    pes_energies.append(_energy_min)
""",
    2: """
from scipy.optimize import minimize

_result = minimize(lambda x: state_vector_energy(float(x[0])), x0=[0.0], method="COBYLA")
cobyla_theta = float(_result.x[0])
cobyla_energy = float(_result.fun)
""",
    3: """
_n_jobs = 9

_sim_rate_per_min = 0.075
_sim_minutes_per_job = 3.0
sim_cost_total = _n_jobs * _sim_rate_per_min * _sim_minutes_per_job

_evals_per_job = 30
_shots_per_eval = 1000
_task_fee = 0.30
_shot_fee = 0.08
qpu_cost_total = _n_jobs * _evals_per_job * (_task_fee + _shots_per_eval * _shot_fee)
""",
    4: """
checkpoint_payload = {
    "theta": float(theta_opt),
    "step": len(history),
    "history": [[float(_t), float(_e)] for _t, _e in history],
}
""",
}
