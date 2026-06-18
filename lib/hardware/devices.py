"""Device abstraction for running circuits on any Amazon Braket backend."""

from braket.aws import AwsDevice
from braket.devices import LocalSimulator
from braket.circuits import Circuit

from lib.utils.cost import format_cost_warning


DEVICE_ARNS = {
    "sv1": "arn:aws:braket:::device/quantum-simulator/amazon/sv1",
    "dm1": "arn:aws:braket:::device/quantum-simulator/amazon/dm1",
    "tn1": "arn:aws:braket:::device/quantum-simulator/amazon/tn1",
    "ionq_aria": "arn:aws:braket:us-east-1::device/qpu/ionq/Aria-1",
    "ionq_forte": "arn:aws:braket:us-east-1::device/qpu/ionq/Forte-1",
    "iqm_garnet": "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet",
    "quera_aquila": "arn:aws:braket:us-east-1::device/qpu/quera/Aquila",
}

# Bridge the device short names above to the cost.py PRICING provider keys, so
# run_circuit can surface a cost estimate before any billable execution.
_COST_PROVIDER = {
    "sv1": "SV1",
    "dm1": "DM1",
    "tn1": "TN1",
    "ionq_aria": "IonQ",
    "ionq_forte": "IonQ",
    "iqm_garnet": "IQM",
    "quera_aquila": "QuEra",
}

# Guardrail against an accidental huge (expensive) submission on a billable device.
MAX_SHOTS = 100_000


def get_device(name: str = "local"):
    """Get a Braket device by short name."""
    if name == "local":
        return LocalSimulator()
    if name not in DEVICE_ARNS:
        raise ValueError(f"Unknown device: {name}. Known: {['local'] + list(DEVICE_ARNS.keys())}")
    return AwsDevice(DEVICE_ARNS[name])


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
):
    """Run a circuit on the specified device.

    For billable (non-local) devices this enforces the project's cost-awareness
    rule: it validates ``shots``, prints an estimated-cost warning, and only then
    submits — so a circuit never reaches a real QPU/managed simulator without a
    visible cost notice. All gating happens before the AwsDevice is constructed,
    so a bad request fails fast with no network/credentials.
    """
    if device_name == "local":
        device = get_device(device_name)
        task = device.run(circuit, shots=shots)
        return task.result()

    # Cost-awareness gate (billable devices) — validate first, no network yet.
    if shots <= 0 or shots > MAX_SHOTS:
        raise ValueError(f"shots must be in 1..{MAX_SHOTS} for billable devices (got {shots})")
    if s3_location is None:
        raise ValueError("s3_location required for AWS devices: (bucket, prefix)")
    provider = _COST_PROVIDER.get(device_name)
    if provider is not None:
        print(format_cost_warning(provider, shots=shots))

    device = get_device(device_name)
    task = device.run(circuit, s3_destination_folder=s3_location, shots=shots)
    return task.result()
