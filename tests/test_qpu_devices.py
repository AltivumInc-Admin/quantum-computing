"""Phase-4 QPU-submit allowlist + a cross-language pricing-drift guard.

The server-side spend ledger (lambda/qpu) charges in integer micro-dollars using
constants that MUST match lib.utils.cost.PRICING["IQM"]. There is no runtime link
between the Python cost model and the Node Lambda, so this test is the guard: if
either side is repriced without the other, CI fails here.
"""

import re
from pathlib import Path

from lib.hardware.devices import (
    DEVICES,
    allowlisted_gate_devices,
    cheapest_allowlisted_device,
)
from lib.utils.cost import PRICING

QPU_CORE = Path(__file__).resolve().parent.parent / "lambda" / "qpu" / "qpu-core.mjs"


def test_iqm_garnet_is_the_only_v1_allowlisted_device():
    assert allowlisted_gate_devices() == ["iqm_garnet"]
    assert cheapest_allowlisted_device() == "iqm_garnet"


def test_quera_is_not_gate_capable_and_ionq_is_not_allowlisted():
    # QuEra Aquila is analog-only — it can never be a gate-circuit QPU.
    assert DEVICES["quera_aquila"]["gate_capable"] is False
    # IonQ Forte is gate-capable but OFF the allowlist (its 2500-shot mitigation
    # floor is unmodeled, so the ledger would under-charge by ~$200).
    assert DEVICES["ionq_forte"]["gate_capable"] is True
    assert DEVICES["ionq_forte"]["allowlist"] is False


def test_every_allowlisted_device_is_gate_capable_and_priced():
    for name in allowlisted_gate_devices():
        spec = DEVICES[name]
        assert spec["gate_capable"] is True
        assert spec["provider"] in PRICING
        assert "per_shot" in PRICING[spec["provider"]]  # a per-shot QPU, not a per-minute sim


def test_lambda_micro_dollar_constants_match_cost_pricing():
    """The lambda/qpu ledger's IQM constants must equal cost.PRICING['IQM'] * 1e6."""
    src = QPU_CORE.read_text()

    def const(name: str) -> int:
        m = re.search(rf"export const {name} = ([0-9_]+);", src)
        assert m, f"{name} not found in qpu-core.mjs"
        return int(m.group(1).replace("_", ""))

    iqm = PRICING["IQM"]
    assert const("IQM_PER_TASK_MICROS") == round(iqm["per_task"] * 1_000_000)
    assert const("IQM_PER_SHOT_MICROS") == round(iqm["per_shot"] * 1_000_000)
    # And the launch-posture caps are exactly the user-approved dollar figures.
    # $2.50 is the SPONSORED lifetime allowance: the platform pays Braket for every
    # learner run, and $2.50 is what the hardware medal ladder (1 run / 3 runs /
    # 1,000 shots) costs to complete -- 3 runs totalling 1,000 shots = $2.35. The
    # ladder and this cap are locked together in lambda/qpu/__fixtures__/
    # hardware-ladder.json; a change on either side must keep every medal earnable.
    assert const("LIFETIME_CAP_MICROS") == 2_500_000  # $2.50
    assert const("DAILY_CAP_MICROS") == 15_000_000  # $15.00
    assert const("MAX_SHOTS") == 1000
