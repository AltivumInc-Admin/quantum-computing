"""Tests for lib/hardware/devices.py — local simulator only."""

import pytest
from braket.circuits import Circuit
from lib.hardware import DEVICE_ARNS, DEVICES, MAX_SHOTS, get_device, run_circuit, shot_bounds


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
    [("sv1", 0), ("ionq_forte", 10_000_000)],
    ids=["nonpositive", "excessive"],
)
def test_run_circuit_rejects_out_of_range_shots(device_name, shots):
    # Cost-awareness gate fails fast (before any AwsDevice construction / network).
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="shots must be in "):
        run_circuit(circuit, device_name=device_name, shots=shots, s3_location=("b", "p"))


@pytest.mark.parametrize(
    "device_name, expected",
    [
        # Braket's published per-task bounds (see the DEVICES comment for the quotas
        # citation). MAX_SHOTS is only the fallback for a device with no published cap.
        ("sv1", (1, 50_000)),
        ("dm1", (1, 50_000)),
        ("iqm_garnet", (1, 20_000)),
        ("quera_aquila", (1, 1_000)),
        ("ionq_forte", (100, MAX_SHOTS)),  # IonQ publishes a MINIMUM, not a maximum
        ("tn1", (1, MAX_SHOTS)),  # no published per-task cap — falls back
    ],
)
def test_shot_bounds_are_the_real_service_limits(device_name, expected):
    assert shot_bounds(device_name) == expected


def test_every_device_shot_bound_is_tighter_than_the_fallback():
    # The point of the per-device bounds: MAX_SHOTS alone never binds, because every
    # published cap is below it. A row whose cap exceeded MAX_SHOTS would be a typo.
    for name, spec in DEVICES.items():
        low, high = shot_bounds(name)
        assert 1 <= low <= high <= MAX_SHOTS, f"{name} has nonsensical shot bounds"


@pytest.mark.parametrize(
    "device_name, shots",
    [
        ("iqm_garnet", 50_000),  # Garnet's documented cap is 20,000/task
        ("sv1", 60_000),  # SV1's is 50,000
        ("dm1", 60_000),  # DM1's is 50,000
        ("ionq_forte", 1),  # IonQ's on-demand MINIMUM is 100
        ("ionq_forte", 99),  # ...so 99 is still below the floor
    ],
    # quera_aquila is deliberately absent: it is analog-only, so a gate circuit is
    # rejected by the paradigm check before shots are ever considered.
)
def test_run_circuit_rejects_shots_the_service_would_reject(device_name, shots, capsys):
    # Before this gate, MAX_SHOTS (100,000) sat above every real per-device limit, so the
    # cost warning printed an authoritative dollar figure for a task Braket would refuse.
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="shots must be in "):
        run_circuit(circuit, device_name=device_name, shots=shots, s3_location=("b", "p"))
    assert "Estimated cost" not in capsys.readouterr().out, (
        "printed a cost estimate for a submission the service will reject"
    )


def test_run_circuit_rejects_a_gate_circuit_on_an_analog_device(capsys):
    # DEVICES already records quera_aquila as gate_capable: False; run_circuit must read
    # the flag rather than print a plausible dollar figure and fail at the service.
    circuit = Circuit().h(0).cnot(0, 1)
    with pytest.raises(ValueError, match="analog Hamiltonian device"):
        run_circuit(circuit, device_name="quera_aquila", shots=400, s3_location=("b", "p"))
    assert "Estimated cost" not in capsys.readouterr().out


@pytest.mark.parametrize("bad_name", ["ionq_aria", "sv-1", "nonexistent"])
def test_run_circuit_reports_the_unknown_device_not_the_missing_bucket(bad_name):
    # An unknown/retired short-name used to surface as "s3_location required", because the
    # device lookup sat below the S3 check. ionq_aria was a real short-name until the
    # retirement propagated, so a stale snippet hits exactly this path.
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="Unknown device"):
        run_circuit(circuit, device_name=bad_name, shots=10)


def test_unknown_device_message_is_single_sourced():
    # get_device and run_circuit must describe the fleet identically (one lookup helper).
    from lib.hardware.devices import _device_spec

    with pytest.raises(ValueError) as from_helper:
        _device_spec("ionq_aria")
    with pytest.raises(ValueError) as from_get:
        get_device("ionq_aria")
    assert str(from_helper.value) == str(from_get.value)


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

    stubs = [StubDev("Forte-1", "IonQ", "ONLINE", "arn:aws:braket:::device/qpu/ionq/Forte-1")]
    monkeypatch.setattr(dev.AwsDevice, "get_devices", staticmethod(lambda: stubs))
    out = dev.list_available_devices()
    assert out == [{"name": "Forte-1", "provider": "IonQ", "status": "ONLINE", "arn": stubs[0].arn}]


def test_list_available_devices_does_not_filter_by_status(monkeypatch):
    # The function applies NO status filter — OFFLINE and RETIRED devices come back too,
    # and the caller must check `status` before dispatching. Pinned so the docstring and
    # the behavior cannot drift apart again (the name says "available"; the code doesn't).
    import lib.hardware.devices as dev

    class StubDev:
        def __init__(self, name, provider, status, arn):
            self.name, self.provider_name, self.status, self.arn = name, provider, status, arn

    stubs = [
        StubDev("Garnet", "IQM", "ONLINE", "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet"),
        StubDev("Borealis", "Xanadu", "OFFLINE", "arn:aws:braket:::device/qpu/xanadu/Borealis"),
        StubDev("Aria-1", "IonQ", "RETIRED", "arn:aws:braket:::device/qpu/ionq/Aria-1"),
    ]
    monkeypatch.setattr(dev.AwsDevice, "get_devices", staticmethod(lambda: stubs))
    out = dev.list_available_devices()
    assert [row["status"] for row in out] == ["ONLINE", "OFFLINE", "RETIRED"]


def test_run_circuit_raises_when_a_billable_task_returns_no_result(monkeypatch, capsys):
    # AwsQuantumTask.result() returns None for a FAILED/CANCELLED task or a poll timeout —
    # after the task has been submitted and possibly billed. Returning that None hands the
    # learner `AttributeError: 'NoneType' object has no attribute 'measurement_counts'`
    # with no ARN and no state, so run_circuit must fail loudly instead.
    import lib.hardware.devices as dev

    class StubTask:
        id = "arn:aws:braket:eu-north-1:000000000000:quantum-task/abc-123"

        def state(self, use_cached_value=False):
            return "FAILED"

        def result(self):
            return None

    class StubAws:
        def __init__(self, arn):
            self.arn = arn

        def run(self, circuit, **kwargs):
            return StubTask()

    monkeypatch.setattr(dev, "AwsDevice", StubAws)
    monkeypatch.setattr(dev, "_AWS_DEVICE_CACHE", {})

    with pytest.raises(RuntimeError) as exc:
        dev.run_circuit(Circuit().h(0), device_name="iqm_garnet", shots=100, s3_location=("b", "p"))
    message = str(exc.value)
    assert "FAILED" in message, "the terminal state must be named"
    assert StubTask.id in message, "the task ARN must be named so the run can be inspected"
    assert "billed" in message
    # The cost estimate still printed — money really may have been spent.
    assert "Estimated cost" in capsys.readouterr().out


def test_run_circuit_returns_the_result_when_the_task_succeeds(monkeypatch):
    # The guard above must not swallow the ordinary path.
    import lib.hardware.devices as dev

    sentinel = object()

    class StubTask:
        id = "arn:task/ok"

        def result(self):
            return sentinel

    class StubAws:
        def __init__(self, arn):
            self.arn = arn

        def run(self, circuit, **kwargs):
            return StubTask()

    monkeypatch.setattr(dev, "AwsDevice", StubAws)
    monkeypatch.setattr(dev, "_AWS_DEVICE_CACHE", {})
    out = dev.run_circuit(
        Circuit().h(0), device_name="iqm_garnet", shots=100, s3_location=("b", "p")
    )
    assert out is sentinel


@pytest.mark.parametrize("bad", ["bucket-only", ("b",), ("b", "p", "x"), ("", "p"), ("b", "")])
def test_run_circuit_rejects_malformed_s3(bad):
    # A malformed-but-non-None s3_location must fail fast (before AwsDevice), not deep in the SDK.
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="s3_location must be"):
        run_circuit(circuit, device_name="sv1", shots=10, s3_location=bad)
