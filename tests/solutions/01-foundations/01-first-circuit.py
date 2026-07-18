"""Canonical solutions for 01-foundations/notebooks/01-first-circuit.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
ghz5 = ghz_state(n_qubits=5)
ghz5_result = device.run(ghz5, shots=2000).result()
ghz5_counts = parse_counts(ghz5_result)
print(ghz5_counts)
""",
    2: """
shot_series = [10, 50, 100, 500, 5000]
p0_series = []
for _shots in shot_series:
    _circuit = Circuit().h(0)
    _counts = parse_counts(device.run(_circuit, shots=_shots).result())
    p0_series.append(_counts.get("0", 0) / _shots)

plt.plot(shot_series, p0_series, "o-")
plt.axhline(y=0.5, color="r", linestyle="--", label="theoretical")
plt.xscale("log")
plt.xlabel("Shots")
plt.ylabel("P(|0>)")
plt.legend()
plt.show()
""",
}
