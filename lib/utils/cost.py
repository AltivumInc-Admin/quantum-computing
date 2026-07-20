"""Cost estimation utilities for Amazon Braket."""

import math

# On-demand rates verified against https://aws.amazon.com/braket/pricing/ (2026-07-06).
# The IonQ figure is the LIVE device, Forte ($0.08/shot): Aria is retired and its old
# $0.01 rate under-quoted a real IonQ run by ~8x. Keep this in lockstep with the web
# mirror in web/src/components/quantum/cost.ts (the pricing single source of truth).
PRICING = {
    "IonQ": {"per_task": 0.30, "per_shot": 0.08},  # IonQ Forte (Aria retired)
    "IQM": {"per_task": 0.30, "per_shot": 0.00145},  # IQM Garnet
    "QuEra": {"per_task": 0.30, "per_shot": 0.01},  # QuEra Aquila (analog only)
    # Rigetti is reference pricing only — no Rigetti device is currently dispatchable via
    # lib.hardware.DEVICES (kept for the cost estimator script / teaching reference).
    "Rigetti": {"per_task": 0.30, "per_shot": 0.000425},  # Rigetti Cepheus
    "SV1": {"per_minute": 0.075},
    "DM1": {"per_minute": 0.075},
    "TN1": {"per_minute": 0.275},
    "LocalSimulator": {"per_minute": 0.0},
}


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
    """Estimate the cost of running a quantum task."""
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
    """Generate a human-readable cost warning, honest to each cost model."""
    cost = estimate_cost(provider, shots, estimated_minutes)  # validates provider + inputs
    pricing = PRICING[provider]
    # Any zero-rate per-minute provider — today that is only LocalSimulator. (SV1 at 0
    # estimated minutes also costs $0, but its rate is non-zero, so it is not mislabeled
    # as local execution; see test_zero_minute_simulator_not_labeled_local.)
    if pricing.get("per_minute") == 0.0:
        return f"[{provider}] No cost (local execution)"
    if is_per_shot(provider):  # per-shot QPUs — shots drive the cost
        return f"[{provider}] Estimated cost: ${cost:.4f} ({shots} shots + 1 task)"
    # per-minute managed simulators (SV1/DM1/TN1) — runtime drives the cost, shots do not
    return (
        f"[{provider}] Estimated cost: ${cost:.4f} "
        f"(~{estimated_minutes:.1f} min @ ${pricing['per_minute']:.3f}/min)"
    )
