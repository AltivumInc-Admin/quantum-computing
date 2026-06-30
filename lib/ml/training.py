"""Hybrid quantum-classical training loops for QML models.

Uses PennyLane (default device ``default.qubit``; ``braket.local.qubit``
opt-in via ``device_name``) for analytic gradients — per the project's
"Use PennyLane for variational and hybrid quantum-classical algorithms"
guidance. The previous implementation used raw parameter-shift on Braket
which was O(n_samples * n_params * 2) circuit runs per epoch; this
implementation uses backprop on the local simulator.

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
    """
    import pennylane as qml
    from pennylane import numpy as pnp

    from lib.ml.classifiers import vqc_qnode

    X_train = np.asarray(X_train)
    y_train = np.asarray(y_train)
    if X_train.ndim != 2 or X_train.shape[0] == 0:
        raise ValueError(f"X_train must be a non-empty 2D array (got shape {X_train.shape})")
    if len(y_train) != len(X_train):
        raise ValueError(
            f"X_train and y_train must have the same length (got {len(X_train)} and {len(y_train)})"
        )

    n_qubits = X_train.shape[1]
    circuit = vqc_qnode(n_qubits, n_layers, device_name=device_name)

    params = pnp.array(
        np.random.uniform(-np.pi, np.pi, size=(n_layers, n_qubits)),
        requires_grad=True,
    )
    opt = qml.GradientDescentOptimizer(stepsize=learning_rate)

    n_samples = len(X_train)
    # default.qubit / lightning.qubit evaluate a whole (batch, n_qubits) array in ONE broadcast
    # pass; the braket plugin device may not broadcast, so fall back to the per-sample loop there.
    # The per-sample form also mirrors the mean-squared-error math the notebook teaches.
    batched = device_name in ("default.qubit", "lightning.qubit")

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
        params, loss_val = opt.step_and_cost(loss_fn, params)
        preds = predict_all(params)
        correct = int(pnp.sum((preds > 0.5) == (np.asarray(y_train) > 0.5)))
        loss_history.append(float(loss_val))
        accuracy_history.append(correct / n_samples)

        if epoch % 10 == 0:
            print(f"Epoch {epoch}: loss={float(loss_val):.4f}, accuracy={correct / n_samples:.2%}")

    return {
        "optimal_params": np.asarray(params),
        "loss_history": loss_history,
        "accuracy_history": accuracy_history,
    }
