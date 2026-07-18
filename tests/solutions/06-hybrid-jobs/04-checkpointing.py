"""Canonical solutions for 06-hybrid-jobs/notebooks/04-checkpointing.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
_MOMENTUM = 0.8
_MOM_LR = 0.3


def _momentum_run(n_iters, fail_at=None, ckpt=None):
    if ckpt is not None and os.path.exists(ckpt):
        with open(ckpt) as _f:
            _d = json.load(_f)
        _start = _d["iteration"] + 1
        _p = np.array(_d["params"])
        _v = np.array(_d["velocity"])
    else:
        _start, _p, _v = 0, INITIAL_PARAMS.copy(), np.zeros(2)
    for _it in range(_start, n_iters):
        _v = _MOMENTUM * _v - _MOM_LR * fd_gradient(_p)
        _p = _p + _v
        if ckpt is not None and _it % CHECKPOINT_EVERY == 0:
            with open(ckpt, "w") as _f:
                json.dump({"iteration": _it, "params": _p.tolist(), "velocity": _v.tolist()}, _f)
        if fail_at is not None and _it == fail_at:
            with open(ckpt, "w") as _f:
                json.dump({"iteration": _it, "params": _p.tolist(), "velocity": _v.tolist()}, _f)
            raise SimulatedFailure(f"instance reclaimed at iteration {_it}")
    return _p


momentum_ref_params = _momentum_run(N_ITERS)

_mom_ckpt = os.path.join(tempfile.mkdtemp(prefix="mom_ckpt_"), "checkpoint.json")
try:
    _momentum_run(N_ITERS, fail_at=12, ckpt=_mom_ckpt)
except SimulatedFailure:
    pass
momentum_resumed_params = _momentum_run(N_ITERS, ckpt=_mom_ckpt)
""",
    2: """
if os.path.exists(CKPT_PATH):
    os.remove(CKPT_PATH)

try:
    run_recoverable(N_ITERS, fail_at=8)
except SimulatedFailure:
    pass
try:
    run_recoverable(N_ITERS, fail_at=15)
except SimulatedFailure:
    pass
twofail_params, _twofail_best = run_recoverable(N_ITERS)
""",
    3: """
def _save_checkpoint_atomic(path, data):
    _tmp = path + ".tmp"
    with open(_tmp, "w") as _f:
        json.dump(data, _f)
    os.replace(_tmp, path)


atomic_ckpt = os.path.join(tempfile.mkdtemp(prefix="atomic_ckpt_"), "checkpoint.json")

# 1. Persist a known-good checkpoint atomically.
_save_checkpoint_atomic(
    atomic_ckpt, {"iteration": 9, "params": ref_params.tolist(), "best_cut": ref_final_cut}
)

# 2. Simulate a crash mid-write: partial bytes land in the .tmp file, and the
#    live file is never replaced -- so it stays the last good checkpoint.
with open(atomic_ckpt + ".tmp", "w") as _f:
    _f.write('{"iteration": 14, "par')

# 3. The live checkpoint still parses cleanly.
with open(atomic_ckpt) as _f:
    recovered_state = json.load(_f)
""",
    4: """
_mc_trials = 4000
_mc_totals = []
for _k in intervals:
    _fails = rng.integers(0, n, size=_mc_trials)
    _wasted = (_fails % _k) * iter_cost
    _io = np.ceil(n / _k) * ckpt_io_cost
    _mc_totals.append(_wasted.mean() + _io)
mc_overhead = np.array(_mc_totals)
mc_best = int(intervals[int(np.argmin(mc_overhead))])
""",
}
