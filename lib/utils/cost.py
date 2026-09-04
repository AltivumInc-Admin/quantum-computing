"""Cost estimation utilities for Amazon Braket.

These are OUR development costs — what AWS charges this account to run a task. They are
not customer-facing prices; those live in web/src/lib/pricing.ts and are a separate
decision entirely.
"""

import math

# On-demand rates verified 2026-09-04 against BOTH the Amazon Braket Price List API
# (`aws pricing get-products --service-code AmazonBraket`, product families "Quantum Task",
# "Quantum Task-Shot" and "Simulator Task") AND each device's live
# `deviceCapabilities.service.deviceCost` field from `aws braket get-device`. The two
# sources agree exactly on every device below. Keep this in lockstep with the web mirror in
# web/src/components/quantum/cost.ts (regenerate the shared fixture with
# `python scripts/gen_cost_fixture.py` after any edit here).
#
# KEYS ARE PER-RATE, NOT PER-VENDOR — and key ORDER is load-bearing, because
# scripts/gen_cost_fixture.py walks this dict to build the probe table the TS side is
# pinned against. A key is the vendor name where that vendor bills one rate across its
# fleet (both IonQ Forte machines are $0.08/shot; Rigetti's rate is the same whichever
# Rigetti chip is live), and vendor_device where it bills more than one. IQM is the
# exception that forced a second key: Garnet bills $0.00145/shot and Emerald $0.0016/shot,
# so a single "IQM" key would quote every Emerald run at Garnet's rate and understate the
# true cost by ~10%. lib.hardware.DEVICES names the key each device bills under, so the
# device -> rate mapping is single-sourced and cannot drift.
PRICING = {
    # Forte-1 and Forte Enterprise 1 carry identical per-task and per-shot rates.
    "IonQ": {"per_task": 0.30, "per_shot": 0.08},
    "IQM": {"per_task": 0.30, "per_shot": 0.00145},  # IQM Garnet (20 qubits, eu-north-1)
    # Emerald is a DIFFERENT rate from Garnet — do not fold these two keys back together.
    "IQM_Emerald": {"per_task": 0.30, "per_shot": 0.0016},  # IQM Emerald (54q, eu-north-1)
    "QuEra": {"per_task": 0.30, "per_shot": 0.01},  # QuEra Aquila (analog only)
    "AQT": {"per_task": 0.30, "per_shot": 0.0235},  # AQT IBEX Q1 (12 qubits, eu-north-1)
    # Rigetti is no longer reference-only: Cepheus-1-108Q is ONLINE in us-west-1 and is
    # dispatchable via lib.hardware.DEVICES["rigetti_cepheus"]. The rate below was already
    # correct and needed no change when the device was adopted.
    "Rigetti": {"per_task": 0.30, "per_shot": 0.000425},  # Rigetti Cepheus-1-108Q
    "SV1": {"per_minute": 0.075},
    "DM1": {"per_minute": 0.075},
    # TN1 is RETIRED (see RETIRED_PROVIDERS). Its rate is KEPT so the curriculum can still
    # teach the four-rung simulator ladder and the retirement itself, and so the historical
    # $0.275/min figure stays derivable from this table by tests/test_pricing_prose.py.
    "TN1": {"per_minute": 0.275},
    "LocalSimulator": {"per_minute": 0.0},
}

# Providers whose only device Amazon Braket has RETIRED. The rate stays in PRICING above
# (history is part of the lesson), but every cost string this module produces says RETIRED
# so an estimate can never be mistaken for a live quote, and lib.hardware.run_circuit
# refuses to dispatch to the device at all. Verified against `aws braket search-devices`
# across all five Braket regions on 2026-09-04: TN1 is RETIRED in every region that still
# lists it (us-east-1, us-west-2, eu-west-2) and absent from the other two.
#
# A live Price List SKU is NOT evidence of availability — TN1 still has priced rows in the
# Price List API. Only `deviceStatus` is evidence.
RETIRED_PROVIDERS = frozenset({"TN1"})


def is_retired(provider: str) -> bool:
    """True when ``provider``'s device is retired from Amazon Braket.

    Its rate is still in PRICING for teaching and for historical prose, so a caller that
    prices a device MUST consult this before presenting the number as a live quote.
    """
    if provider not in PRICING:
        raise ValueError(f"Unknown provider: {provider}. Known: {list(PRICING.keys())}")
    return provider in RETIRED_PROVIDERS


def is_per_shot(provider: str) -> bool:
    """True when ``provider`` bills per shot + per task (a QPU), False when it bills per
    minute of runtime (a managed simulator).

    PRICING is a two-shaped table and every consumer has to discriminate the two shapes.
    This is the single place that test lives on the Python side, mirroring ``isPerShot``
    in web/src/components/quantum/cost.ts (which this module is kept in lockstep with).
    """
    if provider not in PRICING:
        raise ValueError(f"Unknown provider: {provider}. Known: {list(PRICING.keys())}")
    return "per_shot" in PRICING[provider]


def estimate_cost(provider: str, shots: int = 1000, estimated_minutes: float = 1.0) -> float:
    """Estimate the cost of running a quantum task.

    A retired provider still returns its historical rate — the arithmetic is what the
    curriculum teaches — but see ``is_retired`` / ``format_cost_warning`` before showing
    the number to anyone: it is not a quote for a run that can happen.
    """
    if provider not in PRICING:
        raise ValueError(f"Unknown provider: {provider}. Known: {list(PRICING.keys())}")
    # Cost is a gate before real spend — a nonsensical input (negative OR non-finite) must
    # fail loudly rather than produce a bogus cost that silently passes the gate (a NaN cost
    # makes any `cost > budget` check False).
    if not math.isfinite(shots):
        raise ValueError(f"shots must be finite (got {shots})")
    if shots < 0:
        raise ValueError(f"shots must be non-negative (got {shots})")
    if not math.isfinite(estimated_minutes):
        raise ValueError(f"estimated_minutes must be finite (got {estimated_minutes})")
    if estimated_minutes < 0:
        raise ValueError(f"estimated_minutes must be non-negative (got {estimated_minutes})")
    pricing = PRICING[provider]
    if is_per_shot(provider):
        return pricing["per_task"] + pricing["per_shot"] * shots
    return pricing["per_minute"] * estimated_minutes


def format_cost_warning(provider: str, shots: int = 1000, estimated_minutes: float = 1.0) -> str:
    """Generate a human-readable cost warning, honest to each cost model.

    A RETIRED provider is labelled as such and its figure is called a *historical* cost,
    never an "Estimated cost" — the phrase this project reserves for a run that can
    actually be submitted and billed.
    """
    cost = estimate_cost(provider, shots, estimated_minutes)  # validates provider + inputs
    pricing = PRICING[provider]
    # Any zero-rate per-minute provider — today that is only LocalSimulator. (SV1 at 0
    # estimated minutes also costs $0, but its rate is non-zero, so it is not mislabeled
    # as local execution; see test_zero_minute_simulator_not_labeled_local.)
    if pricing.get("per_minute") == 0.0:
        return f"[{provider}] No cost (local execution)"
    if is_retired(provider):
        # No "Estimated cost": nothing can be submitted to this device, so quoting a live
        # price for it would be advertising a run the fleet cannot perform.
        detail = (
            f"({shots} shots + 1 task)"
            if is_per_shot(provider)
            else f"(~{estimated_minutes:.1f} min @ ${pricing['per_minute']:.3f}/min)"
        )
        return (
            f"[{provider}] RETIRED from Amazon Braket — no task can be submitted. "
            f"Historical cost: ${cost:.4f} {detail}"
        )
    if is_per_shot(provider):  # per-shot QPUs — shots drive the cost
        return f"[{provider}] Estimated cost: ${cost:.4f} ({shots} shots + 1 task)"
    # per-minute managed simulators (SV1/DM1) — runtime drives the cost, shots do not
    return (
        f"[{provider}] Estimated cost: ${cost:.4f} "
        f"(~{estimated_minutes:.1f} min @ ${pricing['per_minute']:.3f}/min)"
    )
