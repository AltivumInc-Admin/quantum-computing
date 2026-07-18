"""Canonical solutions for 02-hardware/notebooks/03-iqm-exploration.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
logical_b = Circuit()
logical_b.h(1)
logical_b.cnot(1, 4)
span(logical_b, CHAIN)

routed_b = Circuit()
routed_b.h(1)
route_cnot_linear(routed_b, 1, 4)
span(routed_b, CHAIN)

assert np.allclose(statevector(logical_b), statevector(routed_b))
swaps_b = sum(1 for _ins in routed_b.instructions if _ins.operator.name == "Swap")
print("SWAPs the router inserted:", swaps_b)
""",
    2: """
def route_cnot_leave(circ, control, target):
    if control == target:
        raise ValueError("control and target must differ")
    step = 1 if target > control else -1
    pos = control
    while abs(pos - target) > 1:
        circ.swap(pos, pos + step)
        pos += step
    circ.cnot(pos, target)
    return pos


leave_circuit = Circuit()
leave_circuit.h(0)
leave_pos = route_cnot_leave(leave_circuit, 0, 4)
span(leave_circuit, CHAIN)
print(
    "control ended at physical qubit",
    leave_pos,
    "with",
    two_qubit_gate_count(leave_circuit),
    "two-qubit gates",
)
""",
}
