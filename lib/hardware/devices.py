"""Device abstraction for running circuits on any Amazon Braket backend."""

from braket.aws import AwsDevice
from braket.devices import LocalSimulator
from braket.circuits import Circuit


DEVICE_ARNS = {
    "sv1": "arn:aws:braket:::device/quantum-simulator/amazon/sv1",
    "dm1": "arn:aws:braket:::device/quantum-simulator/amazon/dm1",
    "tn1": "arn:aws:braket:::device/quantum-simulator/amazon/tn1",
    "ionq_aria": "arn:aws:braket:us-east-1::device/qpu/ionq/Aria-1",
    "ionq_forte": "arn:aws:braket:us-east-1::device/qpu/ionq/Forte-1",
    "iqm_garnet": "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet",
    "quera_aquila": "arn:aws:braket:us-east-1::device/qpu/quera/Aquila",
}


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


def run_circuit(circuit: Circuit, device_name: str = "local", shots: int = 1000, s3_location: tuple | None = None):
    """Run a circuit on the specified device."""
    device = get_device(device_name)
    if device_name == "local":
        task = device.run(circuit, shots=shots)
    else:
        if s3_location is None:
            raise ValueError("s3_location required for AWS devices: (bucket, prefix)")
        task = device.run(circuit, s3_destination_folder=s3_location, shots=shots)
    return task.result()
