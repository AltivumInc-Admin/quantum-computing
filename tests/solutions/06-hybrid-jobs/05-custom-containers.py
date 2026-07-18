"""Canonical solutions for 06-hybrid-jobs/notebooks/05-custom-containers.ipynb.

Executed by tests/test_exercise_checks.py inside the notebook's namespace,
directly before each exercise's check cell. Everything here is offline: string
assembly, a regex validator, an arithmetic cost model, and a create() argument
dict. No Docker, no ECR, no AwsQuantumJob.create call.
"""

SOLUTIONS = {
    1: """
deps = [
    "openfermion==1.7.1",
    "openfermionpyscf==0.5",
    "pyscf==2.13.0",
    "qiskit-braket-provider==0.4.3",
]
_install = "RUN pip install --no-cache-dir " + " ".join(deps)
custom_dockerfile = (
    "FROM 292282985366.dkr.ecr.us-east-1.amazonaws.com/amazon-braket-base-jobs:latest\\n"
    + _install
    + "\\nCOPY lib/ /opt/ml/code/lib/\\n"
)
print(custom_dockerfile)
""",
    2: """
_PREFIX = (
    r"^(?P<account>\\d{12})\\.dkr\\.ecr\\."
    r"(?P<region>[a-z]{2}-[a-z]+-\\d)\\.amazonaws\\.com/"
    r"(?P<repo>[a-z0-9][a-z0-9._/-]*)"
)
_TAGGED = re.compile(_PREFIX + r":(?P<tag>[\\w.-]+)$")
_DIGEST = re.compile(_PREFIX + r"@sha256:(?P<digest>[0-9a-f]{64})$")


def validate_image_ref(uri):
    m = _DIGEST.match(uri)
    if m:
        return True, m.groupdict()
    m = _TAGGED.match(uri)
    if m:
        return True, m.groupdict()
    return False, None
""",
    3: """
def estimate_job_cost(instance_per_hr, runtime_s, n_tasks, per_task, shots, per_shot):
    instance_cost = instance_per_hr * runtime_s / 3600.0
    quantum_cost = n_tasks * per_task + n_tasks * shots * per_shot
    return instance_cost + quantum_cost


budget = 100.0
estimated_cost = estimate_job_cost(
    instance_per_hr=0.10,
    runtime_s=3600,
    n_tasks=50,
    per_task=0.30,
    shots=100,
    per_shot=0.01,
)
print(f"estimated ${estimated_cost:.2f} against a ${budget:.2f} budget")
""",
    4: """
job_spec = {
    "device": "arn:aws:braket:::device/quantum-simulator/amazon/sv1",
    "source_module": "vqe_chemistry_job.py",
    "entry_point": "vqe_chemistry_job:main",
    "image_uri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/braket-quantum-workspace:latest",
    "hyperparameters": {"max_steps": "100"},
    "stopping_condition": {"maxRuntimeInSeconds": 3600},
    "wait_until_complete": False,
}
assert validate_image_uri(job_spec["image_uri"])[0]
""",
}
