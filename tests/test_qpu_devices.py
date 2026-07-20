"""Phase-4 QPU-submit allowlist + a cross-language pricing-drift guard.

The server-side spend ledger (lambda/qpu) charges in integer micro-dollars using
constants that MUST match lib.utils.cost.PRICING["IQM"]. There is no runtime link
between the Python cost model and the Node Lambda, so this test is the guard: if
either side is repriced without the other, CI fails here.
"""

import re
from pathlib import Path

from lib.hardware import (
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


def _string_const(src: str, name: str) -> str:
    m = re.search(rf'export const {name} = "([^"]+)";', src)
    assert m, f"{name} not found in qpu-core.mjs"
    return m.group(1)


def test_lambda_device_identity_matches_the_single_source():
    """lib/hardware/devices.py declares DEVICES the single source of truth for every
    billable device's ARN, but the Lambda that actually submits carries its own
    hand-written copy of the short-name, ARN and region and hard-rejects anything else
    (`if (device !== DEVICE)`). The sibling guard below covers the PRICES; without this
    one, re-ARNing or re-allowlisting a device leaves CI green while the Lambda keeps
    submitting to the old machine.
    """
    src = QPU_CORE.read_text()

    device = _string_const(src, "DEVICE")
    assert device in allowlisted_gate_devices(), (
        f"qpu-core.mjs submits to {device!r}, which is not an allowlisted gate device"
    )
    assert device == cheapest_allowlisted_device(), (
        f"qpu-core.mjs submits to {device!r} but cheapest_allowlisted_device() picked "
        f"{cheapest_allowlisted_device()!r} — move the Lambda's DEVICE/DEVICE_ARN/"
        f"DEVICE_REGION constants together with the allowlist"
    )

    arn = _string_const(src, "DEVICE_ARN")
    assert arn == DEVICES[device]["arn"], (
        f"qpu-core.mjs DEVICE_ARN {arn!r} != DEVICES[{device!r}]['arn'] {DEVICES[device]['arn']!r}"
    )

    # The region is a third copy of a fact already inside the ARN
    # (arn:aws:braket:<region>::device/...), so derive it and pin the two together.
    region = _string_const(src, "DEVICE_REGION")
    assert region == arn.split(":")[3], (
        f"qpu-core.mjs DEVICE_REGION {region!r} disagrees with the region in {arn!r}"
    )


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
