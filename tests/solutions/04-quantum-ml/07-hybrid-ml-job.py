"""Canonical solutions for 04-quantum-ml/notebooks/07-hybrid-ml-job.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
lr_histories = {}
for _lr in (0.1, 0.5, 1.0):
    np.random.seed(7)  # same random init each run so the comparison is about lr alone
    _hist, _ = train(X, Y, steps=20, lr=_lr, shots=2000)
    lr_histories[_lr] = _hist
""",
    2: """
def train_resumable(X, Y, steps, lr, shots, resume_from=None):
    if resume_from is None:
        np.random.seed(7)
        params = np.random.uniform(0, 2 * np.pi, size=4)
        start = 0
    else:
        params = np.array(resume_from["params"])
        start = int(resume_from["step"])
    for _t in range(start, start + steps):
        params = params - lr * param_shift_grad(X, Y, params, device, shots)
    return {"params": params.tolist(), "step": start + steps}


checkpoint_state = train_resumable(X, Y, steps=4, lr=0.5, shots=2000)
resumed_state = train_resumable(X, Y, steps=4, lr=0.5, shots=2000, resume_from=checkpoint_state)
""",
}
