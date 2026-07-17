"""Canonical solutions for 04-quantum-ml/notebooks/04-pennylane-braket.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
@qml.qnode(dev_train, interface="autograd", diff_method="backprop")
def qnode_reupload(features, params):
    for i in range(n_qubits):
        qml.RY(features[i], wires=i)
    for layer in range(n_layers):
        for i in range(n_qubits):
            qml.RY(params[layer, i], wires=i)
        qml.CNOT(wires=[0, 1])
        for i in range(n_qubits):
            qml.RY(features[i], wires=i)  # data re-uploading
    return qml.expval(qml.PauliZ(0))


def _predict_ru(features, p):
    return (1.0 - qnode_reupload(features, p)) / 2.0


def _loss_ru(p):
    _total = 0.0
    for _xi, _yi in zip(X, y):
        _total = _total + (_predict_ru(_xi, p) - _yi) ** 2
    return _total / len(X)


_params_ru = pnp.array(
    np.random.uniform(-0.1, 0.1, size=(n_layers, n_qubits)), requires_grad=True
)
_opt_ru = qml.AdamOptimizer(stepsize=0.2)
reupload_loss_history = []
for _epoch in range(20):
    _params_ru, _cost = _opt_ru.step_and_cost(_loss_ru, _params_ru)
    reupload_loss_history.append(float(_cost))
""",
    2: """
_init = np.random.uniform(-0.1, 0.1, size=(n_layers, n_qubits))

_opt_adam = qml.AdamOptimizer(stepsize=0.2)
_p_adam = pnp.array(_init, requires_grad=True)
adam_losses = []
for _epoch in range(20):
    _p_adam, _cost = _opt_adam.step_and_cost(loss_fn, _p_adam)
    adam_losses.append(float(_cost))

_opt_gd = qml.GradientDescentOptimizer(stepsize=0.2)
_p_gd = pnp.array(_init, requires_grad=True)
gd_losses = []
for _epoch in range(20):
    _p_gd, _cost = _opt_gd.step_and_cost(loss_fn, _p_gd)
    gd_losses.append(float(_cost))
""",
}
