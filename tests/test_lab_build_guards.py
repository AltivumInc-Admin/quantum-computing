"""Teeth for the two lab-build guards that protect the in-browser kernel's payload.

Both guards live in ``web/jupyterlite-build/`` and both defend against the same
class of failure: a Pyodide package the lab kernel tries to ``loadPackage`` that
is not in the staged distribution. That request 404s **same-origin**, so
``disablePyPIFallback`` never redirects it and the Playwright suite's
"zero third-party requests" assertion cannot see it either — the e2e goes green
while 30 of 32 notebooks show a traceback and skip the cell.

* ``check_notebook_coverage`` — asserts the staged closure covers every import in
  every browser-runnable notebook. Its own source calls it "the real guard", and
  until this file existed its correctness was asserted by nobody: it was a
  40-line single-quoted heredoc inside ``build.sh``, invisible to ruff and
  unimportable by pytest.
* ``prune_lock`` — removes upstream's ``*-tests`` sibling packages from the
  staged lock, because they declare the SAME imports as the real package while
  sitting after it in lock order and therefore WIN the import name outright
  (Pyodide's import index is a Map, last writer wins).

Everything below runs against synthetic locks and notebooks built in ``tmp_path``
so the assertions are about the guards' logic, not about today's curriculum.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "web" / "jupyterlite-build"))

import check_notebook_coverage as cov  # noqa: E402
import prune_lock  # noqa: E402

BUILD_SH = REPO_ROOT / "web" / "jupyterlite-build" / "build.sh"


# --------------------------------------------------------------- fixture builders


def lock_entry(name: str, imports: list[str] | None = None, depends: list[str] | None = None):
    """One pyodide-lock package entry, shaped like the real thing."""
    return {
        "name": name,
        "file_name": f"{name.replace('-', '_')}-1.0.0-py3-none-any.whl",
        "imports": [name] if imports is None else imports,
        "depends": depends or [],
        "install_dir": "site",
        "package_type": "package",
    }


def write_distribution(root: Path, packages: dict[str, dict], staged: list[str]) -> Path:
    """A staged Pyodide dir: the lock plus the wheels we pretend to have fetched.

    Only the PRESENCE of a wheel file matters to either guard, so the files are
    empty — which also keeps the fixture honest about what is actually read.
    """
    dest = root / "static" / "pyodide"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "pyodide-lock.json").write_text(json.dumps({"packages": packages}), encoding="utf-8")
    for name in staged:
        (dest / packages[name]["file_name"]).write_bytes(b"")
    return dest


def write_curriculum(root: Path, sections: list[tuple[str, list[tuple]]]) -> Path:
    """Write notebooks + the content manifest that indexes them.

    ``sections`` is ``[(dirName, [(filename, runnable, cells_or_None)])]`` where
    ``cells`` is ``[(cell_type, source)]`` and ``None`` means "listed in the
    manifest but absent from disk".
    """
    manifest: dict = {"sections": []}
    for dir_name, notebooks in sections:
        entries = []
        for filename, runnable, cells in notebooks:
            entries.append({"filename": filename, "runnable": runnable})
            if cells is None:
                continue
            nb_dir = root / dir_name / "notebooks"
            nb_dir.mkdir(parents=True, exist_ok=True)
            nb = {"cells": [{"cell_type": t, "source": s} for t, s in cells]}
            (nb_dir / filename).write_text(json.dumps(nb), encoding="utf-8")
        manifest["sections"].append({"dirName": dir_name, "notebooks": entries})
    manifest_path = root / "content-manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_path


@pytest.fixture
def lock_with_scipy():
    """numpy (+ its test-suite sibling) and scipy — the shapes both guards care about."""
    return {
        "numpy": lock_entry("numpy"),
        # Declares imports ['numpy'] and sits AFTER numpy, exactly as upstream ships it.
        "numpy-tests": lock_entry("numpy-tests", imports=["numpy"]),
        "scipy": lock_entry("scipy", depends=["numpy"]),
    }


# ------------------------------------------------- check_notebook_coverage: the guard fires


def test_flags_a_lock_package_the_closure_omits(tmp_path, lock_with_scipy):
    """The headline case: a notebook adds `import scipy` and nobody extends the roots."""
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy"])
    manifest = write_curriculum(
        tmp_path, [("01-foundations", [("01-circuits.ipynb", True, [("code", "import scipy\n")])])]
    )

    uncovered, checked = cov.find_uncovered(dest, manifest, tmp_path)

    assert checked == 1
    assert uncovered == [("01-foundations/01-circuits.ipynb", "scipy", ("scipy",))]
    # And it must FAIL the build, not just report.
    assert cov.main([str(dest), str(manifest), str(tmp_path)]) == 1


def test_passes_once_the_missing_wheel_is_staged(tmp_path, lock_with_scipy):
    """The same notebook is clean the moment scipy is actually in the closure."""
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy", "scipy"])
    manifest = write_curriculum(
        tmp_path, [("01-foundations", [("01-circuits.ipynb", True, [("code", "import scipy\n")])])]
    )

    uncovered, checked = cov.find_uncovered(dest, manifest, tmp_path)

    assert (uncovered, checked) == ([], 1)
    assert cov.main([str(dest), str(manifest), str(tmp_path)]) == 0


def test_reports_every_offending_notebook_and_import(tmp_path, lock_with_scipy):
    """A real failure names each notebook/import pair so the fix is obvious."""
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy"])
    manifest = write_curriculum(
        tmp_path,
        [
            ("01-foundations", [("01-a.ipynb", True, [("code", "import scipy\n")])]),
            ("03-algorithms", [("02-b.ipynb", True, [("code", "from scipy import linalg\n")])]),
        ],
    )

    uncovered, checked = cov.find_uncovered(dest, manifest, tmp_path)

    assert checked == 2
    assert [(label, name) for label, name, _ in uncovered] == [
        ("01-foundations/01-a.ipynb", "scipy"),
        ("03-algorithms/02-b.ipynb", "scipy"),
    ]


# ------------------------------------------- check_notebook_coverage: the guard stays quiet


def test_one_staged_provider_is_enough(tmp_path, lock_with_scipy):
    """`import numpy` is covered by the real numpy even though numpy-tests also declares it.

    This is the rule that keeps prune_lock's change from turning into a false
    alarm, and it is why coverage asks "is ANY provider staged", not "is the
    resolved provider staged".
    """
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy"])
    manifest = write_curriculum(
        tmp_path, [("01-foundations", [("01-a.ipynb", True, [("code", "import numpy\n")])])]
    )

    assert cov.find_uncovered(dest, manifest, tmp_path) == ([], 1)


def test_imports_absent_from_the_lock_are_not_the_closures_business(tmp_path, lock_with_scipy):
    """stdlib, qcsim/braket and the curriculum's own lib/ resolve elsewhere entirely."""
    dest = write_distribution(tmp_path, lock_with_scipy, staged=[])
    source = (
        "import json\nimport qcsim\nfrom braket.circuits import Circuit\nfrom lib.utils import x\n"
    )
    manifest = write_curriculum(
        tmp_path, [("01-foundations", [("01-a.ipynb", True, [("code", source)])])]
    )

    assert cov.find_uncovered(dest, manifest, tmp_path) == ([], 1)


def test_non_runnable_notebooks_are_not_scanned(tmp_path, lock_with_scipy):
    """A local-only notebook may import anything; it never boots the browser kernel."""
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy"])
    manifest = write_curriculum(
        tmp_path,
        [
            (
                "04-quantum-ml",
                [
                    ("01-local-only.ipynb", False, [("code", "import scipy\n")]),
                    ("02-runnable.ipynb", True, [("code", "import numpy\n")]),
                ],
            )
        ],
    )

    uncovered, checked = cov.find_uncovered(dest, manifest, tmp_path)

    assert uncovered == []
    assert checked == 1, "only the runnable notebook should be scanned"


def test_markdown_cells_are_not_scanned(tmp_path, lock_with_scipy):
    """Prose that mentions an import must not fail the build."""
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy"])
    manifest = write_curriculum(
        tmp_path,
        [
            (
                "01-foundations",
                [("01-a.ipynb", True, [("markdown", "Locally you would `import scipy`.")])],
            )
        ],
    )

    assert cov.find_uncovered(dest, manifest, tmp_path) == ([], 1)


def test_manifest_entry_without_a_file_is_skipped(tmp_path, lock_with_scipy):
    """The guard is about closure coverage, not file presence — and must not crash."""
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy"])
    manifest = write_curriculum(
        tmp_path,
        [
            (
                "01-foundations",
                [
                    ("01-missing.ipynb", True, None),
                    ("02-present.ipynb", True, [("code", "import numpy\n")]),
                ],
            )
        ],
    )

    assert cov.find_uncovered(dest, manifest, tmp_path) == ([], 1)


# ------------------------------------------------ check_notebook_coverage: import detection


@pytest.mark.parametrize(
    "source",
    [
        "import scipy\n",
        "from scipy import linalg\n",
        "import scipy as sp\n",
        "    import scipy\n",  # inside a function/try block
        "# setup\nimport numpy\nimport scipy\n",  # not just the first line
    ],
    ids=["import", "from-import", "aliased", "indented", "not-first-line"],
)
def test_detects_the_import_forms_notebooks_actually_use(tmp_path, lock_with_scipy, source):
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy"])
    manifest = write_curriculum(
        tmp_path, [("01-foundations", [("01-a.ipynb", True, [("code", source)])])]
    )

    uncovered, _ = cov.find_uncovered(dest, manifest, tmp_path)

    assert [name for _, name, _ in uncovered] == ["scipy"]


def test_reads_both_notebook_source_encodings(tmp_path, lock_with_scipy):
    """nbformat writes `source` as a list of lines; some tools write one string."""
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy"])
    as_list = ["# a comment\n", "import scipy\n"]
    manifest = write_curriculum(
        tmp_path, [("01-foundations", [("01-a.ipynb", True, [("code", as_list)])])]
    )

    uncovered, _ = cov.find_uncovered(dest, manifest, tmp_path)

    assert [name for _, name, _ in uncovered] == ["scipy"]


# ----------------------------------------------------------------------- prune_lock


def test_prune_removes_the_shadowing_test_sibling(tmp_path, lock_with_scipy):
    """numpy-tests wins `import numpy` outright; pruning it hands the name back."""
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy"])

    removed, shadowed = prune_lock.prune(dest)

    assert removed == ["numpy-tests"]
    assert shadowed == []
    packages = json.loads((dest / "pyodide-lock.json").read_text(encoding="utf-8"))["packages"]
    assert [k for k, v in packages.items() if "numpy" in v["imports"]] == ["numpy"]


def test_prune_keeps_a_test_package_we_deliberately_staged(tmp_path, lock_with_scipy):
    """The not-staged condition is a safety belt, not a blanket ban."""
    dest = write_distribution(tmp_path, lock_with_scipy, staged=["numpy", "numpy-tests"])

    removed, _ = prune_lock.prune(dest)

    assert removed == []


def test_prune_detects_a_differently_shaped_shadowing(tmp_path):
    """The general invariant, not just the *-tests case it currently fixes.

    Here a staged package's import name resolves to a LATER, unstaged package
    that is not a test sibling — so pruning cannot help and the build must fail
    loudly rather than ship a payload whose imports 404.
    """
    packages = {
        "pillow": lock_entry("pillow", imports=["PIL"]),
        "pillow-heif": lock_entry("pillow-heif", imports=["PIL"]),
    }
    dest = write_distribution(tmp_path, packages, staged=["pillow"])

    removed, shadowed = prune_lock.prune(dest)

    assert removed == []
    assert shadowed == [("PIL", "pillow-heif", ["pillow"])]
    assert prune_lock.main([str(dest)]) == 1


def test_prune_is_clean_on_a_payload_with_no_shadowing(tmp_path):
    packages = {"numpy": lock_entry("numpy"), "scipy": lock_entry("scipy")}
    dest = write_distribution(tmp_path, packages, staged=["numpy", "scipy"])

    assert prune_lock.prune(dest) == ([], [])
    assert prune_lock.main([str(dest)]) == 0


# ------------------------------------------------------------------------ wiring


def test_build_sh_still_invokes_both_guards():
    """A guard that is no longer called is a guard that does not exist."""
    build_sh = BUILD_SH.read_text(encoding="utf-8")
    assert "python check_notebook_coverage.py" in build_sh
    assert "python prune_lock.py" in build_sh
    # The closure roots the coverage guard's error message tells you to extend.
    assert "LAB_CLOSURE_ROOTS=" in build_sh
