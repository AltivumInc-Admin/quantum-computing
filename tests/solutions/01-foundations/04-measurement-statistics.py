"""Canonical solutions for 01-foundations/notebooks/04-measurement-statistics.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
_p = 0.25
_target_error = 0.01
min_shots = int(np.ceil(1.96**2 * _p * (1 - _p) / _target_error**2))
print(f"Minimum shots needed: {min_shots}")
""",
    2: """
_circuit = Circuit().ry(0, np.pi / 3)
_result = device.run(_circuit, shots=1000).result()
pi3_counts = parse_counts(_result)
z_pi3 = expectation_from_counts(pi3_counts, z_observable)
print(f"Measured <Z> = {z_pi3:.4f}, Theory = 0.5000")
""",
}
