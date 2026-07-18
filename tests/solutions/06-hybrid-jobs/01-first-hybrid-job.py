"""Canonical solutions for 06-hybrid-jobs/notebooks/01-first-hybrid-job.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell. Every snippet assumes the local
setup the notebook has already run: ``device``, ``param_bell``, ``Circuit``,
``FreeParameter``, ``np``, and the ``os``/``subprocess``/``sys`` imports from the
entry-point sanity-check cell. Nothing here touches AWS.
"""

SOLUTIONS = {
    1: """
theta_grid = np.linspace(0.0, np.pi, 9)
p_corr = []
for _t in theta_grid:
    _counts = dict(
        device.run(param_bell, shots=2000, inputs={"theta": float(_t)})
        .result()
        .measurement_counts
    )
    _n = sum(_counts.values())
    p_corr.append((_counts.get("00", 0) + _counts.get("11", 0)) / _n)
""",
    2: """
_zz_circuit = Circuit().rx(0, FreeParameter("theta")).cnot(0, 1)


def expval_zz(angle, shots=4000):
    _c = dict(
        device.run(_zz_circuit, shots=shots, inputs={"theta": float(angle)})
        .result()
        .measurement_counts
    )
    _n = sum(_c.values())
    return (
        _c.get("00", 0) + _c.get("11", 0) - _c.get("01", 0) - _c.get("10", 0)
    ) / _n


_angle, _lr, _eps = 0.3, 0.6, 0.1
zz_history = []
for _step in range(12):
    _grad = (expval_zz(_angle + _eps) - expval_zz(_angle - _eps)) / (2 * _eps)
    zz_history.append(expval_zz(_angle))
    _angle = _angle - _lr * _grad
""",
    3: '''
import json

_layered_entry = """
import json
import os

from braket.circuits import Circuit
from braket.devices import LocalSimulator
from braket.jobs import save_job_result


def get_device():
    arn = os.environ.get("AMZN_BRAKET_DEVICE_ARN")
    if arn and arn.startswith("arn:"):
        from braket.aws import AwsDevice

        return AwsDevice(arn)
    return LocalSimulator()


def main():
    shots = int(os.environ.get("SHOTS", "1000"))
    n_layers = int(os.environ.get("N_LAYERS", "1"))
    device = get_device()

    circuit = Circuit()
    for _ in range(n_layers):
        circuit.h(0).cnot(0, 1)
    counts = dict(device.run(circuit, shots=shots).result().measurement_counts)

    p_correlated = (counts.get("00", 0) + counts.get("11", 0)) / shots
    save_job_result({"counts": counts, "p_correlated": p_correlated, "n_layers": n_layers})
    print("RESULT " + json.dumps({"n_layers": n_layers, "counts": counts, "p_correlated": p_correlated}))


if __name__ == "__main__":
    main()
"""

with open("first_job_entry.py", "w") as _f:
    _f.write(_layered_entry)

_proc = subprocess.run(
    [sys.executable, "first_job_entry.py"],
    capture_output=True,
    text=True,
    env={**os.environ, "SHOTS": "800", "N_LAYERS": "3"},
)
assert _proc.returncode == 0, _proc.stderr
_line = next(ln for ln in reversed(_proc.stdout.splitlines()) if ln.startswith("RESULT "))
layered_result = json.loads(_line[len("RESULT ") :])
''',
    4: """
def phase_durations(events):
    durations = {}
    for (start, state), (end, _next_state) in zip(events, events[1:]):
        durations[state] = durations.get(state, 0.0) + (end - start)
    return durations
""",
}
