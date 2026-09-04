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
# Every row carries the fleet facts the curriculum teaches — `paradigm`, `qubits`,
# `native_gates`, `connectivity` — alongside the operational ones. They are descriptive,
# not load-bearing for dispatch, but they are verified: see the fact-sheet note below.
#
# `status` is ONLINE / OFFLINE / RETIRED, mirroring Braket's own `deviceStatus`, and it is
# what makes a device DISPATCHABLE. run_circuit refuses anything that is not ONLINE, before
# any cost estimate is printed and before any AwsDevice is constructed. A non-ONLINE device
# deliberately STAYS in this table rather than being deleted: the curriculum teaches that
# managed simulators and QPUs get retired, and a learner who names one should be told what
# happened to it, not told it never existed. (IonQ Aria was handled by deletion before this
# concept existed, which is why "ionq_aria" now only survives as an "Unknown device" test.)
# OFFLINE is reversible (calibration, maintenance); RETIRED is not. Re-check with
# `make devices`, which prints the live status column from list_available_devices().
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
#                  NOTE: the real spend boundary is the ledger's hard caps, not the
#                  client-authored progress gate — see LIFETIME_CAP_MICROS /
#                  DAILY_CAP_MICROS in lambda/qpu/qpu-core.mjs. The $2.50 per-user
#                  lifetime allowance was WITHDRAWN on 2026-07-28: learners now fund
#                  hardware runs from their own credit wallet, so the surviving hard cap
#                  is the $15/day global one. Accounts that already hold a stamped cap
#                  keep it (if_not_exists), which is why the figure still appears in
#                  lambda/qpu/__fixtures__/hardware-ladder.json.
#
# min_shots / max_shots are the SERVICE's per-task shot bounds. Every value below was read
# from the device's own live `service.shotsRange` (`aws braket get-device`, 2026-09-04) and
# cross-checked against the Braket quotas page ("Additional quotas and limits":
# https://docs.aws.amazon.com/braket/latest/developerguide/braket-quotas.html):
#   SV1, DM1 ................ doc says max 50,000; the live API reports [0, 100000]. We keep
#                             the DOCUMENTED 50,000 — it is the conservative direction, and a
#                             submission rejected too early costs a learner nothing, whereas
#                             the reverse prints a dollar figure for a task Braket refuses.
#                             Do not "fix" these toward the API value.
#   IQM Garnet / Emerald .... max 20,000  (API and doc agree)
#   AQT IBEX Q1 ............. max 2,000   (API and doc agree)
#   Rigetti Cepheus ......... max 50,000 per the doc; the live API also reports a MINIMUM of
#                             10, which the doc does not state
#   QuEra Aquila ............ max 1,000   (API and doc agree)
#   every IonQ device ....... MINIMUM 100 shots per on-demand task (2,500 for an
#                             error-mitigation task, which this library never submits) and a
#                             MAXIMUM of 5,000, which the quotas page does not state but the
#                             live shotsRange does. IonQ also caps a circuit at 2,000 gates
#                             on demand (5,000 under reservation) — not modeled here.
#   TN1 ..................... [1, 1000] live. RETIRED, so nothing can be submitted anyway;
#                             recorded for the record rather than relied upon.
# run_circuit validates against these, so the cost estimate it prints is only ever
# printed for a submission the service will actually accept.
#
# Fleet verified 2026-09-04 by `aws braket search-devices` across all five Braket regions
# plus `aws braket get-device` per device. TN1 is RETIRED everywhere it is still listed;
# Forte-1 is OFFLINE (reversible), not retired; Forte Enterprise 1, IQM Emerald, AQT
# IBEX Q1 and Rigetti Cepheus-1-108Q are ONLINE and were adopted on that basis.
DEVICES = {
    "sv1": {
        "arn": "arn:aws:braket:::device/quantum-simulator/amazon/sv1",
        "provider": "SV1",
        "status": "ONLINE",
        "paradigm": "gate-model simulator (state vector, exact)",
        "qubits": 34,
        "native_gates": None,  # a simulator supports the full gate set, not a native basis
        "connectivity": "all-to-all (simulated)",
        "gate_capable": True,
        "allowlist": False,
        "max_shots": 50_000,
    },
    "dm1": {
        "arn": "arn:aws:braket:::device/quantum-simulator/amazon/dm1",
        "provider": "DM1",
        "status": "ONLINE",
        "paradigm": "gate-model simulator (density matrix, models noise)",
        "qubits": 17,
        "native_gates": None,
        "connectivity": "all-to-all (simulated)",
        "gate_capable": True,
        "allowlist": False,
        "max_shots": 50_000,
    },
    # TN1 was RETIRED by AWS in every region that listed it (us-east-1, us-west-2,
    # eu-west-2). It is kept here — undispatchable but visible — because the four-rung
    # simulator ladder (Local -> SV1 -> DM1 -> TN1) is a lesson, and "this rung was retired"
    # is part of it. cost.py keeps the $0.275/min rate for the same reason, flagged via
    # cost.RETIRED_PROVIDERS so no estimate can read as a live quote.
    "tn1": {
        "arn": "arn:aws:braket:::device/quantum-simulator/amazon/tn1",
        "provider": "TN1",
        "status": "RETIRED",
        "paradigm": "gate-model simulator (tensor network)",
        "qubits": 50,
        "native_gates": None,
        "connectivity": "all-to-all (simulated)",
        "gate_capable": True,
        "allowlist": False,
        "max_shots": 1_000,
    },
    # IonQ Aria and Harmony are retired (deleted from this table before the `status`
    # concept existed). Forte-1 is OFFLINE as of 2026-08-24 — a reversible operational
    # state, NOT a retirement — and Forte Enterprise 1 is its ONLINE twin: same 36 qubits,
    # same native gate set, same all-to-all topology, same rates, same shot bounds. The
    # only differences are the ARN and the physical site (Maryland vs Basel).
    "ionq_forte": {
        "arn": "arn:aws:braket:us-east-1::device/qpu/ionq/Forte-1",
        "provider": "IonQ",
        "status": "OFFLINE",
        "paradigm": "gate-model QPU (trapped ion)",
        "qubits": 36,
        "native_gates": ("GPI", "GPI2", "ZZ"),
        "connectivity": "all-to-all",
        "gate_capable": True,
        "allowlist": False,
        "min_shots": 100,
        "max_shots": 5_000,
    },
    "ionq_forte_enterprise": {
        "arn": "arn:aws:braket:us-east-1::device/qpu/ionq/Forte-Enterprise-1",
        "provider": "IonQ",
        "status": "ONLINE",
        "paradigm": "gate-model QPU (trapped ion)",
        "qubits": 36,
        "native_gates": ("GPI", "GPI2", "ZZ"),
        "connectivity": "all-to-all",
        "gate_capable": True,
        "allowlist": False,
        "min_shots": 100,
        "max_shots": 5_000,
    },
    "iqm_garnet": {
        "arn": "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet",
        "provider": "IQM",
        "status": "ONLINE",
        "paradigm": "gate-model QPU (superconducting)",
        "qubits": 20,
        "native_gates": ("cz", "prx", "cc_prx", "measure_ff", "barrier"),
        "connectivity": "lattice (20 nodes, 30 undirected edges; qubit indices 1..20)",
        "gate_capable": True,
        "allowlist": True,
        "max_shots": 20_000,
    },
    # Emerald bills at a DIFFERENT per-shot rate from Garnet, so it carries its own
    # cost.PRICING key. Folding it back under "IQM" would price every Emerald run at
    # Garnet's rate — see the note above PRICING in lib/utils/cost.py.
    "iqm_emerald": {
        "arn": "arn:aws:braket:eu-north-1::device/qpu/iqm/Emerald",
        "provider": "IQM_Emerald",
        "status": "ONLINE",
        "paradigm": "gate-model QPU (superconducting)",
        "qubits": 54,
        "native_gates": ("cz", "prx", "cc_prx", "measure_ff", "barrier"),
        "connectivity": "lattice (54 nodes, 85 undirected edges; qubit indices 1..54)",
        "gate_capable": True,
        "allowlist": False,
        "max_shots": 20_000,
    },
    # AQT is a provider — and a site (Innsbruck) — the curriculum had never carried before
    # 2026-09-04. Note the ARN spells the device "Ibex-Q1" while Braket's deviceName is
    # "IBEX Q1" and the Price List calls it "IBEX-Q1"; the ARN is the only spelling that
    # matters to the SDK. Its capabilities report fullyConnected=true with an EMPTY
    # connectivityGraph, so anything that counts edges by walking the graph gets 0 here
    # while IonQ's fully-connected devices do populate theirs.
    "aqt_ibex_q1": {
        "arn": "arn:aws:braket:eu-north-1::device/qpu/aqt/Ibex-Q1",
        "provider": "AQT",
        "status": "ONLINE",
        "paradigm": "gate-model QPU (trapped ion)",
        "qubits": 12,
        "native_gates": ("prx", "xx", "rz"),
        "connectivity": "all-to-all",
        "gate_capable": True,
        "allowlist": False,
        "max_shots": 2_000,
    },
    # Rigetti was "reference pricing only" in cost.py for as long as no Rigetti device was
    # dispatchable. Cepheus-1-108Q is ONLINE in us-west-1, so that carve-out is over and
    # lib.hardware DOES now dispatch to Rigetti. The rate needed no change.
    #
    # Two traps in this device's own data, both verified from the live capabilities: it
    # reports 107 qubits despite the "108Q" in its name, and its connectivity graph is
    # 0-indexed and NON-contiguous — indices span 0..107 with index 8 absent. Code that assumes
    # range(qubits) will address a qubit this machine does not have.
    "rigetti_cepheus": {
        "arn": "arn:aws:braket:us-west-1::device/qpu/rigetti/Cepheus-1-108Q",
        "provider": "Rigetti",
        "status": "ONLINE",
        "paradigm": "gate-model QPU (superconducting)",
        "qubits": 107,
        "native_gates": ("rx", "rz", "cz", "barrier"),
        "connectivity": "lattice (107 nodes, 193 undirected edges; indices 0..107, index 8 absent)",
        "gate_capable": True,
        "allowlist": False,
        "min_shots": 10,
        "max_shots": 50_000,
    },
    "quera_aquila": {
        "arn": "arn:aws:braket:us-east-1::device/qpu/quera/Aquila",
        "provider": "QuEra",
        "status": "ONLINE",
        "paradigm": "analog Hamiltonian simulation (neutral atom)",
        "qubits": 256,
        "native_gates": None,  # analog: the only action is braket.ir.ahs.program
        "connectivity": "n/a (analog register geometry, not a gate graph)",
        "gate_capable": False,  # analog Hamiltonian device — cannot run gate circuits
        "allowlist": False,
        "max_shots": 1_000,
    },
}

# The statuses a DEVICES row may declare, mirroring Braket's own `deviceStatus`. Only
# ONLINE is dispatchable; OFFLINE is reversible and RETIRED is not.
DEVICE_STATUSES = ("ONLINE", "OFFLINE", "RETIRED")

# Backwards-compatible view (publicly exported via lib.hardware; used by tests/notebooks).
DEVICE_ARNS = {name: spec["arn"] for name, spec in DEVICES.items()}


def device_status(device_name: str) -> str:
    """``ONLINE`` / ``OFFLINE`` / ``RETIRED`` for ``device_name``, from the DEVICES row.

    Defaults to ONLINE for a row that declares none — matching the ``gate_capable``
    default-permissive idiom — but ``tests/test_devices.py`` requires every real row to
    declare one explicitly, so the default can only ever be reached by a monkeypatched or
    hand-built row.
    """
    return _device_spec(device_name).get("status", "ONLINE")


def dispatchable_devices() -> list[str]:
    """Short-names Braket will actually accept a task for.

    A row with a non-ONLINE status stays in DEVICES so the curriculum can teach the machine
    and what happened to it, but ``run_circuit`` refuses to submit to it. This is the list
    that refusal names.
    """
    return [n for n, s in DEVICES.items() if s.get("status", "ONLINE") == "ONLINE"]


def device_region(device_name: str) -> str | None:
    """The AWS region in ``device_name``'s ARN, or ``None`` for a region-less ARN.

    Derived rather than stored: the region is already a fact inside the ARN, and a second
    copy is a second thing to drift. The managed simulators (SV1/DM1/TN1) use region-less
    ARNs of the form ``arn:aws:braket:::device/...`` because they run in whichever region
    you call from — hence ``None``, not a lie about a home region.
    """
    region = _device_spec(device_name)["arn"].split(":")[3]
    return region or None


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


# Coarse fallback ceiling for a device whose row carries no `max_shots`. As of 2026-09-04
# every row declares its own cap and every one of them is tighter than this, so this bound
# binds nowhere today — it is a backstop for a future row added without one, not the real
# guardrail. tests/test_devices.py asserts the "tighter than the fallback" property.
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
    rule: it validates the device name, its Braket status, its gate paradigm and
    ``shots``, prints an estimated-cost warning, and only then submits — so a
    circuit never reaches a real QPU/managed simulator without a visible cost
    notice. All gating happens before the AwsDevice is constructed, so a bad
    request fails fast with no network/credentials.

    A device whose row is not ONLINE (RETIRED like TN1, or OFFLINE like IonQ
    Forte-1) is refused outright, before any cost estimate is printed. Its row is
    still readable — ``DEVICES``, ``shot_bounds`` and ``get_device`` all keep
    working — so the curriculum can inspect and teach a machine it cannot run on.

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
        # Status goes second, immediately after the name: a device Braket will not accept a
        # task for cannot be made acceptable by fixing the shots, the S3 bucket or anything
        # else, so saying so first is both the cheapest and the most useful failure. Placing
        # it above the cost gate also guarantees no dollar figure is ever printed for a
        # machine that cannot run — see cost.RETIRED_PROVIDERS for the same rule on the
        # pricing side.
        status = spec.get("status", "ONLINE")
        if status != "ONLINE":
            detail = (
                "Amazon Braket retired it; it is kept in DEVICES so the curriculum can still "
                "teach the device and its retirement, but nothing can be submitted to it."
                if status == "RETIRED"
                else "It is temporarily offline (calibration or maintenance) and may return — "
                "re-check with `make devices`."
            )
            raise ValueError(
                f"{device_name} is {status} on Amazon Braket and cannot accept tasks. "
                f"{detail} Dispatchable devices: {dispatchable_devices()}"
            )
        if not spec.get("gate_capable", True):
            raise ValueError(
                f"{device_name} is an analog Hamiltonian device and cannot run gate circuits. "
                "Gate-capable devices you can dispatch to: "
                f"{[n for n in dispatchable_devices() if DEVICES[n].get('gate_capable', True)]}"
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
