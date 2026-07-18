"""Canonical solutions for 01-foundations/notebooks/02-single-qubit-gates.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
_minus_circuit = Circuit().h(0).z(0)
minus_probs = measure_probabilities(_minus_circuit)
back_probs = measure_probabilities(Circuit().h(0).z(0).h(0))
print(f"|->:  P(|0>) = {minus_probs[0]:.3f}, P(|1>) = {minus_probs[1]:.3f}")
print(f"H|->: P(|0>) = {back_probs[0]:.3f}, P(|1>) = {back_probs[1]:.3f}")
""",
    2: """
theta_75 = 2 * np.arccos(np.sqrt(0.75))
p0_75, _p1_75 = measure_probabilities(Circuit().ry(0, theta_75), shots=10000)
print(f"theta_75 = {theta_75:.4f} rad, measured P(|0>) = {p0_75:.3f} (target 0.750)")
""",
    3: """
rx_pi_probs = measure_probabilities(Circuit().rx(0, np.pi))
x_probs = measure_probabilities(Circuit().x(0))
print(f"Rx(pi)|0>: P(|0>) = {rx_pi_probs[0]:.3f}, P(|1>) = {rx_pi_probs[1]:.3f}")
print(f"X|0>:      P(|0>) = {x_probs[0]:.3f}, P(|1>) = {x_probs[1]:.3f}")
""",
}
