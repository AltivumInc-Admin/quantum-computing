"""Canonical solutions for 06-hybrid-jobs/notebooks/06-pennylane-jobs.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
np.random.seed(21)
_weights = pnp.array(0.3 * np.random.randn(*layer_shape), requires_grad=True)
_bias = pnp.array(0.0, requires_grad=True)


def _biased_cost(weights, bias):
    _preds = pnp.stack([circuit(weights, x) + bias for x in X])
    return pnp.mean((_preds - Y) ** 2)


_bias_opt = qml.AdamOptimizer(stepsize=0.2)
bias_history = [float(_biased_cost(_weights, _bias))]
for _ in range(30):
    (_weights, _bias), _step_cost = _bias_opt.step_and_cost(_biased_cost, _weights, _bias)
    bias_history.append(float(_step_cost))
bias_val = float(_bias)
""",
    2: """
np.random.seed(11)
_init = pnp.array(0.3 * np.random.randn(*layer_shape), requires_grad=True)


def _mse(weights):
    _preds = pnp.stack([circuit(weights, x) for x in X])
    return pnp.mean((_preds - Y) ** 2)


_p = _init.copy()
_gd = qml.GradientDescentOptimizer(stepsize=0.4)
gd_history = [float(_mse(_p))]
for _ in range(30):
    _p, _c = _gd.step_and_cost(_mse, _p)
    gd_history.append(float(_c))

_p = _init.copy()
_adam = qml.AdamOptimizer(stepsize=0.2)
adam_history = [float(_mse(_p))]
for _ in range(30):
    _p, _c = _adam.step_and_cost(_mse, _p)
    adam_history.append(float(_c))
""",
    3: """
np.random.seed(3)
_deep_shape = qml.StronglyEntanglingLayers.shape(n_layers=3, n_wires=n_qubits)
_deep = pnp.array(0.3 * np.random.randn(*_deep_shape), requires_grad=True)


def _deep_cost(weights):
    _preds = pnp.stack([circuit(weights, x) for x in X])
    return pnp.mean((_preds - Y) ** 2)


_deep_opt = qml.AdamOptimizer(stepsize=0.2)
for _ in range(40):
    _deep, _c = _deep_opt.step_and_cost(_deep_cost, _deep)
deep_params = np.array(_deep)
deep_final_cost = float(_deep_cost(_deep))
""",
    4: """
stopped_entry_point = ENTRY_POINT.replace(
    "iteration_number=step)",
    "iteration_number=step)\\n        if float(cost) < 0.01:\\n            break",
)
""",
}
