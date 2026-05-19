"""Production QML training job for Braket Hybrid Jobs."""

import os
import json
import numpy as np
from braket.jobs import save_job_result, save_job_checkpoint, load_job_checkpoint
from braket.jobs.metrics import log_metric


def main():
    hp = json.loads(os.environ.get("AMZN_BRAKET_HP", "{}"))
    n_layers = int(hp.get("n_layers", "3"))
    epochs = int(hp.get("epochs", "50"))
    learning_rate = float(hp.get("learning_rate", "0.1"))
    shots = int(hp.get("n_shots", "1000"))

    # Load training data
    input_dir = os.environ.get("AMZN_BRAKET_INPUT_DIR", "")
    data_file = os.path.join(input_dir, "training_data.npz") if input_dir else None

    if data_file and os.path.exists(data_file):
        data = np.load(data_file)
        X_train, y_train = data["X"], data["y"]
    else:
        # Generate toy dataset (moons)
        from sklearn.datasets import make_moons
        X_train, y_train = make_moons(n_samples=100, noise=0.1, random_state=42)
        # Normalize to [0, pi]
        X_train = (X_train - X_train.min(axis=0)) / (X_train.max(axis=0) - X_train.min(axis=0)) * np.pi

    n_qubits = X_train.shape[1]

    # Check for checkpoint
    checkpoint = load_job_checkpoint()
    if checkpoint:
        params = np.array(checkpoint["params"])
        start_epoch = checkpoint["epoch"]
    else:
        params = np.random.uniform(-np.pi, np.pi, size=(n_layers, n_qubits))
        start_epoch = 0

    from braket.devices import LocalSimulator
    device = LocalSimulator()

    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
    from scripts.classifiers import build_vqc_circuit

    for epoch in range(start_epoch, epochs):
        epoch_loss = 0.0
        correct = 0
        gradients = np.zeros_like(params)

        for x, y in zip(X_train, y_train):
            circuit = build_vqc_circuit(n_qubits, n_layers, x, params)
            result = device.run(circuit, shots=shots).result()
            prob_zero = result.measurement_counts.get("0" * n_qubits, 0) / shots
            prediction = 1.0 - prob_zero

            loss = (prediction - y) ** 2
            epoch_loss += loss
            correct += int((prediction > 0.5) == y)

        avg_loss = epoch_loss / len(X_train)
        accuracy = correct / len(X_train)

        log_metric(metric_name="loss", value=float(avg_loss), iteration_number=epoch)
        log_metric(metric_name="accuracy", value=accuracy, iteration_number=epoch)

        # Save checkpoint every 10 epochs
        if epoch % 10 == 0:
            save_job_checkpoint({"params": params.tolist(), "epoch": epoch})

        # Simple gradient update (finite differences for speed)
        eps = 0.01
        for layer in range(n_layers):
            for q in range(n_qubits):
                params[layer, q] += eps
                loss_plus = sum(
                    (1.0 - device.run(build_vqc_circuit(n_qubits, n_layers, x, params), shots=shots)
                     .result().measurement_counts.get("0" * n_qubits, 0) / shots - y) ** 2
                    for x, y in zip(X_train[:10], y_train[:10])
                ) / 10
                params[layer, q] -= 2 * eps
                loss_minus = sum(
                    (1.0 - device.run(build_vqc_circuit(n_qubits, n_layers, x, params), shots=shots)
                     .result().measurement_counts.get("0" * n_qubits, 0) / shots - y) ** 2
                    for x, y in zip(X_train[:10], y_train[:10])
                ) / 10
                params[layer, q] += eps
                gradients[layer, q] = (loss_plus - loss_minus) / (2 * eps)

        params -= learning_rate * gradients

    save_job_result({
        "optimal_params": params.tolist(),
        "final_loss": float(avg_loss),
        "final_accuracy": float(accuracy),
        "epochs_completed": epochs,
    })


if __name__ == "__main__":
    main()
