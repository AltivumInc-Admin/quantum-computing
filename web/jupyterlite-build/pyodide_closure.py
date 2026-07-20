"""Resolve the Pyodide wheel closure a runtime needs, from its ``pyodide-lock.json``.

``build.sh`` self-hosts two SEPARATE Pyodide distributions — the lesson runtime
under ``../public/pyodide`` and the JupyterLite kernel's copy under
``static/pyodide`` — and the "core" release tarball ships **no package wheels**.
Each staging therefore has to fetch exactly the transitive ``depends`` closure of
its own roots, computed from that distribution's lock so a Pyodide bump stays
correct.

That walk used to be written twice as inline shell heredocs in ``build.sh``,
where neither ``ruff`` nor ``pytest`` could see it. It lives here instead — the
same standalone-module idiom ``prepare_notebooks.py`` already establishes in this
directory — and ``build.sh`` calls it once per staging.

Usage (prints one wheel file name per line, sorted)::

    python pyodide_closure.py <pyodide-lock.json> <root> [<root> ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def normalize(name: str) -> str:
    """Pyodide lock keys are case/underscore-insensitive (``numpy_tests`` == ``numpy-tests``)."""
    return name.lower().replace("_", "-")


def load_packages(lock_path: str | Path) -> dict[str, dict]:
    """Return the lock's ``packages`` table keyed by NORMALIZED package name."""
    lock = json.loads(Path(lock_path).read_text(encoding="utf-8"))
    return {normalize(k): v for k, v in lock["packages"].items()}


def resolve_closure(packages: dict[str, dict], roots: list[str]) -> set[str]:
    """Transitively close ``roots`` over each package's ``depends`` list.

    Roots (and dependency names) absent from the lock are skipped, not an error:
    the kernel's boot list mixes lock packages with piplite-index packages, and
    only the former resolve here.
    """
    seen: set[str] = set()
    stack = list(roots)
    while stack:
        name = normalize(stack.pop())
        if name in seen or name not in packages:
            continue
        seen.add(name)
        stack.extend(packages[name].get("depends", []))
    return seen


def closure_file_names(lock_path: str | Path, roots: list[str]) -> list[str]:
    """The sorted wheel file names to fetch for ``roots`` — what ``build.sh`` consumes."""
    packages = load_packages(lock_path)
    return sorted(packages[n]["file_name"] for n in resolve_closure(packages, roots))


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(
            f"usage: {Path(__file__).name} <pyodide-lock.json> <root> [<root> ...]", file=sys.stderr
        )
        return 2
    print("\n".join(closure_file_names(argv[0], argv[1:])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
