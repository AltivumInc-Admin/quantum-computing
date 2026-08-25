"""Notebook-output guard: no committed notebook may carry execution output.

WHY THIS IS A TEST AND NOT JUST A GIT FILTER. Stripping is wired through
nbstripout as a git clean filter, and a clean filter lives in .git/config --
which is NOT versioned and NOT shipped by a clone. Git refuses to let a repo
configure its own filters for good reason (cloning would execute code), so
there is no way to make the filter arrive with the checkout. Every clone starts
with notebook stripping OFF until someone runs `make setup`.

That gap is not theoretical. On 2026-08-25 the configured filter was found
pointing at an interpreter in a checkout that no longer existed:

    /Users/…/delta-centric-dev/quantum/.venv/bin/python3: No such file …
    fatal: unable to read files to diff

`nbstripout --install` had baked an absolute path into .git/config, and it went
stale when the repo moved. For however long that lasted, the only thing
preventing notebook outputs from reaching this PUBLIC repo was luck. Nothing
had leaked -- but nothing would have caught it either.

So the filter is ergonomics; THIS is the guarantee. It is versioned, it runs in
CI on every PR, and it holds regardless of anyone's local git config, their
venv, or whether they ran setup at all.

WHAT COUNTS AS DIRTY. nbstripout clears both `outputs` and `execution_count`,
so either one surviving means the notebook was committed unstripped. Outputs
are the real hazard: they embed run artifacts, absolute paths, credentials
echoed into a cell, and AWS account identifiers. execution_count alone is
harmless in itself but is the same signal, and letting it through would mean
this test could not simply assert "the filter ran".
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=REPO_ROOT, capture_output=True, text=True, check=True
    ).stdout


def _notebooks() -> list[str]:
    """Notebooks GIT TRACKS -- not whatever happens to sit on disk.

    A working-tree scan is the wrong instrument twice over. It sweeps up build
    output (web/ ships ~149 JupyterLite notebooks) and any worktrees under
    .claude/, none of which this repo strips. Worse, running a lesson in
    JupyterLab writes outputs straight into the file, so a working-tree
    assertion fails for anyone actually USING the curriculum -- while their
    commit would still be clean, because the filter strips on the way in. A
    guard that cries wolf during normal work is a guard someone deletes.
    """
    out = _git("ls-files", "-z", "*.ipynb")
    return sorted(p for p in out.split("\0") if p)


def _dirty_cells(rel_path: str) -> list[str]:
    """Inspect the INDEX blob -- the bytes that would actually be committed.

    `git cat-file blob :path` reads the staged content, which is post-clean-
    filter. That is precisely the invariant: not "no notebook on my disk has
    outputs" but "no notebook ENTERS the repo with outputs".
    """
    try:
        raw = subprocess.run(
            ["git", "cat-file", "blob", f":{rel_path}"],
            cwd=REPO_ROOT,
            capture_output=True,
            check=True,
        ).stdout
        nb = json.loads(raw)
    except subprocess.CalledProcessError as err:  # pragma: no cover - index desync
        raise AssertionError(f"{rel_path} is tracked but unreadable from the index: {err}") from err
    except (json.JSONDecodeError, UnicodeDecodeError) as err:
        raise AssertionError(f"{rel_path} is not readable JSON: {err}") from err

    problems = []
    for i, cell in enumerate(nb.get("cells", [])):
        if cell.get("cell_type") != "code":
            continue
        if cell.get("outputs"):
            kinds = {o.get("output_type", "?") for o in cell["outputs"]}
            problems.append(f"cell {i}: {len(cell['outputs'])} output(s) {sorted(kinds)}")
        if cell.get("execution_count") is not None:
            problems.append(f"cell {i}: execution_count={cell['execution_count']}")
    return problems


def test_repo_has_notebooks() -> None:
    """Guard the guard: a glob that silently matches nothing proves nothing."""
    assert len(_notebooks()) > 20, "expected the curriculum's notebooks to be found"


@pytest.mark.parametrize("rel_path", _notebooks())
def test_notebook_carries_no_output(rel_path: str) -> None:
    problems = _dirty_cells(rel_path)
    assert not problems, (
        f"{rel_path} would be committed with execution state:\n  "
        + "\n  ".join(problems)
        + "\n\nOutputs must never be committed: they embed run artifacts, absolute "
        "paths and account identifiers into a PUBLIC repo.\n"
        f"Fix:  make git-filters   (wires the strip filter)\n"
        f"then: python -m nbstripout {rel_path} && git add {rel_path}"
    )
