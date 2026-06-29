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


@pytest.mark.parametrize(
    "device_name, shots",
    [("sv1", 0), ("ionq_aria", 10_000_000)],
    ids=["nonpositive", "excessive"],
)
def test_run_circuit_rejects_out_of_range_shots(device_name, shots):
    # Cost-awareness gate fails fast (before any AwsDevice construction / network).
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="shots must be in 1.."):
        run_circuit(circuit, device_name=device_name, shots=shots, s3_location=("b", "p"))


def test_device_arns_are_valid_format():
    for name, arn in DEVICE_ARNS.items():
        assert arn.startswith("arn:aws:braket:"), f"Invalid ARN for {name}"


def test_every_device_provider_is_priced():
    # Single-sourced registry: every device's provider must exist in cost.PRICING so the cost
    # gate can always produce an estimate (PRICING may carry extra reference-only rows).
    from lib.hardware.devices import DEVICES
    from lib.utils.cost import PRICING

    for name, spec in DEVICES.items():
        assert spec["provider"] in PRICING, (
            f"{name} -> {spec['provider']} missing from cost.PRICING"
        )


def test_device_arns_match_the_single_source():
    # DEVICE_ARNS is a derived backwards-compatible view; it must stay in lockstep with DEVICES.
    from lib.hardware.devices import DEVICES

    assert DEVICE_ARNS == {name: spec["arn"] for name, spec in DEVICES.items()}


def test_run_circuit_fails_closed_on_unpriced_provider(monkeypatch):
    # A device whose provider has no cost.PRICING entry must NOT dispatch — the cost lookup
    # raises before any AwsDevice is constructed (no network).
    import lib.hardware.devices as dev

    patched = dict(dev.DEVICES)
    patched["mystery"] = {"arn": "arn:aws:braket:::device/qpu/x/Mystery", "provider": "NoPrice"}
    monkeypatch.setattr(dev, "DEVICES", patched)

    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="Unknown provider"):
        dev.run_circuit(circuit, device_name="mystery", shots=10, s3_location=("b", "p"))


def test_get_device_memoizes_aws_device(monkeypatch):
    # AwsDevice construction is a GetDevice network describe — get_device must build it once per
    # short-name and reuse it (local stays a fresh LocalSimulator, not cached).
    import lib.hardware.devices as dev

    calls = {"n": 0}

    class StubAws:
        def __init__(self, arn):
            calls["n"] += 1
            self.arn = arn

    monkeypatch.setattr(dev, "AwsDevice", StubAws)
    monkeypatch.setattr(dev, "_AWS_DEVICE_CACHE", {})
    first = dev.get_device("sv1")
    second = dev.get_device("sv1")
    assert first is second
    assert calls["n"] == 1


def test_list_available_devices_shape(monkeypatch):
    # Pins the public dict contract (provider derived from provider_name) without network.
    import lib.hardware.devices as dev

    class StubDev:
        def __init__(self, name, provider, status, arn):
            self.name, self.provider_name, self.status, self.arn = name, provider, status, arn

    stubs = [StubDev("Aria-1", "IonQ", "ONLINE", "arn:aws:braket:::device/qpu/ionq/Aria-1")]
    monkeypatch.setattr(dev.AwsDevice, "get_devices", staticmethod(lambda: stubs))
    out = dev.list_available_devices()
    assert out == [{"name": "Aria-1", "provider": "IonQ", "status": "ONLINE", "arn": stubs[0].arn}]


@pytest.mark.parametrize("bad", ["bucket-only", ("b",), ("b", "p", "x"), ("", "p"), ("b", "")])
def test_run_circuit_rejects_malformed_s3(bad):
    # A malformed-but-non-None s3_location must fail fast (before AwsDevice), not deep in the SDK.
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="s3_location must be"):
        run_circuit(circuit, device_name="sv1", shots=10, s3_location=bad)
