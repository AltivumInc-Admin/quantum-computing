"""Tests for lib/hardware/devices.py — local simulator only."""

import pytest
from braket.circuits import Circuit
from lib.hardware.devices import get_device, run_circuit, DEVICE_ARNS


def test_get_local_device():
    device = get_device("local")
    assert device is not None


def test_get_unknown_device_raises():
    with pytest.raises(ValueError, match="Unknown device"):
        get_device("nonexistent_device")


def test_run_circuit_local():
    circuit = Circuit().h(0).cnot(0, 1)
    result = run_circuit(circuit, device_name="local", shots=100)
    assert len(result.measurements) == 100


def test_run_circuit_aws_requires_s3():
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="s3_location required"):
        run_circuit(circuit, device_name="sv1", shots=10)


def test_run_circuit_rejects_nonpositive_shots_on_billable_device():
    # Cost-awareness gate fails fast (before any AwsDevice construction / network).
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="shots must be in 1.."):
        run_circuit(circuit, device_name="sv1", shots=0, s3_location=("b", "p"))


def test_run_circuit_rejects_excessive_shots_on_billable_device():
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="shots must be in 1.."):
        run_circuit(circuit, device_name="ionq_aria", shots=10_000_000, s3_location=("b", "p"))


def test_device_arns_are_valid_format():
    for name, arn in DEVICE_ARNS.items():
        assert arn.startswith("arn:aws:braket:"), f"Invalid ARN for {name}"
