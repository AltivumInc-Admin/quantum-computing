"""Hybrid quantum-classical training loops for QML models.

Uses PennyLane (default device ``default.qubit``; ``braket.local.qubit``
opt-in via ``device_name``) for analytic gradients — per the project's
"Use PennyLane for variational and hybrid quantum-classical algorithms"
guidance. The previous implementation used raw parameter-shift on Braket
which was O(n_samples * n_params * 2) circuit runs per epoch.

That cost is eliminated ONLY on the default device: ``diff_method="best"``
resolves per device, so this loop trains with backprop on ``default.qubit``
(one circuit execution per gradient), adjoint differentiation on
``lightning.qubit``, and still parameter-shift on ``braket.local.qubit``
(``2 * n_params + 1`` executions per gradient). Choosing the documented
``device_name="braket.local.qubit"`` route therefore keeps the old order of
cost — see :func:`lib.ml.classifiers.vqc_qnode` for the measured numbers.

The ``shots`` argument is preserved for API compatibility but ignored on
the local simulator — analytic expectation values are used. Pass through
a different entrypoint when targeting QPU hardware.
"""

import numpy as np


def train_vqc(
    X_train: np.ndarray,
    y_train: np.ndarray,
    n_layers: int = 3,
    learning_rate: float = 0.1,
    epochs: int = 50,
    shots: int = 1000,  # noqa: ARG001  (accepted for API compatibility; analytic)
    device_name: str = "default.qubit",
) -> dict:
    """Train a Variational Quantum Classifier with PennyLane analytic gradients.

    Args:
        X_train: Training features, shape ``(n_samples, n_features)``.
        y_train: Training labels (0 or 1), shape ``(n_samples,)``.
        n_layers: Number of variational layers.
        learning_rate: Gradient descent step size.
        epochs: Number of training epochs.
        shots: Accepted for backward compatibility. Ignored — analytic
            expectation values are used on the local simulator.
        device_name: PennyLane device. Defaults to ``"default.qubit"`` for
            the fastest local backprop. Pass ``"braket.local.qubit"`` to
            route through the Amazon Braket simulator (slower for tiny
            circuits). See :func:`lib.ml.classifiers.vqc_qnode`.

    Returns:
        Dict with ``optimal_params`` (numpy array, shape ``(n_layers, n_qubits)``),
        ``loss_history`` (list[float]), ``accuracy_history`` (list[float]).

        Both histories have one entry per epoch and are evaluated at the SAME
        parameters — those *after* that epoch's gradient step. So
        ``loss_history[-1]`` and ``accuracy_history[-1]`` both describe the
        returned ``optimal_params``, and the two series can be plotted against
        one epoch axis.

        ``loss_history`` is the mean squared error between the predicted
        ``P(|1>)`` on qubit 0 and the 0/1 label; ``accuracy_history`` is
        training-set accuracy thresholded at 0.5.

    Raises:
        ImportError: if ``pennylane`` is not installed (it lives in the ``[full]``
            extras), or if ``amazon-braket-pennylane-plugin`` is missing when
            ``device_name="braket.local.qubit"`` is requested.
        ValueError: if ``X_train`` is not a non-empty 2D array, ``y_train``
            length does not match ``X_train``, or ``y_train`` holds values
            other than 0 and 1.
    """
    import pennylane as qml
    from pennylane import numpy as pnp

    from lib.ml.classifiers import _BROADCASTING_QML_DEVICES, vqc_qnode

    X_train = np.asarray(X_train)
    y_train = np.asarray(y_train)
    if X_train.ndim != 2 or X_train.shape[0] == 0:
        raise ValueError(f"X_train must be a non-empty 2D array (got shape {X_train.shape})")
    if len(y_train) != len(X_train):
        raise ValueError(
            f"X_train and y_train must have the same length (got {len(X_train)} and {len(y_train)})"
        )
    # predict_all returns (1 - <Z>)/2, which is bounded to [0, 1], so any label outside that range
    # is an unreachable regression target: the model saturates and the reported loss is a
    # meaningless number in the same units as a valid run. The -1/+1 convention (Havlicek et al.,
    # and PennyLane's own variational-classifier tutorial) is the likeliest learner import, so name
    # it in the message rather than only rejecting.
    if not np.all(np.isin(y_train, (0, 1))):
        raise ValueError(
            f"y_train must contain only 0/1 labels (got values {np.unique(y_train)}). "
            "If you have -1/+1 labels, convert with (y + 1) // 2 — this loss measures the "
            "squared error against P(|1>) on qubit 0, which cannot reach -1."
        )

    n_qubits = X_train.shape[1]
    circuit = vqc_qnode(n_qubits, n_layers, device_name=device_name)

    params = pnp.array(
        np.random.uniform(-np.pi, np.pi, size=(n_layers, n_qubits)),
        requires_grad=True,
    )
    opt = qml.GradientDescentOptimizer(stepsize=learning_rate)

    n_samples = len(X_train)
    # Which devices evaluate a whole (batch, n_qubits) array in ONE broadcast pass is a device
    # fact, so it is single-sourced next to the allowlist in classifiers.py rather than restated
    # here. The per-sample fallback also mirrors the mean-squared-error math the notebook teaches.
    batched = device_name in _BROADCASTING_QML_DEVICES

    def predict_all(p):
        # <Z> ∈ [-1, 1] → probability ∈ [0, 1], for every sample.
        if batched:
            return (1.0 - circuit(X_train, p)) / 2.0  # shape (n_samples,)
        return pnp.stack([(1.0 - circuit(x, p)) / 2.0 for x in X_train])

    def loss_fn(p):
        return pnp.mean((predict_all(p) - y_train) ** 2)

    loss_history: list[float] = []
    accuracy_history: list[float] = []

    for epoch in range(epochs):
        # Deliberately opt.step, not opt.step_and_cost: step_and_cost returns the objective at the
        # params BEFORE the step, so recording it would leave loss_history one gradient step out of
        # phase with accuracy_history (which is measured after) and would mean the final reported
        # loss never belongs to the params actually returned. Recomputing the loss from `preds`
        # costs nothing extra — that forward pass is already spent on the accuracy metric.
        params = opt.step(loss_fn, params)
        preds = predict_all(params)
        loss_val = float(pnp.mean((preds - y_train) ** 2))
        correct = int(pnp.sum((preds > 0.5) == (y_train > 0.5)))
        loss_history.append(loss_val)
        accuracy_history.append(correct / n_samples)

        if epoch % 10 == 0:
            print(f"Epoch {epoch}: loss={loss_val:.4f}, accuracy={correct / n_samples:.2%}")

    return {
        "optimal_params": np.asarray(params),
        "loss_history": loss_history,
        "accuracy_history": accuracy_history,
    }
