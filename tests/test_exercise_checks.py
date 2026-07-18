"""Solutions-verification harness for the notebook exercise loop.

The exercise convention (docs/exercise-convention.md) promises three things
this harness enforces end-to-end:

1. **Structure** — every converted notebook's exercises follow the three-cell
   unit exactly: a prompt markdown cell (``### Exercise N`` + two ``<details>``
   hint tiers), a scaffold code cell (first line ``# Exercise N:``), and an
   adjacent check code cell (first line ``# Check Exercise N``), with a
   canonical solution registered for every exercise.
2. **Checks pass with CORRECT answers** — each notebook is executed headlessly
   with its canonical solutions inserted before their check cells and
   ``QL_GRADING_STRICT=1`` set kernel-side, so a wrong solution OR a wrong
   check raises and fails CI.
3. **Checks cannot pass unsolved** — the untouched notebook is executed and
   every check cell must report "not attempted"; a check that succeeds without
   the learner doing anything is keying on variables the teaching cells
   already define, which this test exists to catch.

Conversion is opt-in per notebook (a notebook with zero check cells is not
converted yet and only appears in the coverage log); the final flip test that
requires every notebook to be converted lands with the last conversion batch.

Runnable notebooks execute under qcsim (same bootstrap as
tests/test_notebook_contract.py); non-runnable notebooks execute under the
real amazon-braket-sdk with cloud calls left to their own RUN_ON_AWS-style
guards. Notebooks that genuinely cannot execute headlessly are listed in
SKIP_EXECUTION with a reason — their structure and solutions coverage are
still enforced statically.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import validate_runnable as vr  # noqa: E402

SOLUTIONS_DIR = Path(__file__).resolve().parent / "solutions"

SCAFFOLD_RE = re.compile(r"^# Exercise (\d+):")
CHECK_RE = re.compile(r"^# Check Exercise (\d+)")

# Notebooks whose full headless execution is impossible or unreasonable in CI.
# Structure + solution coverage are still enforced; only execution is skipped.
# Every entry needs an honest reason.
SKIP_EXECUTION: dict[str, str] = {}


def all_notebooks() -> list[Path]:
    return sorted(REPO_ROOT.glob("0*/notebooks/*.ipynb"))


def _source(cell: dict) -> str:
    src = cell.get("source", "")
    return "".join(src) if isinstance(src, list) else src


def parse_exercises(nb_path: Path) -> dict:
    """Extract the exercise structure of one notebook.

    Returns {"scaffolds": {n: idx}, "checks": {n: idx}, "cells": [...]}.
    """
    nb = json.loads(nb_path.read_text(encoding="utf-8"))
    cells = nb.get("cells", [])
    scaffolds: dict[int, int] = {}
    checks: dict[int, int] = {}
    for idx, cell in enumerate(cells):
        if cell.get("cell_type") != "code":
            continue
        first = _source(cell).split("\n", 1)[0]
        m = SCAFFOLD_RE.match(first)
        if m:
            n = int(m.group(1))
            assert n not in scaffolds, f"{nb_path.name}: duplicate scaffold for exercise {n}"
            scaffolds[n] = idx
        m = CHECK_RE.match(first)
        if m:
            n = int(m.group(1))
            assert n not in checks, f"{nb_path.name}: duplicate check for exercise {n}"
            checks[n] = idx
    return {"scaffolds": scaffolds, "checks": checks, "cells": cells}


def is_converted(nb_path: Path) -> bool:
    return bool(parse_exercises(nb_path)["checks"])


ALL = all_notebooks()
CONVERTED = [p for p in ALL if is_converted(p)]
_IDS = [p.relative_to(REPO_ROOT).as_posix() for p in CONVERTED]


def solutions_path(nb_path: Path) -> Path:
    section = nb_path.parent.parent.name
    return SOLUTIONS_DIR / section / f"{nb_path.stem}.py"


def load_solutions(nb_path: Path) -> dict[int, str]:
    path = solutions_path(nb_path)
    assert path.exists(), (
        f"missing canonical solutions file {path.relative_to(REPO_ROOT)} "
        f"for converted notebook {nb_path.name}"
    )
    spec = importlib.util.spec_from_file_location(f"solutions_{nb_path.stem}", path)
    assert spec is not None and spec.loader is not None, f"unloadable {path}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    solutions = getattr(module, "SOLUTIONS", None)
    assert isinstance(solutions, dict), f"{path.name} must define SOLUTIONS: dict[int, str]"
    return solutions


def test_conversion_coverage_log():
    """Not a gate: log how far the conversion has progressed."""
    print(f"\nexercise-convention conversion: {len(CONVERTED)}/{len(ALL)} notebooks")
    for p in ALL:
        if p not in CONVERTED:
            print(f"  not converted: {p.relative_to(REPO_ROOT).as_posix()}")


def test_all_notebooks_converted():
    """Every curriculum notebook carries the exercise convention.

    This is the invariant that keeps the loop closed: a new notebook (or one
    that loses its check cells) fails here until it adopts the three-cell unit.
    It flips on once the whole curriculum is converted; if a genuinely
    exercise-free notebook is ever added, list it in an explicit allowlist
    here rather than silently regressing the guarantee.
    """
    unconverted = [p.relative_to(REPO_ROOT).as_posix() for p in ALL if p not in CONVERTED]
    assert not unconverted, (
        "these curriculum notebooks lack the exercise convention "
        "(prompt + scaffold + check per exercise):\n  " + "\n  ".join(unconverted)
    )


@pytest.mark.parametrize("nb_path", CONVERTED, ids=_IDS)
def test_structure(nb_path: Path):
    """Converted notebooks follow the three-cell unit exactly."""
    parsed = parse_exercises(nb_path)
    scaffolds, checks, cells = parsed["scaffolds"], parsed["checks"], parsed["cells"]
    rel = nb_path.relative_to(REPO_ROOT).as_posix()

    assert scaffolds, f"{rel}: has check cells but no `# Exercise N:` scaffolds"
    assert set(scaffolds) == set(checks), (
        f"{rel}: scaffold/check mismatch — scaffolds {sorted(scaffolds)}, checks {sorted(checks)}"
    )

    for n, s_idx in scaffolds.items():
        c_idx = checks[n]
        assert c_idx > s_idx, f"{rel}: check {n} precedes its scaffold"
        between = [i for i in range(s_idx + 1, c_idx) if cells[i].get("cell_type") == "code"]
        assert not between, (
            f"{rel}: check {n} must be the next code cell after its scaffold "
            f"(found intervening code cells at {between})"
        )
        # The check cell uses the shared runtime.
        check_src = _source(cells[c_idx])
        assert "from lib.grading import check" in check_src, (
            f"{rel}: check {n} does not import lib.grading.check"
        )
        assert f'check("Exercise {n}")' in check_src, (
            f'{rel}: check {n} does not open `with check("Exercise {n}")`'
        )
        # The nearest markdown cell above the scaffold is the prompt with
        # two hint tiers.
        md_idx = next(
            (i for i in range(s_idx - 1, -1, -1) if cells[i].get("cell_type") == "markdown"),
            None,
        )
        assert md_idx is not None, f"{rel}: exercise {n} has no prompt markdown cell"
        md = _source(cells[md_idx])
        assert f"### Exercise {n}" in md, (
            f"{rel}: exercise {n} prompt cell lacks `### Exercise {n}` header"
        )
        assert md.count("<details>") >= 2 and md.count("</details>") >= 2, (
            f"{rel}: exercise {n} prompt must carry two <details> hint tiers"
        )
        assert "Hint 1" in md and "Hint 2" in md, (
            f"{rel}: exercise {n} hints must be labeled Hint 1 / Hint 2"
        )

    solutions = load_solutions(nb_path)
    assert set(solutions) == set(scaffolds), (
        f"{rel}: SOLUTIONS keys {sorted(solutions)} != exercises {sorted(scaffolds)}"
    )
    for n, code in solutions.items():
        assert isinstance(code, str) and code.strip(), f"{rel}: solution {n} is empty"
        assert "TODO" not in code, f"{rel}: solution {n} still contains TODO"


@pytest.fixture(scope="session")
def contract_kernel() -> str:
    """Kernel bound to this interpreter (same pattern as the contract test)."""
    from ipykernel.kernelspec import install

    name = "qcsim-contract"
    install(user=True, kernel_name=name)
    return name


def _bootstrap_source(nb_path: Path, strict: bool) -> str:
    lines = ["import sys", f"sys.path.insert(0, {str(REPO_ROOT)!r})"]
    if vr.is_marked_runnable(json.loads(nb_path.read_text(encoding="utf-8"))):
        lines.append("import qcsim  # registers braket.* aliases before any braket import")
    if strict:
        lines.append("import os")
        lines.append('os.environ["QL_GRADING_STRICT"] = "1"')
    return "\n".join(lines) + "\n"


def _execute(nb_path: Path, kernel: str, strict: bool, inject_solutions: bool):
    """Execute the notebook headlessly; returns the executed notebook object."""
    nbformat = pytest.importorskip("nbformat")
    from nbclient import NotebookClient

    nb = nbformat.read(str(nb_path), as_version=4)
    if inject_solutions:
        parsed = parse_exercises(nb_path)
        solutions = load_solutions(nb_path)
        # Insert each solution directly before its check cell, back to front
        # so earlier indices stay valid.
        for n in sorted(parsed["checks"], key=lambda n: parsed["checks"][n], reverse=True):
            cell = nbformat.v4.new_code_cell(
                f"# canonical solution for exercise {n} (harness-injected)\n" + solutions[n]
            )
            nb.cells.insert(parsed["checks"][n], cell)
    nb.cells.insert(0, nbformat.v4.new_code_cell(_bootstrap_source(nb_path, strict)))

    client = NotebookClient(
        nb,
        timeout=300,
        kernel_name=kernel,
        resources={"metadata": {"path": str(nb_path.parent)}},
    )
    client.execute()
    return nb


def _skip_if_unexecutable(nb_path: Path):
    rel = nb_path.relative_to(REPO_ROOT).as_posix()
    if rel in SKIP_EXECUTION:
        pytest.skip(f"execution skipped: {SKIP_EXECUTION[rel]}")


@pytest.mark.slow
@pytest.mark.parametrize("nb_path", CONVERTED, ids=_IDS)
def test_checks_pass_with_canonical_solutions(nb_path: Path, contract_kernel: str):
    """With the CORRECT answers inserted, every check must pass — strictly."""
    _skip_if_unexecutable(nb_path)
    from nbclient.exceptions import CellExecutionError

    try:
        _execute(nb_path, contract_kernel, strict=True, inject_solutions=True)
    except CellExecutionError as exc:
        pytest.fail(
            f"{nb_path.relative_to(REPO_ROOT).as_posix()}: a canonical solution "
            f"or its check is wrong (strict execution failed):\n{exc}"
        )


@pytest.mark.slow
@pytest.mark.parametrize("nb_path", CONVERTED, ids=_IDS)
def test_checks_do_not_pass_unsolved(nb_path: Path, contract_kernel: str):
    """Unsolved, every check must say 'not attempted' — never 'correct'."""
    _skip_if_unexecutable(nb_path)
    from nbclient.exceptions import CellExecutionError

    try:
        nb = _execute(nb_path, contract_kernel, strict=False, inject_solutions=False)
    except CellExecutionError as exc:
        pytest.fail(
            f"{nb_path.relative_to(REPO_ROOT).as_posix()}: unsolved notebook no "
            f"longer executes cleanly:\n{exc}"
        )

    rel = nb_path.relative_to(REPO_ROOT).as_posix()
    for cell in nb.cells:
        if cell.cell_type != "code":
            continue
        first = (cell.source or "").split("\n", 1)[0]
        m = CHECK_RE.match(first)
        if not m:
            continue
        stdout = "".join(
            "".join(out.get("text", ""))
            for out in cell.get("outputs", [])
            if out.get("output_type") == "stream"
        )
        assert "[check]" in stdout, (
            f"{rel}: check {m.group(1)} produced no [check] output when unsolved"
        )
        assert " correct." not in stdout, (
            f"{rel}: check {m.group(1)} PASSED on the unsolved notebook — it must "
            f"key on names only the exercise itself defines (see the fresh-names "
            f"rule in docs/exercise-convention.md)"
        )
