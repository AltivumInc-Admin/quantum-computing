"""Prose-rate drift guard: every learner-facing dollar figure must match PRICING.

The cost subsystem is parity-locked (cost.py <-> cost.json <-> cost.ts), but
prose is not code: GUIDEs, notebooks, README, and CLAUDE.md quote rates and
worked examples ("$0.30 + 1,000 x $0.01 = $10.30") as literal text. If AWS
reprices and PRICING is updated, every lock goes green while the curriculum
keeps teaching the old numbers. This test closes that class: it derives the
set of currently-valid dollar amounts from lib.utils.cost.PRICING (plus the
worked examples, recomputed) and fails on any dollar figure in the prose
corpus that is not derivable from the live table.

Extraction has to separate currency from LaTeX: GUIDE prose writes dollars
either escaped inside math (``\\$0.01``) or plain outside it (``$0.30/min``),
while unescaped ``$...$`` spans are math (``$2^n$``, ``$0.74$`` Angstrom). The
pipeline: protect escaped dollars, strip inline-math spans, then scan both the
protected and the stripped text.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from lib.utils.cost import PRICING, estimate_cost

REPO_ROOT = Path(__file__).resolve().parent.parent

# Learner-facing prose surfaces. (PRODUCT.md / docs/ are internal design docs.)
GUIDES = sorted(REPO_ROOT.glob("0*-*/GUIDE.md"))
NOTEBOOKS = sorted(REPO_ROOT.glob("0*-*/notebooks/*.ipynb"))
EXTRA = [REPO_ROOT / "README.md", REPO_ROOT / "CLAUDE.md"]

# Worked examples the prose states; recomputed from PRICING so a repricing
# invalidates the stale figure in prose (that is the whole point).
WORKED_EXAMPLES = [
    estimate_cost("QuEra", shots=100),  # $1.30 — 04-quera-analog notebook (QuEra $0.01/shot)
    estimate_cost("IonQ", shots=1000),  # $80.30 — 02-hardware worked example (Forte $0.08/shot)
    estimate_cost("IonQ", shots=2000),  # $160.30 — the qcostestimate Rep
    50 * estimate_cost("IonQ", shots=1000),  # $4,015 — 06 production-patterns job total
    # Rep-corpus hint arithmetic (the qcostestimate Reps' worked sub-totals);
    # each is derived from PRICING so a repricing invalidates the prose.
    4 * PRICING["IonQ"]["per_task"],  # $1.20 — 02-hardware split-run: 4 saved task fees
    400 * PRICING["IQM"]["per_task"],  # $120 — 06 full-job: 400 tasks, fee stream alone
    400 * 100 * PRICING["IQM"]["per_shot"],  # $58 — 06 full-job: shot stream alone
    300 * estimate_cost("IonQ", shots=200),  # $4,890 — 06 provider-swap: the IonQ baseline
    300 * PRICING["IQM"]["per_task"],  # $90 — 06 provider-swap: task fees (any provider)
    200 * PRICING["IQM"]["per_shot"],  # $0.29 — 06 provider-swap: per-task IQM shot cost
    300 * 200 * PRICING["IonQ"]["per_shot"],  # $4,800 — 06 provider-swap: IonQ shot stream
    300 * 200 * PRICING["IQM"]["per_shot"],  # $87 — 06 provider-swap: IQM shot stream
]

# Dollar figures that are legitimately NOT Braket pricing. Keep this list
# short and explicit — every entry is a documented exception.
VALID_EXTRA = {
    # SageMaker instance-hour figures quoted in 06-hybrid-jobs (source of truth
    # is web/src/components/quantum/hybrid.ts INSTANCES — TS-only, so pinned
    # here by hand; update BOTH if the instance table changes).
    0.10,
    3.85,
    0.115,  # ml.m5.large
    # Free ("$0", "$0.00" cost lines).
    0.0,
}

# (filename, amount) pairs allowed per file — non-pricing dollars.
ALLOWLIST = {
    # A probability worked example: "heads pays $1 and tails costs $0.50".
    ("03-probability-and-measurement.ipynb", 1.0),
    ("03-probability-and-measurement.ipynb", 0.50),
    # The amplitude-estimation toy binary asset ($1 notional, ±$0.05 tolerance).
    ("06-amplitude-estimation.ipynb", 1.0),
    ("06-amplitude-estimation.ipynb", 0.05),
    # A rough "~$0.02 on the simulator" comparison (SV1 seconds-of-compute; an
    # order-of-magnitude figure, not derivable exactly from a rate).
    ("07-production-patterns.ipynb", 0.02),
    # A compute-instance cost illustration in the custom-containers job exercise:
    # "one hour on a $1/hr instance is $1.00" — a round teaching figure for
    # estimate_job_cost, not a Braket rate.
    ("05-custom-containers.ipynb", 1.0),
}

# An amount followed by k/M or more digits is not a literal price ("$10k/seat").
# Currency amounts, with optional comma thousands separators ($4,890.00). The
# negative lookahead still rejects $2^n / $5k / a run of bare digits.
AMOUNT = re.compile(r"[§$](\d{1,3}(?:,\d{3})*(?:\.\d+)?)(?![\dkKmM])")
INLINE_MATH = re.compile(r"\$[^$\n]{1,200}\$")
# A candidate $...$ span containing consecutive words is prose whose opening $
# is currency and whose closing $ is the NEXT span's opener ("$0.30 per task;
# the math is $..."), not LaTeX — real inline math here never reads like a
# sentence.
PROSE_LIKE = re.compile(r"[A-Za-z]{3,}\s+[A-Za-z]{2,}")


def _strip_inline_math(text: str) -> str:
    return INLINE_MATH.sub(lambda m: " " if not PROSE_LIKE.search(m.group(0)) else m.group(0), text)


def valid_amounts() -> set[float]:
    amounts = set(VALID_EXTRA) | {round(v, 10) for v in WORKED_EXAMPLES}
    for rates in PRICING.values():
        amounts.update(round(v, 10) for v in rates.values())
    return amounts


def extract_amounts(text: str) -> list[tuple[float, str]]:
    """All currency amounts in `text` with a context snippet for each."""
    # Notebook JSON double-escapes: markdown \$ arrives as \\$ in the raw file.
    protected = text.replace("\\\\$", "§").replace("\\$", "§")
    hits: list[tuple[float, str]] = []

    def collect(source: str, marker: str) -> None:
        for m in AMOUNT.finditer(source):
            if not m.group(0).startswith(marker):
                continue
            start = max(0, m.start() - 40)
            amount = float(m.group(1).replace(",", ""))  # strip thousands separators
            hits.append((round(amount, 10), source[start : m.end() + 40]))

    # Escaped dollars are currency wherever they appear (even inside math).
    collect(protected, "§")
    # Plain dollars count only OUTSIDE inline math ($2^n$, $0.74$ Angstrom...).
    collect(_strip_inline_math(protected), "$")
    return hits


def corpus() -> list[tuple[Path, str]]:
    files = []
    for p in [*GUIDES, *NOTEBOOKS, *EXTRA]:
        raw = p.read_text(encoding="utf-8")
        if p.suffix == ".ipynb":
            # Scan only cell sources — stray metadata can't produce prose.
            nb = json.loads(raw)
            raw = "\n".join("".join(c.get("source", [])) for c in nb.get("cells", []))
        files.append((p, raw))
    return files


def test_corpus_is_nonempty_and_extraction_sees_known_figures():
    """Canary: an extractor regression must not silently pass by matching nothing."""
    assert len(GUIDES) >= 7 and len(NOTEBOOKS) >= 20
    all_hits = [a for _, text in corpus() for a, _ in extract_amounts(text)]
    # The corpus is known to quote the flat task fee and the IonQ Forte shot
    # rate many times ($0.01 is now only QuEra's rate, quoted less often).
    assert all_hits.count(0.30) >= 5
    assert all_hits.count(0.08) >= 4


def test_extractor_separates_currency_from_latex_math():
    text = (
        "memory doubles: $2^n$ amplitudes. The minimum sits near $0.74$ Angstrom.\n"
        "QPUs charge a flat $0.30 per task; the math is $0.30 + 1{,}000 \\times \\$0.01 = \\$10.30$."
    )
    amounts = sorted(a for a, _ in extract_amounts(text))
    # Both prose $0.30s survive (the "per task" span is prose, not math);
    # the escaped in-math currency is harvested; $2^n$ and $0.74$ are not.
    assert amounts == [0.01, 0.30, 0.30, 10.30]


def test_every_prose_dollar_figure_matches_live_pricing():
    valid = valid_amounts()
    stale: list[str] = []
    for path, text in corpus():
        for amount, context in extract_amounts(text):
            if amount in valid:
                continue
            if (path.name, amount) in {(n, a) for n, a in ALLOWLIST if n == path.name}:
                continue
            stale.append(f"{path.relative_to(REPO_ROOT)}: ${amount:g} in ...{context!r}...")
    assert not stale, (
        "Dollar figures in learner-facing prose do not match lib.utils.cost.PRICING "
        "(repriced without updating the prose, or an unregistered example?):\n  "
        + "\n  ".join(stale)
    )
