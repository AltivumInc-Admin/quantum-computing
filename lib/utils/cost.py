"""Cost estimation utilities for Amazon Braket."""

import math

PRICING = {
    "IonQ": {"per_task": 0.30, "per_shot": 0.01},
    "IQM": {"per_task": 0.30, "per_shot": 0.00145},
    "QuEra": {"per_task": 0.30, "per_shot": 0.01},
    # Rigetti is reference pricing only — no Rigetti device is currently dispatchable via
    # lib.hardware.DEVICES (kept for the cost estimator script / teaching reference).
    "Rigetti": {"per_task": 0.30, "per_shot": 0.00035},
    "SV1": {"per_minute": 0.075},
    "DM1": {"per_minute": 0.075},
    "TN1": {"per_minute": 0.275},
    "LocalSimulator": {"per_minute": 0.0},
}


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
    if "per_shot" in pricing:
        return pricing["per_task"] + pricing["per_shot"] * shots
    return pricing["per_minute"] * estimated_minutes


def format_cost_warning(provider: str, shots: int = 1000, estimated_minutes: float = 1.0) -> str:
    """Generate a human-readable cost warning, honest to each cost model."""
    cost = estimate_cost(provider, shots, estimated_minutes)  # validates provider + inputs
    pricing = PRICING[provider]
    if pricing.get("per_minute") == 0.0:  # the local simulator (free)
        return f"[{provider}] No cost (local execution)"
    if "per_shot" in pricing:  # per-shot QPUs — shots drive the cost
        return f"[{provider}] Estimated cost: ${cost:.4f} ({shots} shots + 1 task)"
    # per-minute managed simulators (SV1/DM1/TN1) — runtime drives the cost, shots do not
    return (
        f"[{provider}] Estimated cost: ${cost:.4f} "
        f"(~{estimated_minutes:.1f} min @ ${pricing['per_minute']:.3f}/min)"
    )
