"""Canonical solutions for 01-foundations/notebooks/05-circuit-composition.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
_qft4 = qft_circuit(n_qubits=4)
_qft4_result = device.run(_qft4, shots=16000).result()
qft4_counts = parse_counts(_qft4_result)

_fig = plot_histogram(qft4_counts, title="4-qubit QFT|0000>")
plt.show()
""",
    2: """
def entanglement_ring(n_qubits):
    circuit = Circuit()
    circuit.h(0)
    for i in range(n_qubits):
        circuit.cnot(i, (i + 1) % n_qubits)
    return circuit


_ring4 = entanglement_ring(4)
print(_ring4)
_ring4_result = device.run(_ring4, shots=2000).result()
ring4_counts = parse_counts(_ring4_result)

_fig = plot_histogram(ring4_counts, title="4-Qubit Entanglement Ring")
plt.show()
""",
}
