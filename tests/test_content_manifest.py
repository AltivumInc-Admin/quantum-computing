"""Tests for the generated content manifest — the single source of truth.

``scripts/validate_runnable.py --write-manifest`` emits
``web/src/lib/content-manifest.json``: the one place the curriculum catalog
(section slugs, titles, notebook counts, per-notebook runnable status, the
qcsim wheel name, and the canonical repo URL) is defined. The web app derives
``sections.ts`` and the "Run in browser" gate from it, so these tests guard the
invariants that keep the four former hand-maintained copies from drifting.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import validate_runnable as vr  # noqa: E402

REPO_URL = "https://github.com/AltivumInc-Admin/quantum-computing"


def test_build_content_manifest_lists_every_section_in_order():
    manifest = vr.build_content_manifest()
    slugs = [s["slug"] for s in manifest["sections"]]
    assert slugs == vr.SECTION_DIRS


def test_section_titles_match_guide_h1():
    """Title is derived from the GUIDE.md H1 so the two can never disagree."""
    manifest = vr.build_content_manifest()
    for section in manifest["sections"]:
        guide = (REPO_ROOT / section["dirName"] / "GUIDE.md").read_text(encoding="utf-8")
        h1 = next(line[2:].strip() for line in guide.splitlines() if line.startswith("# "))
        assert section["title"] == h1


def test_section_notebook_counts_match_disk():
    manifest = vr.build_content_manifest()
    for section in manifest["sections"]:
        nb_dir = REPO_ROOT / section["dirName"] / "notebooks"
        real = len(sorted(nb_dir.glob("*.ipynb"))) if nb_dir.is_dir() else 0
        assert section["notebookCount"] == real
        assert len(section["notebooks"]) == real


def test_runnable_flags_match_the_static_contract():
    """A notebook is runnable in the manifest iff it passes the AST contract."""
    manifest = vr.build_content_manifest()
    runnable_from_sections = {
        f"{s['dirName']}/notebooks/{nb['filename']}"
        for s in manifest["sections"]
        for nb in s["notebooks"]
        if nb["runnable"]
    }
    assert runnable_from_sections == set(vr.build_manifest()["runnable"])


def test_manifest_declares_repo_url_and_wheel():
    manifest = vr.build_content_manifest()
    assert manifest["repoUrl"] == REPO_URL
    assert manifest["wheel"].startswith("qcsim-")
    assert manifest["wheel"].endswith("-py3-none-any.whl")


def test_committed_content_manifest_is_in_sync():
    committed = json.loads(vr.CONTENT_MANIFEST_PATH.read_text(encoding="utf-8"))
    assert committed == vr.build_content_manifest(), (
        "content-manifest.json is stale; regenerate with "
        "`python scripts/validate_runnable.py --write-manifest`"
    )


def test_check_flag_exits_zero_when_manifests_are_in_sync():
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate_runnable.py"), "--check"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
