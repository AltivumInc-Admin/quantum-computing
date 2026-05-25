"""Tests for lib/ml/training.py — local simulator only.

The slow test is gated behind ``@pytest.mark.slow``; run it with
``pytest -m slow tests/test_training.py``.

Skipped entirely when PennyLane isn't installed (it lives in [full] extras).
"""

import numpy as np
import pytest

pytest.importorskip("pennylane")

from lib.ml.training import train_vqc  # noqa: E402


def test_train_vqc_returns_required_keys():
    np.random.seed(0)
    X = np.random.uniform(-0.5, 0.5, size=(4, 2))
    y = (X[:, 0] > 0).astype(int)
    out = train_vqc(X, y, n_layers=1, epochs=2, shots=200)
    assert set(out.keys()) >= {"optimal_params", "loss_history", "accuracy_history"}
    assert len(out["loss_history"]) == 2
    assert len(out["accuracy_history"]) == 2
    assert out["optimal_params"].shape == (1, 2)


@pytest.mark.slow
def test_train_vqc_loss_decreases():
    """Training reduces loss on a linearly-separable toy dataset.

    Marked slow because, even with PennyLane analytic gradients, it still
    runs 10 epochs * 20 samples * forward+backward QNode passes. Use
    ``pytest -m slow`` to opt in.
    """
    np.random.seed(0)
    n = 20
    X = np.random.uniform(-1.0, 1.0, size=(n, 2))
    y = (X[:, 0] > 0).astype(int)
    out = train_vqc(X, y, n_layers=2, learning_rate=0.2, epochs=10)
    losses = out["loss_history"]
    # With analytic gradients we expect a non-trivial drop.
    assert losses[-1] < losses[0] - 0.01, (
        f"loss did not decrease meaningfully: "
        f"start={losses[0]:.4f}, end={losses[-1]:.4f}"
    )
