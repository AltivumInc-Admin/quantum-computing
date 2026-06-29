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


def test_every_billable_device_has_a_cost_provider():
    # The fail-closed gate only protects spend if every billable device maps to a priced
    # provider. Enforce the two hand-synced dicts (+ cost.PRICING) in CI so they can't drift.
    from lib.hardware.devices import _COST_PROVIDER
    from lib.utils.cost import PRICING

    assert set(DEVICE_ARNS) == set(_COST_PROVIDER)
    for provider in _COST_PROVIDER.values():
        assert provider in PRICING, f"{provider} missing from cost.PRICING"


def test_run_circuit_fails_closed_when_provider_missing(monkeypatch):
    # A billable device added to DEVICE_ARNS but forgotten in _COST_PROVIDER must NOT
    # dispatch silently — it must raise before any AwsDevice is constructed (no network).
    import lib.hardware.devices as dev

    patched = dict(dev._COST_PROVIDER)
    patched.pop("sv1")
    monkeypatch.setattr(dev, "_COST_PROVIDER", patched)

    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="no _COST_PROVIDER entry"):
        dev.run_circuit(circuit, device_name="sv1", shots=10, s3_location=("b", "p"))
