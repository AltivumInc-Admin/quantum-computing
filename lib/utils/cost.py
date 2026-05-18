"""Cost estimation utilities for Amazon Braket."""

PRICING = {
    "IonQ": {"per_task": 0.30, "per_shot": 0.01},
    "IQM": {"per_task": 0.30, "per_shot": 0.00145},
    "QuEra": {"per_task": 0.30, "per_shot": 0.01},
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
    pricing = PRICING[provider]
    if "per_shot" in pricing:
        return pricing["per_task"] + pricing["per_shot"] * shots
    elif "per_minute" in pricing:
        return pricing["per_minute"] * estimated_minutes
    return 0.0


def format_cost_warning(provider: str, shots: int = 1000, estimated_minutes: float = 1.0) -> str:
    """Generate a human-readable cost warning string."""
    cost = estimate_cost(provider, shots, estimated_minutes)
    if cost == 0.0:
        return f"[{provider}] No cost (local execution)"
    return f"[{provider}] Estimated cost: ${cost:.4f} ({shots} shots, ~{estimated_minutes:.1f} min)"
