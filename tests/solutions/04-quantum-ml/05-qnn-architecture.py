"""Canonical solutions for 04-quantum-ml/notebooks/05-qnn-architecture.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
n_layers_grid = [1, 2, 3]


def _hw_efficient_L(params, n_layers):
    c = Circuit()
    for layer in range(n_layers):
        for q in range(N_QUBITS):
            c.ry(q, params[layer, q, 0])
            c.rz(q, params[layer, q, 1])
        for q in range(N_QUBITS - 1):
            c.cnot(q, q + 1)
    c.i(N_QUBITS - 1)
    return c


def _se_L(params, n_layers):
    c = Circuit()
    for layer in range(n_layers):
        for q in range(N_QUBITS):
            c.rx(q, params[layer, q, 0])
            c.ry(q, params[layer, q, 1])
            c.rz(q, params[layer, q, 2])
        stride = layer + 1
        for q in range(N_QUBITS):
            c.cnot(q, (q + stride) % N_QUBITS)
    c.i(N_QUBITS - 1)
    return c


q_hw_by_depth = []
q_se_by_depth = []
for _L in n_layers_grid:
    np.random.seed(0)
    _p2 = np.random.uniform(0, 2 * np.pi, size=(N_SAMPLES, _L, N_QUBITS, 2))
    _p3 = np.random.uniform(0, 2 * np.pi, size=(N_SAMPLES, _L, N_QUBITS, 3))
    q_hw_by_depth.append(
        np.mean([meyer_wallach(state_vector_of(_hw_efficient_L(p, _L)), N_QUBITS) for p in _p2])
    )
    q_se_by_depth.append(
        np.mean([meyer_wallach(state_vector_of(_se_L(p, _L)), N_QUBITS) for p in _p3])
    )

print("depths          :", n_layers_grid)
print("hardware-eff Q  :", [round(float(x), 4) for x in q_hw_by_depth])
print("strongly-ent Q  :", [round(float(x), 4) for x in q_se_by_depth])
""",
    2: """
def all_to_all_circuit(params):
    c = Circuit()
    for layer in range(N_LAYERS):
        for q in range(N_QUBITS):
            c.ry(q, params[layer, q, 0])
            c.rz(q, params[layer, q, 1])
        for i in range(N_QUBITS):
            for j in range(i + 1, N_QUBITS):
                c.cnot(i, j)
    c.i(N_QUBITS - 1)
    return c


q_all_to_all = average_Q(all_to_all_circuit, params_2)

print(f"all-to-all   avg Q = {q_all_to_all.mean():.4f}")
print(f"strongly-ent avg Q = {q_strong.mean():.4f}  (ring, for comparison)")
""",
}
