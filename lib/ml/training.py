"""Hybrid quantum-classical training loops for QML models."""

import numpy as np
from braket.devices import LocalSimulator


def train_vqc(X_train: np.ndarray, y_train: np.ndarray, n_layers: int = 3,
              learning_rate: float = 0.1, epochs: int = 50,
              shots: int = 1000) -> dict:
    """Train a Variational Quantum Classifier with parameter-shift gradients.

    Args:
        X_train: Training features, shape (n_samples, n_features).
        y_train: Training labels (0 or 1), shape (n_samples,).
        n_layers: Number of variational layers.
        learning_rate: Gradient descent step size.
        epochs: Number of training epochs.
        shots: Measurement shots per circuit evaluation.

    Returns:
        Dict with optimal_params, loss_history, accuracy_history.
    """
    from lib.ml.classifiers import build_vqc_circuit

    n_qubits = X_train.shape[1]
    params = np.random.uniform(-np.pi, np.pi, size=(n_layers, n_qubits))
    device = LocalSimulator()

    loss_history = []
    accuracy_history = []

    for epoch in range(epochs):
        epoch_loss = 0.0
        correct = 0
        gradients = np.zeros_like(params)

        for x, y in zip(X_train, y_train):
            # Forward pass
            circuit = build_vqc_circuit(n_qubits, n_layers, x, params)
            result = device.run(circuit, shots=shots).result()
            counts = result.measurement_counts
            prob_zero = counts.get("0" * n_qubits, 0) / shots
            prediction = 1.0 - prob_zero  # Map to [0, 1]

            # Loss (MSE)
            loss = (prediction - y) ** 2
            epoch_loss += loss
            correct += int((prediction > 0.5) == y)

            # Parameter-shift gradients
            for layer in range(n_layers):
                for q in range(n_qubits):
                    params_plus = params.copy()
                    params_plus[layer, q] += np.pi / 2
                    circuit_plus = build_vqc_circuit(n_qubits, n_layers, x, params_plus)
                    result_plus = device.run(circuit_plus, shots=shots).result()
                    prob_plus = 1.0 - result_plus.measurement_counts.get("0" * n_qubits, 0) / shots

                    params_minus = params.copy()
                    params_minus[layer, q] -= np.pi / 2
                    circuit_minus = build_vqc_circuit(n_qubits, n_layers, x, params_minus)
                    result_minus = device.run(circuit_minus, shots=shots).result()
                    prob_minus = 1.0 - result_minus.measurement_counts.get("0" * n_qubits, 0) / shots

                    grad = (prob_plus - prob_minus) / 2
                    gradients[layer, q] += 2 * (prediction - y) * grad

        # Update parameters
        params -= learning_rate * gradients / len(X_train)

        avg_loss = epoch_loss / len(X_train)
        accuracy = correct / len(X_train)
        loss_history.append(avg_loss)
        accuracy_history.append(accuracy)

        if epoch % 10 == 0:
            print(f"Epoch {epoch}: loss={avg_loss:.4f}, accuracy={accuracy:.2%}")

    return {
        "optimal_params": params,
        "loss_history": loss_history,
        "accuracy_history": accuracy_history,
    }
