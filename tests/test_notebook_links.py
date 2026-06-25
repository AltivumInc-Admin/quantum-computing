"""Executable contract: every relative cross-reference in a curriculum
notebook's markdown cells must resolve to a file that exists.

These relative ``.ipynb`` / ``.md`` links are the primary cross-notebook
navigation inside the JupyterLite lab (34/45 notebooks carry a "Next" link),
so a typo'd target is a live 404 with zero other coverage. The scan is cheap
and deterministic and runs in the Python CI job (``make test``).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent

# [display text](target)
_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
_SKIP_PREFIXES = ("http://", "https://", "mailto:", "#")
_CHECKED_SUFFIXES = (".ipynb", ".md")


def _relative_links() -> list[tuple[Path, str]]:
    pairs: list[tuple[Path, str]] = []
    for nb_path in sorted(REPO_ROOT.glob("0*/notebooks/*.ipynb")):
        nb = json.loads(nb_path.read_text(encoding="utf-8"))
        for cell in nb.get("cells", []):
            if cell.get("cell_type") != "markdown":
                continue
            source = "".join(cell.get("source", []))
            for match in _LINK_RE.finditer(source):
                target = match.group(1).strip()
                if target.lower().startswith(_SKIP_PREFIXES):
                    continue
                clean = target.split("#", 1)[0]
                if not clean or not clean.endswith(_CHECKED_SUFFIXES):
                    continue
                pairs.append((nb_path, clean))
    return pairs


_LINKS = _relative_links()
_IDS = [f"{nb.relative_to(REPO_ROOT).as_posix()} -> {link}" for nb, link in _LINKS]


def test_found_notebook_links():
    """Guard against a discovery regression silently emptying the suite."""
    assert _LINKS, "no relative .ipynb/.md links discovered in 0*/notebooks/*.ipynb"


@pytest.mark.parametrize(("nb_path", "link"), _LINKS, ids=_IDS)
def test_relative_notebook_link_resolves(nb_path: Path, link: str):
    """Every relative cross-reference must point at a file that exists."""
    target = (nb_path.parent / link).resolve()
    assert target.exists(), (
        f"{nb_path.relative_to(REPO_ROOT).as_posix()} links to '{link}', "
        f"but {target.relative_to(REPO_ROOT) if target.is_relative_to(REPO_ROOT) else target} "
        f"does not exist (dead in-lab navigation link)."
    )
