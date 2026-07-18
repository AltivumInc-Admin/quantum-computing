"""Canonical solutions for 06-hybrid-jobs/notebooks/07-production-patterns.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell.
"""

SOLUTIONS = {
    1: """
def estimate_sim_minute_cost(rate_per_min, runtime_min, instance_rate_per_hr):
    instance_cost = instance_rate_per_hr * (runtime_min / 60.0)
    quantum_cost = rate_per_min * runtime_min
    return {
        "instance_cost": round(instance_cost, 4),
        "quantum_cost": round(quantum_cost, 4),
        "total": round(instance_cost + quantum_cost, 4),
    }
""",
    2: """
import random


def retry_with_jitter(max_attempts=5, base_delay=0.01, backoff=2.0,
                      exceptions=(TransientDeviceError,)):
    def _decorator(fn):
        @functools.wraps(fn)
        def _wrapper(*args, **kwargs):
            delay = base_delay
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions:
                    if attempt == max_attempts:
                        raise
                    time.sleep(delay * (1.0 + random.uniform(0.0, 0.5)))
                    delay *= backoff
        return _wrapper
    return _decorator
""",
    3: """
def validate_against_reference(energy, reference, tol=0.05):
    if not np.isfinite(energy):
        return False, "non-finite energy (NaN/inf)"
    gap = abs(energy - reference)
    if gap > tol:
        return False, f"energy {energy} is {gap:.4f} from reference {reference} (tol {tol})"
    return True, "within tolerance of reference"
""",
}
