"""Tests for lib/hardware/devices.py — local simulator only."""

import pytest
from braket.circuits import Circuit
from lib.hardware import DEVICE_ARNS, DEVICES, MAX_SHOTS, get_device, run_circuit, shot_bounds
from lib.hardware.devices import (
    DEVICE_STATUSES,
    device_region,
    device_status,
    dispatchable_devices,
)


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
    [("sv1", 0), ("ionq_forte_enterprise", 10_000_000)],
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
        # Each device's live service.shotsRange, cross-checked against the quotas page
        # (see the DEVICES comment). Every row now declares its own cap, so MAX_SHOTS is a
        # backstop for a future row that forgets one, not a bound anything relies on.
        ("sv1", (1, 50_000)),
        ("dm1", (1, 50_000)),
        ("iqm_garnet", (1, 20_000)),
        ("iqm_emerald", (1, 20_000)),
        ("aqt_ibex_q1", (1, 2_000)),
        ("quera_aquila", (1, 1_000)),
        # IonQ publishes a MINIMUM of 100 on the quotas page; the live shotsRange also
        # carries a MAXIMUM of 5,000, which the page does not state. Both Forte machines.
        ("ionq_forte", (100, 5_000)),
        ("ionq_forte_enterprise", (100, 5_000)),
        # Rigetti's minimum of 10 is API-only — the quotas page states only the 50,000 max.
        ("rigetti_cepheus", (10, 50_000)),
        # TN1 is retired, but its bounds are still recorded (and still enforced, below the
        # status refusal that fires first).
        ("tn1", (1, 1_000)),
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
        ("ionq_forte_enterprise", 1),  # IonQ's on-demand MINIMUM is 100
        ("ionq_forte_enterprise", 99),  # ...so 99 is still below the floor
        ("ionq_forte_enterprise", 5_001),  # ...and its live MAXIMUM is 5,000
        ("aqt_ibex_q1", 2_001),  # AQT IBEX Q1's cap is 2,000
        ("iqm_emerald", 20_001),  # Emerald's cap is 20,000
        ("rigetti_cepheus", 9),  # Cepheus has an API-only MINIMUM of 10
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
    patched["mystery"] = {
        "arn": "arn:aws:braket:::device/qpu/x/Mystery",
        "provider": "NoPrice",
        "status": "ONLINE",
    }
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


# --- fleet status: retired and offline devices stay visible but undispatchable ----------


def test_every_device_declares_a_status():
    # device_status() defaults to ONLINE for a row that omits `status`, which keeps a
    # monkeypatched or hand-built row working. A REAL row must never rely on that default:
    # a forgotten status would silently make a retired machine dispatchable again.
    for name, spec in DEVICES.items():
        assert "status" in spec, f"{name} declares no status"
        assert spec["status"] in DEVICE_STATUSES, (
            f"{name} has status {spec['status']!r}, not one of {DEVICE_STATUSES}"
        )


def test_the_live_fleet_statuses_are_recorded():
    # Verified 2026-09-04 with `aws braket search-devices` across all five Braket regions.
    # TN1 is RETIRED everywhere it is still listed; Forte-1 is OFFLINE (reversible), not
    # retired; everything else this library carries is ONLINE.
    assert device_status("tn1") == "RETIRED"
    assert device_status("ionq_forte") == "OFFLINE"
    for name in (
        "sv1",
        "dm1",
        "ionq_forte_enterprise",
        "iqm_garnet",
        "iqm_emerald",
        "aqt_ibex_q1",
        "rigetti_cepheus",
        "quera_aquila",
    ):
        assert device_status(name) == "ONLINE", f"{name} should be ONLINE"


def test_dispatchable_devices_excludes_everything_not_online():
    dispatchable = dispatchable_devices()
    assert "tn1" not in dispatchable, "a RETIRED device must not be dispatchable"
    assert "ionq_forte" not in dispatchable, "an OFFLINE device must not be dispatchable"
    assert set(dispatchable) == {n for n, s in DEVICES.items() if s["status"] == "ONLINE"}


def test_a_retired_device_cannot_be_dispatched(capsys):
    # THE regression this whole status concept exists for. Before it, run_circuit accepted
    # "tn1", printed an authoritative "$0.2750" for a machine AWS had retired, constructed an
    # AwsDevice (a real GetDevice call, real credentials) and only then failed at the service.
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="RETIRED") as exc:
        run_circuit(circuit, device_name="tn1", shots=100, s3_location=("b", "p"))
    message = str(exc.value)
    assert "tn1" in message, "the refusal must name the device"
    assert "retired" in message.lower(), "the refusal must say what happened to it"
    assert "sv1" in message, "the refusal must point at something that still works"
    assert "Estimated cost" not in capsys.readouterr().out, (
        "printed a cost estimate for a device that cannot accept a task"
    )


def test_an_offline_device_cannot_be_dispatched_but_is_not_called_retired(capsys):
    # OFFLINE is a calibration/maintenance state and reverses; RETIRED does not. The refusal
    # must not tell a learner that Forte-1 is gone for good.
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="OFFLINE") as exc:
        run_circuit(circuit, device_name="ionq_forte", shots=1000, s3_location=("b", "p"))
    message = str(exc.value)
    assert "retired" not in message.lower(), "OFFLINE is reversible — do not call it retired"
    assert "ionq_forte_enterprise" in message, "point at the live IonQ twin"
    assert "Estimated cost" not in capsys.readouterr().out


def test_the_status_refusal_fires_before_every_other_gate():
    # Ordering matters: a device that cannot accept a task cannot be made acceptable by
    # fixing the shots or the bucket, so the status refusal must win over both. If the shot
    # check ran first, a retired device with a bad shot count would report the wrong problem.
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="RETIRED"):
        run_circuit(circuit, device_name="tn1", shots=999_999, s3_location=("b", "p"))
    with pytest.raises(ValueError, match="RETIRED"):
        run_circuit(circuit, device_name="tn1", shots=100)  # no s3_location either


def test_a_retired_device_stays_visible_to_the_curriculum():
    # Retirement is taught, not erased: the row, its ARN, its specs and its shot bounds all
    # remain readable. Deleting it would make "tn1" indistinguishable from a typo, and would
    # delete the four-rung simulator ladder that 02-hardware is built around.
    assert "tn1" in DEVICES
    assert DEVICE_ARNS["tn1"].endswith("/tn1")
    assert DEVICES["tn1"]["qubits"] == 50
    assert shot_bounds("tn1") == (1, 1_000)
    from lib.hardware.devices import _device_spec

    assert _device_spec("tn1") is DEVICES["tn1"]  # no "Unknown device" for a retired name


# --- the adopted devices ----------------------------------------------------------------


def test_the_four_newly_adopted_devices_are_present():
    # Adopted 2026-09-04 from the verified live fleet. All four land allowlist: False —
    # allowlisting is a real-money decision that also has to move lambda/qpu's own
    # DEVICE/DEVICE_ARN/DEVICE_REGION constants (see tests/test_qpu_devices.py).
    for name in ("ionq_forte_enterprise", "iqm_emerald", "aqt_ibex_q1", "rigetti_cepheus"):
        spec = DEVICES[name]
        assert spec["status"] == "ONLINE"
        assert spec["allowlist"] is False, f"{name} must not be on the real-money allowlist"
        assert spec["gate_capable"] is True


@pytest.mark.parametrize(
    "device_name, arn",
    [
        (
            "ionq_forte_enterprise",
            "arn:aws:braket:us-east-1::device/qpu/ionq/Forte-Enterprise-1",
        ),
        ("iqm_emerald", "arn:aws:braket:eu-north-1::device/qpu/iqm/Emerald"),
        # Note the ARN spells it "Ibex-Q1" while Braket's deviceName is "IBEX Q1".
        ("aqt_ibex_q1", "arn:aws:braket:eu-north-1::device/qpu/aqt/Ibex-Q1"),
        ("rigetti_cepheus", "arn:aws:braket:us-west-1::device/qpu/rigetti/Cepheus-1-108Q"),
    ],
)
def test_adopted_device_arns_are_the_verified_ones(device_name, arn):
    assert DEVICES[device_name]["arn"] == arn


def test_rigetti_is_no_longer_reference_only():
    # cost.PRICING carried a Rigetti rate for a long time with no dispatchable Rigetti
    # device. Cepheus-1-108Q is ONLINE in us-west-1, so lib.hardware now dispatches to it.
    assert "rigetti_cepheus" in dispatchable_devices()
    assert DEVICES["rigetti_cepheus"]["provider"] == "Rigetti"


def test_emerald_does_not_bill_at_garnets_rate():
    # The single most consequential fact in the fleet refresh: IQM ships two devices at
    # different per-shot rates. A shared "IQM" provider key would price every Emerald run at
    # Garnet's rate and understate true cost by ~10%.
    from lib.utils.cost import PRICING

    garnet = DEVICES["iqm_garnet"]["provider"]
    emerald = DEVICES["iqm_emerald"]["provider"]
    assert garnet != emerald, "Garnet and Emerald must not share a pricing key"
    assert PRICING[emerald]["per_shot"] != PRICING[garnet]["per_shot"]


def test_the_ionq_twins_share_one_pricing_key():
    # Forte-1 and Forte Enterprise 1 are rate-identical, so one key is correct here — the
    # opposite of the IQM case, and worth pinning so nobody "fixes" it by symmetry.
    assert DEVICES["ionq_forte"]["provider"] == DEVICES["ionq_forte_enterprise"]["provider"]


# --- descriptive fleet facts -------------------------------------------------------------


def test_every_device_declares_its_teaching_facts():
    for name, spec in DEVICES.items():
        assert isinstance(spec["qubits"], int) and spec["qubits"] > 0, name
        assert spec["paradigm"], name
        assert "connectivity" in spec, name
        assert "native_gates" in spec, name
        gates = spec["native_gates"]
        # A simulator and an analog device have no native gate basis; a QPU must name one.
        if gates is None:
            assert "simulator" in spec["paradigm"] or "analog" in spec["paradigm"], name
        else:
            assert isinstance(gates, tuple) and gates, name


def test_qubit_counts_are_the_verified_ones():
    # Cepheus reports 107 despite the "108Q" in its name, and its indices are 0-based and
    # non-contiguous (8 is absent) — so range(qubits) addresses a qubit it does not have.
    expected = {
        "sv1": 34,
        "dm1": 17,
        "tn1": 50,
        "ionq_forte": 36,
        "ionq_forte_enterprise": 36,
        "iqm_garnet": 20,
        "iqm_emerald": 54,
        "aqt_ibex_q1": 12,
        "rigetti_cepheus": 107,
        "quera_aquila": 256,
    }
    assert {n: s["qubits"] for n, s in DEVICES.items()} == expected


@pytest.mark.parametrize(
    "device_name, region",
    [
        # The managed simulators use region-less ARNs — they run wherever you call from.
        ("sv1", None),
        ("dm1", None),
        ("tn1", None),
        ("ionq_forte", "us-east-1"),
        ("ionq_forte_enterprise", "us-east-1"),
        ("iqm_garnet", "eu-north-1"),
        ("iqm_emerald", "eu-north-1"),
        ("aqt_ibex_q1", "eu-north-1"),
        ("rigetti_cepheus", "us-west-1"),
        ("quera_aquila", "us-east-1"),
    ],
)
def test_device_region_is_derived_from_the_arn(device_name, region):
    # Derived, never stored: the region is already a fact inside the ARN, and a second copy
    # is a second thing to drift.
    assert device_region(device_name) == region
