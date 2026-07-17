"""Canonical solutions for 04-quantum-ml/notebooks/02-quantum-kernels.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
from functools import partial

iqp_depth_gaps = {}
for _reps in (1, 2, 3):
    _fmap = partial(iqp_encoding, reps=_reps)
    _within, _cross = class_block_means(X_train, y_train, _fmap)
    iqp_depth_gaps[_reps] = float(_within - _cross)

for _reps, _gap in iqp_depth_gaps.items():
    print(f"reps={_reps}: separation gap = {_gap:.3f}")
""",
    2: """
# Inner cluster (class 0) ringed by an outer shell (class 1), centered at (1.5, 1.5).
# The class boundary is a radius -- a feature interaction the stationary angle
# kernel is blind to, but the IQP product features can see.
X_hard = np.array([
    [1.85, 1.5], [1.5, 1.85], [1.15, 1.5], [1.5, 1.15],   # inner cluster, class 0
    [2.65, 1.5], [1.5, 2.65], [0.35, 1.5], [1.5, 0.35],   # outer ring,     class 1
])
y_hard = np.array([0, 0, 0, 0, 1, 1, 1, 1])

# Held-out points at the in-between angles, same two radii.
X_hard_test = np.array([
    [1.747, 1.747], [1.253, 1.747], [1.253, 1.253], [1.747, 1.253],   # inner, class 0
    [2.313, 2.313], [0.687, 2.313], [0.687, 0.687], [2.313, 0.687],   # ring,  class 1
])
y_hard_test = np.array([0, 0, 0, 0, 1, 1, 1, 1])

acc_iqp_hard = float(
    (predict_nearest_class_mean(X_hard_test, X_hard, y_hard, iqp_encoding) == y_hard_test).mean()
)
acc_angle_hard = float(
    (predict_nearest_class_mean(X_hard_test, X_hard, y_hard, angle_encoding) == y_hard_test).mean()
)
print(f"IQP   test accuracy = {acc_iqp_hard:.2f}")
print(f"angle test accuracy = {acc_angle_hard:.2f}")
""",
}
