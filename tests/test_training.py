"""Tests for lib/ml/training.py — local simulator only.

Every test here runs unconditionally on the default local simulator; the whole
module is well under a second.

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


def test_train_vqc_loss_decreases():
    """Training reduces loss on a linearly-separable toy dataset.

    This is the toolkit's only end-to-end proof that train_vqc actually
    converges, so it runs unconditionally. It used to carry
    ``@pytest.mark.slow`` on a per-sample cost rationale that the broadcast
    rewrite invalidated — the QNode now evaluates the whole dataset in one
    pass and the test measures ~0.03 s. Nothing ever deselected the marker
    (no addopts, no -m filter in the Makefile or CI), so the marker only
    invited a future ``-m "not slow"`` to silently drop this check.
    """
    np.random.seed(0)
    n = 20
    X = np.random.uniform(-1.0, 1.0, size=(n, 2))
    y = (X[:, 0] > 0).astype(int)
    out = train_vqc(X, y, n_layers=2, learning_rate=0.2, epochs=10)
    losses = out["loss_history"]
    # With analytic gradients we expect a non-trivial drop.
    assert losses[-1] < losses[0] - 0.01, (
        f"loss did not decrease meaningfully: start={losses[0]:.4f}, end={losses[-1]:.4f}"
    )


def test_train_vqc_final_loss_belongs_to_the_returned_params():
    """The last loss_history entry must be the loss of the params actually returned.

    step_and_cost hands back the objective at the params BEFORE the step, so recording it put
    loss_history one gradient step out of phase with accuracy_history and meant the reported
    final loss described a model the caller never receives. Rebuild the QNode at the returned
    optimal_params and recompute the MSE to close the loop on real behavior — neither the
    key-presence test nor the monotonicity test above can see this.
    """
    from lib.ml.classifiers import vqc_qnode

    np.random.seed(0)
    X = np.random.uniform(-1.0, 1.0, size=(12, 2))
    y = (X[:, 0] > 0).astype(int)
    out = train_vqc(X, y, n_layers=2, learning_rate=0.3, epochs=6)

    qnode = vqc_qnode(2, 2)
    preds = (1.0 - np.asarray(qnode(X, out["optimal_params"]))) / 2.0
    assert np.isclose(out["loss_history"][-1], float(np.mean((preds - y) ** 2)), atol=1e-9)
    # ...and accuracy_history[-1] describes those same params, so the two series are in phase.
    assert np.isclose(out["accuracy_history"][-1], float(np.mean((preds > 0.5) == (y > 0.5))))


def test_train_vqc_rejects_pm1_labels():
    # (1 - <Z>)/2 is bounded to [0, 1], so a -1 target is unreachable: the model saturates and
    # loss_history becomes a plausible-looking but meaningless series, while accuracy_history
    # still looks right because (preds > 0.5) == (y > 0.5) buckets -1/+1 correctly.
    np.random.seed(0)
    X = np.random.uniform(-1.0, 1.0, size=(6, 2))
    y = np.where(X[:, 0] > 0, 1, -1)
    with pytest.raises(ValueError, match="only 0/1 labels"):
        train_vqc(X, y, n_layers=1, epochs=1)


def test_train_vqc_rejects_length_mismatch():
    # zip() would silently truncate to the shorter sequence and divide by the larger denominator.
    with pytest.raises(ValueError, match="same length"):
        train_vqc(np.zeros((4, 2)), np.zeros(3), n_layers=1, epochs=1)


def test_train_vqc_rejects_empty_or_1d():
    with pytest.raises(ValueError, match="non-empty 2D"):
        train_vqc(np.zeros((0, 2)), np.zeros(0), n_layers=1, epochs=1)
    with pytest.raises(ValueError, match="non-empty 2D"):
        train_vqc(np.zeros(4), np.zeros(4), n_layers=1, epochs=1)
