"""Drift guard: the committed cost-parity fixture must still match lib.utils.cost.

``web/src/components/quantum/__fixtures__/cost.json`` pins the Python pricing
table + expected costs for the TS side to check itself against. cost.test.ts
guards the TS side (cost.ts/hybrid.ts must match the fixture); this guards the
Python side (the fixture must match lib.utils.cost's live table). Together they
lock cost.py <-> cost.json <-> cost.ts, so a pricing change on either side that
is not regenerated into the fixture fails CI here instead of silently letting
the curriculum quote one price and the library another.

Regenerate with: ``.venv/bin/python scripts/gen_cost_fixture.py``
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import gen_cost_fixture as gcf  # noqa: E402

REGEN_HINT = "regenerate with `.venv/bin/python scripts/gen_cost_fixture.py` and commit"


def _committed() -> dict:
    return json.loads(gcf.FIXTURE_PATH.read_text(encoding="utf-8"))


def test_fixture_file_exists_where_the_ts_test_reads_it():
    assert gcf.FIXTURE_PATH.exists(), f"missing cost fixture at {gcf.FIXTURE_PATH}"


def test_pricing_table_matches_lib():
    """Every provider and rate in the fixture must equal lib.utils.cost.PRICING exactly."""
    committed = _committed()
    expected = gcf.build_fixture()
    assert committed["pricing"] == expected["pricing"], f"pricing table drifted — {REGEN_HINT}"


def test_expected_costs_match_lib():
    """Every probe-point cost must equal what estimate_cost currently returns."""
    committed = _committed()
    expected = gcf.build_fixture()
    assert len(committed["expected"]) == len(expected["expected"]), (
        f"probe table shape drifted — {REGEN_HINT}"
    )
    for got, want in zip(committed["expected"], expected["expected"]):
        assert got["provider"] == want["provider"] and got["shots"] == want["shots"], (
            f"probe row drifted — {REGEN_HINT}"
        )
        assert abs(got["cost"] - want["cost"]) < 1e-12, (
            f"cost for {want['provider']} no longer matches lib.utils.cost — {REGEN_HINT}"
        )
