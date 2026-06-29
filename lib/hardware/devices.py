"""Device abstraction for running circuits on any Amazon Braket backend."""

from braket.aws import AwsDevice
from braket.devices import LocalSimulator
from braket.circuits import Circuit

from lib.utils.cost import format_cost_warning


# Single source of truth for every billable device: its Braket ARN and the cost.py PRICING
# provider key. The cost gate derives the provider from THIS table, so the device list and
# its cost provider cannot drift — a billable run can't slip past the cost estimate.
DEVICES = {
    "sv1": {"arn": "arn:aws:braket:::device/quantum-simulator/amazon/sv1", "provider": "SV1"},
    "dm1": {"arn": "arn:aws:braket:::device/quantum-simulator/amazon/dm1", "provider": "DM1"},
    "tn1": {"arn": "arn:aws:braket:::device/quantum-simulator/amazon/tn1", "provider": "TN1"},
    "ionq_aria": {"arn": "arn:aws:braket:us-east-1::device/qpu/ionq/Aria-1", "provider": "IonQ"},
    "ionq_forte": {"arn": "arn:aws:braket:us-east-1::device/qpu/ionq/Forte-1", "provider": "IonQ"},
    "iqm_garnet": {"arn": "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet", "provider": "IQM"},
    "quera_aquila": {
        "arn": "arn:aws:braket:us-east-1::device/qpu/quera/Aquila",
        "provider": "QuEra",
    },
}

# Backwards-compatible view (publicly exported via lib.hardware; used by tests/notebooks).
DEVICE_ARNS = {name: spec["arn"] for name, spec in DEVICES.items()}

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
        device = AwsDevice(DEVICES[name]["arn"])  # GetDevice describe — once per device per process
        _AWS_DEVICE_CACHE[name] = device
    return device


def list_available_devices() -> list[dict]:
    """List all currently available Amazon Braket devices with their status."""
    devices = AwsDevice.get_devices()
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
