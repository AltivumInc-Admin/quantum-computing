"""Device abstraction for running circuits on any Amazon Braket backend."""

import sys

from braket.devices import LocalSimulator
from braket.circuits import Circuit

from lib.utils.cost import estimate_cost, format_cost_warning


def __getattr__(name: str):
    """Resolve ``AwsDevice`` lazily.

    ``braket.aws`` (the cloud SDK) is imported only when a billable device is actually
    constructed, so this module stays importable where the AWS SDK is absent — notably the
    browser/qcsim lab bundle, which aliases ``braket.circuits`` and ``braket.devices`` but not
    ``braket.aws``. Accessing ``lib.hardware.devices.AwsDevice`` (e.g. to monkeypatch it in
    tests) triggers the import on demand.
    """
    if name == "AwsDevice":
        from braket.aws import AwsDevice

        return AwsDevice
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def _aws_device_cls():
    """Return the ``AwsDevice`` class, honoring a monkeypatched module attribute and otherwise
    importing it lazily via ``__getattr__``. Constructing one performs a GetDevice network
    describe, so callers only reach this on the billable (non-local) path."""
    return getattr(sys.modules[__name__], "AwsDevice")


# Single source of truth for every billable device: its Braket ARN and the cost.py PRICING
# provider key. The cost gate derives the provider from THIS table, so the device list and
# its cost provider cannot drift — a billable run can't slip past the cost estimate.
#
# Two flags govern the Phase-4 server-side QPU-submit path (lambda/qpu):
#   gate_capable — can run gate-model circuits (QuEra Aquila is analog-only: False).
#   allowlist    — approved for the real-money per-user QPU budget (lambda/qpu). v1: IQM
#                  Garnet ONLY. IonQ Forte is deliberately OFF: its 2500-shot error-mitigation
#                  floor is NOT modeled in estimate_cost, so allowlisting it would let the spend
#                  ledger under-charge by ~$200. Simulators are off (per-minute model, not the
#                  hardware-credit path). Adding a cheaper gate QPU + allowlist=True later makes
#                  it win cheapest_allowlisted_device automatically — but that is NOT the whole
#                  change: lambda/qpu/qpu-core.mjs carries its own DEVICE / DEVICE_ARN /
#                  DEVICE_REGION constants and hard-rejects any other device, so those three
#                  must move with the allowlist. tests/test_qpu_devices.py::
#                  test_lambda_device_identity_matches_the_single_source fails if they don't.
#                  NOTE: the real spend boundary is the ledger's hard caps ($2.50 lifetime per
#                  user, $15/day globally), not the client-authored progress gate — see
#                  LIFETIME_CAP_MICROS / DAILY_CAP_MICROS in lambda/qpu/qpu-core.mjs. (The
#                  platform pays those dollars; the learner never does.)
#
# min_shots / max_shots are the SERVICE's per-task shot bounds, from the Braket quotas
# page ("Additional quotas and limits", read 2026-07-20:
# https://docs.aws.amazon.com/braket/latest/developerguide/braket-quotas.html):
#   SV1, DM1 and Rigetti .... max 50,000 shots per task
#   IQM Garnet / Emerald .... max 20,000
#   QuEra Aquila ............ max 1,000
#   every IonQ device ....... MINIMUM 100 shots per on-demand task (2,500 for an
#                             error-mitigation task, which this library never submits)
#   TN1 ..................... no documented per-task shot cap; falls back to MAX_SHOTS
# run_circuit validates against these, so the cost estimate it prints is only ever
# printed for a submission the service will actually accept.
DEVICES = {
    "sv1": {
        "arn": "arn:aws:braket:::device/quantum-simulator/amazon/sv1",
        "provider": "SV1",
        "gate_capable": True,
        "allowlist": False,
        "max_shots": 50_000,
    },
    "dm1": {
        "arn": "arn:aws:braket:::device/quantum-simulator/amazon/dm1",
        "provider": "DM1",
        "gate_capable": True,
        "allowlist": False,
        "max_shots": 50_000,
    },
    "tn1": {
        "arn": "arn:aws:braket:::device/quantum-simulator/amazon/tn1",
        "provider": "TN1",
        "gate_capable": True,
        "allowlist": False,
    },
    # IonQ Aria is retired; Forte-1 is the live IonQ device (per-shot billed via the
    # "IonQ" provider key in cost.py PRICING, now the current $0.08/shot Forte rate).
    "ionq_forte": {
        "arn": "arn:aws:braket:us-east-1::device/qpu/ionq/Forte-1",
        "provider": "IonQ",
        "gate_capable": True,
        "allowlist": False,
        "min_shots": 100,
    },
    "iqm_garnet": {
        "arn": "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet",
        "provider": "IQM",
        "gate_capable": True,
        "allowlist": True,
        "max_shots": 20_000,
    },
    "quera_aquila": {
        "arn": "arn:aws:braket:us-east-1::device/qpu/quera/Aquila",
        "provider": "QuEra",
        "gate_capable": False,  # analog Hamiltonian device — cannot run gate circuits
        "allowlist": False,
        "max_shots": 1_000,
    },
}

# Backwards-compatible view (publicly exported via lib.hardware; used by tests/notebooks).
DEVICE_ARNS = {name: spec["arn"] for name, spec in DEVICES.items()}


def allowlisted_gate_devices() -> list[str]:
    """Short-names approved for the server-side QPU-submit path — real gate QPUs
    on the per-user budget allowlist. The lambda/qpu ledger only ever charges for
    one of these."""
    return [n for n, s in DEVICES.items() if s.get("allowlist") and s.get("gate_capable")]


def cheapest_allowlisted_device(shots: int = 1000) -> str | None:
    """The cheapest allowlisted gate QPU at ``shots``, derived from cost.py PRICING
    so the device list and its cost can never drift. Returns ``None`` if the
    allowlist is empty. v1 has exactly one entry (IQM Garnet), but the derivation
    keeps the choice honest if a cheaper device is ever allowlisted."""
    candidates = allowlisted_gate_devices()
    if not candidates:
        return None
    return min(candidates, key=lambda n: estimate_cost(DEVICES[n]["provider"], shots=shots))


# Coarse fallback ceiling for a device whose row carries no `max_shots`. Every documented
# per-device cap is tighter than this (see the DEVICES comment), so this bound only binds
# where Braket publishes none — it is a backstop, not the real guardrail.
MAX_SHOTS = 100_000


def _device_spec(name: str) -> dict:
    """The DEVICES row for ``name``, or a ValueError naming every known short-name.

    Single-sourced so get_device and run_circuit can never describe the fleet differently.
    """
    spec = DEVICES.get(name)
    if spec is None:
        raise ValueError(f"Unknown device: {name}. Known: {['local'] + list(DEVICES)}")
    return spec


def shot_bounds(device_name: str) -> tuple[int, int]:
    """The (min, max) shots per task the service accepts for ``device_name``.

    Derived from the DEVICES row, falling back to 1..MAX_SHOTS where Braket publishes no
    per-device bound.
    """
    spec = _device_spec(device_name)
    return spec.get("min_shots", 1), spec.get("max_shots", MAX_SHOTS)


# AwsDevice construction performs a GetDevice network describe; memoize per short-name so
# repeated same-device runs reuse one object (populated lazily in get_device).
_AWS_DEVICE_CACHE: dict = {}


def get_device(name: str = "local"):
    """Get a Braket device by short name.

    Non-local devices are memoized per process — ``AwsDevice`` construction performs a GetDevice
    network describe, so repeated same-device runs reuse one object. Call
    ``device.refresh_metadata()`` if you need fresh status.
    """
    if name == "local":
        return LocalSimulator()
    spec = _device_spec(name)
    device = _AWS_DEVICE_CACHE.get(name)
    if device is None:
        # GetDevice describe — once per device per process. _aws_device_cls() defers the
        # braket.aws import to here so this module imports without the AWS SDK present.
        device = _aws_device_cls()(spec["arn"])
        _AWS_DEVICE_CACHE[name] = device
    return device


def list_available_devices() -> list[dict]:
    """List the full Braket device fleet, each row carrying its own status.

    This applies NO status filter: ``AwsDevice.get_devices()`` returns OFFLINE and RETIRED
    devices too, and they come back here unchanged. The ``status`` field
    (``ONLINE`` / ``OFFLINE`` / ``RETIRED``) is the caller's to check before dispatching —
    picking a row blind can target a retired machine.
    """
    devices = _aws_device_cls().get_devices()
    return [
        {"name": d.name, "provider": d.provider_name, "status": d.status, "arn": d.arn}
        for d in devices
    ]


def run_circuit(
    circuit: Circuit,
    device_name: str = "local",
    shots: int = 1000,
    s3_location: tuple | None = None,
    estimated_minutes: float = 1.0,
):
    """Run a circuit on the specified device, and BLOCK until it finishes.

    For billable (non-local) devices this enforces the project's cost-awareness
    rule: it validates the device name, its gate paradigm and ``shots``, prints an
    estimated-cost warning, and only then submits — so a circuit never reaches a
    real QPU/managed simulator without a visible cost notice. All gating happens
    before the AwsDevice is constructed, so a bad request fails fast with no
    network/credentials.

    On the billable path this call is SYNCHRONOUS and can block for a long time:
    ``AwsQuantumTask.result()`` waits for the task to leave the QPU queue, inheriting
    the SDK's ``poll_timeout_seconds`` default of 432000 seconds (5 days). This
    function does not thread that timeout through — a caller who needs the
    un-awaited ``AwsQuantumTask`` should submit directly via
    ``get_device(name).run(circuit, ...)`` and poll it themselves.

    Raises RuntimeError if the task produced no result (FAILED / CANCELLED / poll
    timeout). The SDK returns ``None`` in those cases, and by then the task has
    already been submitted and may have been billed — so this fails loudly rather
    than handing back a ``None`` that dies as an ``AttributeError`` on the caller's
    next line.
    """
    run_kwargs: dict = {"shots": shots}
    if device_name != "local":
        # Cost-awareness gate (billable devices) — validate everything BEFORE get_device, so a
        # bad request fails fast with no network/credentials. The device NAME goes first: it is
        # the most fundamental input and the cheapest to reject, so naming a retired or
        # misspelled device says so instead of complaining about a missing S3 bucket.
        spec = _device_spec(device_name)
        if not spec.get("gate_capable", True):
            raise ValueError(
                f"{device_name} is an analog Hamiltonian device and cannot run gate circuits. "
                f"Gate-capable devices: {[n for n, s in DEVICES.items() if s.get('gate_capable', True)]}"
            )
        min_shots, max_shots = shot_bounds(device_name)
        if shots < min_shots or shots > max_shots:
            raise ValueError(
                f"shots must be in {min_shots}..{max_shots} for {device_name} (got {shots}) — "
                f"Braket's per-task limit for this device"
            )
        if s3_location is None:
            raise ValueError("s3_location required for AWS devices: (bucket, prefix)")
        if not (
            isinstance(s3_location, tuple)
            and len(s3_location) == 2
            and all(isinstance(part, str) and part for part in s3_location)
        ):
            raise ValueError(
                f"s3_location must be a (bucket, prefix) tuple of non-empty strings (got {s3_location!r})"
            )
        # The single-sourced provider is always present; format_cost_warning -> estimate_cost still
        # raises "Unknown provider" (before get_device / any network) if it is somehow unpriced, so
        # the gate stays fail-closed without a separate hand-synced provider map to drift.
        print(
            format_cost_warning(spec["provider"], shots=shots, estimated_minutes=estimated_minutes)
        )
        run_kwargs["s3_destination_folder"] = s3_location

    device = get_device(device_name)
    task = device.run(circuit, **run_kwargs)
    result = task.result()
    if result is None:
        # AwsQuantumTask.result() returns None for a task in a NO_RESULT terminal state
        # (FAILED / CANCELLED) or when the poll timed out. Money may already have been
        # spent, so silence is the wrong default: name the task and its state.
        raise RuntimeError(
            f"{device_name} task returned no result "
            f"(state={_task_state(task)}, task={getattr(task, 'id', 'unknown')}). "
            "A FAILED or CANCELLED task, or one that outlasted the poll timeout, yields "
            "no result — the submission may still have been billed. Inspect it with "
            "AwsQuantumTask(arn).state() / .metadata()."
        )
    return result


def _task_state(task) -> str:
    """The task's terminal state for an error message, without a fresh network poll."""
    try:
        return task.state(use_cached_value=True)
    except Exception:  # noqa: BLE001 - diagnostics only; never mask the real failure
        return "unknown"
