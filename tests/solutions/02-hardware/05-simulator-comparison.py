"""Canonical solutions for 02-hardware/notebooks/05-simulator-comparison.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
ghz5 = Circuit().h(0)
for _q in range(4):
    ghz5 = ghz5.cnot(_q, _q + 1)
ghz5_counts = device.run(ghz5, shots=1000).result().measurement_counts
print(dict(ghz5_counts))
""",
    2: """
_n_circuits = 40
_seconds_each = 3
sv1_minutes = _n_circuits * _seconds_each / 60
sv1_cost = sv1_minutes * 0.075
print(f"Estimated SV1 cost: ${sv1_cost:.4f} for {sv1_minutes:.1f} minutes of compute")
""",
    3: """
p_sweep = [0.0, 0.1, 0.2, 0.4]
coherence_sweep = []
for _p in p_sweep:
    _rho_p = (1 - _p) * rho_ideal + _p * np.eye(dim) / dim
    coherence_sweep.append(_rho_p[0, 7].real)

plt.plot(p_sweep, coherence_sweep, "o-")
plt.xlabel("depolarizing strength p")
plt.ylabel("coherence rho[000,111]")
plt.show()
""",
}
