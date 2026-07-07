"""Device abstraction for running circuits on any Amazon Braket backend."""

import sys

from braket.devices import LocalSimulator
from braket.circuits import Circuit

from lib.utils.cost import format_cost_warning


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
#   allowlist    — approved for the real-money per-user QPU budget. v1: IQM Garnet ONLY.
#                  IonQ Forte is deliberately OFF: its 2500-shot error-mitigation floor is
#                  NOT modeled in estimate_cost, so allowlisting it would let the spend
#                  ledger under-charge by ~$200. Simulators are off (per-minute model, not
#                  the hardware-credit path). Adding a cheaper gate QPU + allowlist=True later
#                  makes it win cheapest_allowlisted_device automatically — no other change.
DEVICES = {
    "sv1": {
        "arn": "arn:aws:braket:::device/quantum-simulator/amazon/sv1",
        "provider": "SV1",
        "gate_capable": True,
        "allowlist": False,
    },
    "dm1": {
        "arn": "arn:aws:braket:::device/quantum-simulator/amazon/dm1",
        "provider": "DM1",
        "gate_capable": True,
        "allowlist": False,
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
    },
    "iqm_garnet": {
        "arn": "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet",
        "provider": "IQM",
        "gate_capable": True,
        "allowlist": True,
    },
    "quera_aquila": {
        "arn": "arn:aws:braket:us-east-1::device/qpu/quera/Aquila",
        "provider": "QuEra",
        "gate_capable": False,  # analog Hamiltonian device — cannot run gate circuits
        "allowlist": False,
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
    from lib.utils.cost import estimate_cost

    candidates = allowlisted_gate_devices()
    if not candidates:
        return None
    return min(candidates, key=lambda n: estimate_cost(DEVICES[n]["provider"], shots=shots))


# Guardrail against an accidental huge (expensive) submission on a billable device.
MAX_SHOTS = 100_000

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
    if name not in DEVICES:
        raise ValueError(f"Unknown device: {name}. Known: {['local'] + list(DEVICES)}")
    device = _AWS_DEVICE_CACHE.get(name)
    if device is None:
        # GetDevice describe — once per device per process. _aws_device_cls() defers the
        # braket.aws import to here so this module imports without the AWS SDK present.
        device = _aws_device_cls()(DEVICES[name]["arn"])
        _AWS_DEVICE_CACHE[name] = device
    return device


def list_available_devices() -> list[dict]:
    """List all currently available Amazon Braket devices with their status."""
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
    """Run a circuit on the specified device.

    For billable (non-local) devices this enforces the project's cost-awareness
    rule: it validates ``shots``, prints an estimated-cost warning, and only then
    submits — so a circuit never reaches a real QPU/managed simulator without a
    visible cost notice. All gating happens before the AwsDevice is constructed,
    so a bad request fails fast with no network/credentials.
    """
    run_kwargs: dict = {"shots": shots}
    if device_name != "local":
        # Cost-awareness gate (billable devices) — validate everything BEFORE get_device, so a
        # bad request fails fast with no network/credentials.
        if shots <= 0 or shots > MAX_SHOTS:
            raise ValueError(f"shots must be in 1..{MAX_SHOTS} for billable devices (got {shots})")
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
        spec = DEVICES.get(device_name)
        if spec is None:
            raise ValueError(f"Unknown device: {device_name}. Known: {['local'] + list(DEVICES)}")
        # The single-sourced provider is always present; format_cost_warning -> estimate_cost still
        # raises "Unknown provider" (before get_device / any network) if it is somehow unpriced, so
        # the gate stays fail-closed without a separate hand-synced provider map to drift.
        print(
            format_cost_warning(spec["provider"], shots=shots, estimated_minutes=estimated_minutes)
        )
        run_kwargs["s3_destination_folder"] = s3_location

    device = get_device(device_name)
    return device.run(circuit, **run_kwargs).result()
