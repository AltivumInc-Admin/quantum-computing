"""Prune test-only packages from a STAGED ``pyodide-lock.json`` and assert import resolution.

Why this exists
---------------
Pyodide resolves ``loadPackagesFromImports`` through a single map built from the
lock, in lock order, last writer wins (see ``pyodide.asm.js``)::

    API._import_name_to_package_name = new Map;
    for (let i of Object.keys(API.lockfile_packages)) {
      let s = API.lockfile_packages[i];
      for (let l of s.imports) API._import_name_to_package_name.set(l, i);
    }
    ...
    for (let l of imports) map.has(l) && set.add(map.get(l));

so an import name maps to exactly ONE package: the LAST lock entry declaring it.

Upstream ships a ``<name>-tests`` sibling for many packages, holding only that
package's test suite, and those siblings declare the SAME ``imports`` as the real
package while sitting AFTER it in the lock. ``numpy-tests`` therefore wins the
``numpy`` import name outright: ``import numpy`` in a lab cell resolves to a
1.6 MB wheel of nothing but ``numpy/**/tests`` (its ``depends`` is empty, so it
does not even pull the real numpy). The notebooks only work because the injected
bootstrap's ``piplite.install("qcsim")`` pulls numpy by package NAME through
micropip — the ``loadPackagesFromImports`` path was masked, not correct.

Removing the shadowing entries from the staged lock is the load-bearing half of
the fix: dropping the wheel alone would leave the lock resolving ``numpy`` to a
package whose file 404s SAME-ORIGIN, and the kernel answers a failed
``_load_packages_from_imports`` by showing a traceback and skipping the cell.

The guard below is the general form of the invariant, so a differently-shaped
future shadowing fails the build instead of shipping: no import name provided by
a package we actually staged may resolve to one we did not.

Usage::

    python prune_lock.py <dir containing pyodide-lock.json and the staged wheels>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

TEST_PACKAGE_SUFFIX = "-tests"


def _normalize(name: str) -> str:
    return name.lower().replace("_", "-")


def staged_file_names(dest: Path) -> set[str]:
    """Every file actually present in the staged distribution directory."""
    return {p.name for p in dest.iterdir() if p.is_file()}


def is_staged(entry: dict, staged: set[str]) -> bool:
    return entry.get("file_name") in staged


def test_only_packages(packages: dict[str, dict], staged: set[str]) -> list[str]:
    """Lock keys that are upstream test-suite siblings we did NOT stage.

    The not-staged condition is a safety belt: if a closure ever legitimately
    stages a ``*-tests`` wheel, this leaves it alone.
    """
    return [
        key
        for key, entry in packages.items()
        if _normalize(key).endswith(TEST_PACKAGE_SUFFIX) and not is_staged(entry, staged)
    ]


def shadowed_imports(
    packages: dict[str, dict], staged: set[str]
) -> list[tuple[str, str, list[str]]]:
    """Import names a staged package provides but that resolve to an UNSTAGED package.

    Returns ``(import_name, resolved_package, staged_packages_that_also_provide_it)``
    tuples. Empty means every import name the payload can satisfy resolves to a
    wheel the payload actually contains.
    """
    resolved: dict[str, str] = {}
    providers: dict[str, list[str]] = {}
    for key, entry in packages.items():  # lock order == JS Object.keys order
        for name in entry.get("imports", []):
            resolved[name] = key  # last writer wins, exactly as Pyodide does
            providers.setdefault(name, []).append(key)

    bad: list[tuple[str, str, list[str]]] = []
    for name, winner in resolved.items():
        if is_staged(packages[winner], staged):
            continue
        also_staged = [p for p in providers[name] if is_staged(packages[p], staged)]
        if also_staged:
            bad.append((name, winner, also_staged))
    return sorted(bad)


def prune(dest: Path) -> tuple[list[str], list[tuple[str, str, list[str]]]]:
    """Drop unstaged test-suite siblings from the lock in place.

    Returns ``(removed_keys, remaining_shadowed_imports)``.
    """
    lock_path = dest / "pyodide-lock.json"
    data = json.loads(lock_path.read_text(encoding="utf-8"))
    packages = data["packages"]
    staged = staged_file_names(dest)

    removed = test_only_packages(packages, staged)
    for key in removed:
        del packages[key]

    lock_path.write_text(json.dumps(data), encoding="utf-8")
    return removed, shadowed_imports(packages, staged)


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(f"usage: {Path(__file__).name} <staged-pyodide-dir>", file=sys.stderr)
        return 2
    dest = Path(argv[0])
    removed, shadowed = prune(dest)
    print(f"  pruned {len(removed)} unstaged test-suite package(s) from the staged lock")
    if shadowed:
        print(
            "  ERROR: staged packages' import names resolve to packages we did NOT stage;",
            file=sys.stderr,
        )
        print("         loadPackagesFromImports would 404 SAME-ORIGIN on each:", file=sys.stderr)
        for name, winner, also in shadowed:
            print(
                f"    import {name} -> {winner} (not staged); staged provider(s): {also}",
                file=sys.stderr,
            )
        return 1
    print("  OK: every import name a staged package provides resolves to a staged package")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
