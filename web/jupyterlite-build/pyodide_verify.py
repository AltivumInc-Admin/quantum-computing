"""Verify staged Pyodide wheels against the ``sha256`` their lock attests.

``build.sh`` fetches each wheel of the computed closure from **jsdelivr**, while
``pyodide-lock.json`` arrives inside the **GitHub** release tarball. Those are
two different origins, and the lock carries a ``sha256`` for every package — so
checking one against the other is real cross-origin verification, not a
self-signed loop: a compromised or mis-serving CDN cannot produce bytes that
match a digest published by GitHub.

Before this existed the only gate on a fetched wheel was ``test -s`` (non-empty),
on files that CI's ``actions/cache`` and Amplify both persist, so one bad fetch
could survive into later builds. Wheels are what the browser actually executes
in a learner's session — this is the artifact that most warrants a checksum.

The tarball half is pinned separately, in ``pyodide-tarball.sha256``: the lock
lives *inside* the tarball, so it cannot attest to its own container.

Usage (exits non-zero and names every failure)::

    python pyodide_verify.py <pyodide-lock.json> <dest-dir> <wheel> [<wheel> ...]
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from pyodide_closure import load_packages


def digest(path: str | Path) -> str:
    """The file's sha256, read in chunks so a large wheel never lands in memory."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def expected_digests(lock_path: str | Path) -> dict[str, str]:
    """Map every wheel FILE NAME in the lock to its attested sha256.

    Keyed by file name, not package name, because that is what ``build.sh``
    fetches and what lands on disk.
    """
    return {
        pkg["file_name"]: pkg["sha256"]
        for pkg in load_packages(lock_path).values()
        if "file_name" in pkg and "sha256" in pkg
    }


def verify(lock_path: str | Path, dest: str | Path, wheels: list[str]) -> list[str]:
    """Return a list of human-readable problems; empty means every wheel verified."""
    attested = expected_digests(lock_path)
    dest = Path(dest)
    problems: list[str] = []

    for whl in wheels:
        want = attested.get(whl)
        if want is None:
            # The closure is computed FROM this lock, so a wheel missing from it
            # means the two have diverged — never a wheel to wave through.
            problems.append(f"{whl}: no sha256 in the lock (closure/lock divergence)")
            continue
        path = dest / whl
        if not path.is_file():
            problems.append(f"{whl}: missing from {dest}")
            continue
        got = digest(path)
        if got != want:
            problems.append(
                f"{whl}: sha256 mismatch\n    lock (GitHub): {want}\n    fetched (CDN): {got}"
            )

    return problems


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(
            f"usage: {Path(__file__).name} <pyodide-lock.json> <dest-dir> <wheel> [<wheel> ...]",
            file=sys.stderr,
        )
        return 2

    problems = verify(argv[0], argv[1], argv[2:])
    if problems:
        print(f"    ERROR: {len(problems)} wheel(s) failed verification:", file=sys.stderr)
        for p in problems:
            print(f"      {p}", file=sys.stderr)
        print(
            "    A mismatch means the CDN served bytes the GitHub lock does not attest.\n"
            "    Do not ship it: clear the staged directory and re-run the build.",
            file=sys.stderr,
        )
        return 1

    print(f"    verified sha256 for {len(argv[2:])} wheel(s) against the lock")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
