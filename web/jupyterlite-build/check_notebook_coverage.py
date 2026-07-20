"""Assert the staged Pyodide closure covers every browser-runnable notebook's imports.

This is the build's real guard against a silent, invisible breakage. A lock
package that a runnable notebook imports but the staged closure omits would
404 SAME-ORIGIN at runtime: the lab kernel loads it with ``loadPackage`` from
``./static/pyodide/``, not through piplite, so ``disablePyPIFallback`` never
redirects it and the e2e suite's "zero third-party requests" assertion cannot
see it either — the request that fails is same-origin. Failing here, loudly, at
build time is the only thing standing between a notebook that adds
``import scipy`` and a learner watching a cell traceback in production.

It used to live as a 40-line single-quoted heredoc inside ``build.sh``, where
``ruff`` could not lint it and ``pytest`` could not import it, so the guard
itself was guarded by nothing. ``tests/test_notebook_coverage_guard.py`` now
exercises it against synthetic locks and notebooks.

Coverage rule: an import name counts as covered when AT LEAST ONE lock package
declaring it is staged. Upstream ships multiple providers for some names (a real
package plus its ``*-tests`` sibling), and staging either satisfies the import.
Import names absent from the lock — stdlib, ``braket``/``qcsim``, the curriculum's
own ``lib``, the optional ``ipywidgets`` — are not the closure's business and are
skipped.

Usage::

    python check_notebook_coverage.py <staged-pyodide-dir> [<content-manifest>] [<curriculum-root>]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Defaults match the paths build.sh runs with (cwd = web/jupyterlite-build).
DEFAULT_MANIFEST = Path("../src/lib/content-manifest.json")
DEFAULT_CURRICULUM_ROOT = Path("../..")

# Top-level `import x` / `from x import y`. Deliberately a line regex rather than
# an AST parse: notebook cells carry IPython magics that are not valid Python.
IMPORT_RE = re.compile(r"^\s*(?:import\s+([a-zA-Z0-9_]+)|from\s+([a-zA-Z0-9_]+)\s+import)")


def _normalize(name: str) -> str:
    return name.lower().replace("_", "-")


def load_packages(dest: Path) -> dict[str, dict]:
    return json.loads((dest / "pyodide-lock.json").read_text(encoding="utf-8"))["packages"]


def build_provider_index(packages: dict[str, dict]) -> dict[str, list[str]]:
    """import name -> normalized names of every lock package providing it."""
    providers: dict[str, list[str]] = {}
    for key, entry in packages.items():
        for name in entry.get("imports", []):
            providers.setdefault(name, []).append(_normalize(key))
    return providers


def staged_packages(dest: Path, packages: dict[str, dict]) -> set[str]:
    """Normalized names of the lock packages whose wheel is present in ``dest``."""
    present_files = {p.name for p in dest.glob("*.whl")}
    return {_normalize(k) for k, v in packages.items() if v.get("file_name") in present_files}


def cell_import_names(notebook: dict) -> list[str]:
    """Every module name imported by the notebook's CODE cells, in order."""
    names: list[str] = []
    for cell in notebook.get("cells", []):
        if cell.get("cell_type") != "code":
            continue
        source = cell.get("source", "")
        source = "".join(source) if isinstance(source, list) else source
        for line in source.splitlines():
            match = IMPORT_RE.match(line)
            if match:
                names.append(match.group(1) or match.group(2))
    return names


def runnable_notebooks(manifest_path: Path, curriculum_root: Path) -> list[tuple[str, Path]]:
    """``(label, path)`` for each notebook the manifest marks runnable AND that exists.

    A manifest entry with no file on disk is skipped rather than failed: the
    manifest is the curriculum's catalog, and this guard is about closure
    coverage, not file presence.
    """
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    found: list[tuple[str, Path]] = []
    for section in manifest["sections"]:
        for nb in section.get("notebooks", []):
            if not nb.get("runnable"):
                continue
            path = curriculum_root / section["dirName"] / "notebooks" / nb["filename"]
            if not path.exists():
                continue
            found.append((f"{section['dirName']}/{nb['filename']}", path))
    return found


def find_uncovered(
    dest: Path,
    manifest_path: Path = DEFAULT_MANIFEST,
    curriculum_root: Path = DEFAULT_CURRICULUM_ROOT,
) -> tuple[list[tuple[str, str, tuple[str, ...]]], int]:
    """Return ``(uncovered, checked)``.

    ``uncovered`` holds ``(notebook_label, import_name, providers)`` for each
    lock-resolved import no staged package satisfies. ``checked`` is the number
    of runnable notebooks actually scanned — reported so a discovery regression
    that empties the scan cannot pass as a clean result.
    """
    packages = load_packages(dest)
    providers = build_provider_index(packages)
    staged = staged_packages(dest, packages)

    uncovered: set[tuple[str, str, tuple[str, ...]]] = set()
    checked = 0
    for label, path in runnable_notebooks(manifest_path, curriculum_root):
        checked += 1
        notebook = json.loads(path.read_text(encoding="utf-8"))
        for name in cell_import_names(notebook):
            if name in providers and not any(p in staged for p in providers[name]):
                uncovered.add((label, name, tuple(providers[name])))
    return sorted(uncovered), checked


def main(argv: list[str]) -> int:
    if not argv:
        print(
            f"usage: {Path(__file__).name} <staged-pyodide-dir> "
            f"[<content-manifest>] [<curriculum-root>]",
            file=sys.stderr,
        )
        return 2
    dest = Path(argv[0])
    manifest_path = Path(argv[1]) if len(argv) > 1 else DEFAULT_MANIFEST
    curriculum_root = Path(argv[2]) if len(argv) > 2 else DEFAULT_CURRICULUM_ROOT

    uncovered, checked = find_uncovered(dest, manifest_path, curriculum_root)
    if uncovered:
        print(
            "  ERROR: runnable notebooks import Pyodide-lock packages NOT in the closure:",
            file=sys.stderr,
        )
        for label, name, provs in uncovered:
            print(f"    {label}: import {name} -> needs {list(provs)}", file=sys.stderr)
        print(
            "  Add the package to the closure roots (LAB_CLOSURE_ROOTS in build.sh).",
            file=sys.stderr,
        )
        return 1
    print(f"  OK: {checked} runnable notebooks; every lock-resolved import is in the closure")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
