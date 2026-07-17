"""Canonical solutions for 01-foundations/notebooks/03-multi-qubit-gates.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
phi_minus = Circuit().h(0).z(0).cnot(0, 1)
phi_minus_counts = parse_counts(device.run(phi_minus, shots=2000).result())
print(phi_minus_counts)
""",
    2: """
and_results = {}
for _a, _b in [(0, 0), (0, 1), (1, 0), (1, 1)]:
    _circuit = Circuit()
    if _a:
        _circuit.x(0)
    if _b:
        _circuit.x(1)
    _circuit.ccnot(0, 1, 2)
    _counts = parse_counts(device.run(_circuit, shots=100).result())
    _outcome = max(_counts, key=_counts.get)
    and_results[(_a, _b)] = int(_outcome[2])
print(and_results)
""",
}
