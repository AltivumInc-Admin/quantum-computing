"""Canonical solutions for 04-quantum-ml/notebooks/03-variational-classifier.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
# Pull the two blobs closer together so the classes overlap more.
_hc = 0.4
_hard_c0 = np.array([-_hc, -_hc])
_hard_c1 = np.array([_hc, _hc])
_hard_spread = 0.45
_HX0 = _hard_c0 + _hard_spread * np.random.randn(n_per_class, 2)
_HX1 = _hard_c1 + _hard_spread * np.random.randn(n_per_class, 2)
hard_X = np.vstack([_HX0, _HX1])
hard_y = np.array([0] * n_per_class + [1] * n_per_class)

# bce_loss / loss_gradient read the module-level X and y, so point those at the
# harder data, retrain from params0, and restore the originals afterwards.
_orig_X, _orig_y = X, y
X, y = hard_X, hard_y
_hp = params0.copy()
hard_loss_history = [bce_loss(_hp)]
for _e in range(epochs):
    _hp = _hp - lr * loss_gradient(_hp)
    hard_loss_history.append(bce_loss(_hp))
hard_loss_history = np.array(hard_loss_history)
X, y = _orig_X, _orig_y
""",
    2: """
def mse_loss(params):
    total = 0.0
    for f, t in zip(X, y):
        total += (predict_proba(f, params) - t) ** 2
    return total / len(X)


def mse_grad(params):
    grad = np.zeros_like(params)
    for layer in range(params.shape[0]):
        for qubit in range(params.shape[1]):
            g = 0.0
            for f, t in zip(X, y):
                p = predict_proba(f, params)
                dL_dp = 2.0 * (p - t) / len(X)     # d(MSE)/dp
                dp_dz0 = -0.5                        # p = (1 - <Z_0>)/2
                dz0 = param_shift_dz0(f, params, layer, qubit)
                g += dL_dp * dp_dz0 * dz0
            grad[layer, qubit] = g
    return grad


_mp = params0.copy()
mse_loss_history = [mse_loss(_mp)]
for _e in range(epochs):
    _mp = _mp - lr * mse_grad(_mp)
    mse_loss_history.append(mse_loss(_mp))
mse_loss_history = np.array(mse_loss_history)
""",
}
