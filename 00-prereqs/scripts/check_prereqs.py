"""Verify the environment is ready for the 00-prereqs notebooks.

Usage:
    python 00-prereqs/scripts/check_prereqs.py

Exits 0 if everything is installed, 1 otherwise. Prints actionable hints
for anything missing.
"""

from __future__ import annotations

import importlib
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class Requirement:
    """A required Python package, with a friendly install hint."""

    module: str
    pip_name: str
    purpose: str

    def is_installed(self) -> bool:
        try:
            importlib.import_module(self.module)
        except ImportError:
            return False
        return True


REQUIREMENTS: tuple[Requirement, ...] = (
    Requirement(
        module="numpy",
        pip_name="numpy",
        purpose="vectors, matrices, complex numbers (used in every notebook)",
    ),
    Requirement(
        module="matplotlib",
        pip_name="matplotlib",
        purpose="plotting (probability bars, Bloch slices)",
    ),
    Requirement(
        module="jupyterlab",
        pip_name="jupyterlab",
        purpose="running the notebooks themselves",
    ),
)

OPTIONAL: tuple[Requirement, ...] = (
    Requirement(
        module="ipywidgets",
        pip_name="ipywidgets",
        purpose="interactive Bloch-sphere sliders in notebook 06 (a static fallback exists)",
    ),
)


def python_version_ok() -> bool:
    """The repo's pyproject.toml targets Python 3.10+."""
    return sys.version_info >= (3, 10)


def main() -> int:
    print("== 00-prereqs environment check ==\n")

    ok = True

    # Python version
    if python_version_ok():
        print(f"[ok]   Python {sys.version.split()[0]}")
    else:
        ok = False
        print(
            f"[FAIL] Python {sys.version.split()[0]} — need 3.10 or newer "
            "(the rest of the repo also requires it)."
        )

    # Required packages
    missing_required: list[Requirement] = []
    for req in REQUIREMENTS:
        if req.is_installed():
            print(f"[ok]   {req.module}")
        else:
            ok = False
            missing_required.append(req)
            print(f"[FAIL] {req.module} — {req.purpose}")

    # Optional packages
    missing_optional: list[Requirement] = []
    for req in OPTIONAL:
        if req.is_installed():
            print(f"[ok]   {req.module} (optional)")
        else:
            missing_optional.append(req)
            print(f"[skip] {req.module} (optional) — {req.purpose}")

    print()
    if missing_required:
        names = " ".join(r.pip_name for r in missing_required)
        print(f"Install missing required packages:\n    pip install {names}")
    if missing_optional:
        names = " ".join(r.pip_name for r in missing_optional)
        print(f"Optional install for the best experience:\n    pip install {names}")

    if ok:
        print("Environment is ready. Launch the notebooks with:\n    jupyter lab 00-prereqs/notebooks")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
