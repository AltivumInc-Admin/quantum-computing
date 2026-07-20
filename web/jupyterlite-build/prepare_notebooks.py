"""Inject a Pyodide bootstrap cell into every notebook staged for JupyterLite.

The cell is a no-op when the notebook is opened under real Python (the
``if "pyodide" in sys.modules`` guard short-circuits before the ``await``
runs). In Pyodide it installs the qcsim wheel and triggers qcsim's
braket.* alias registration so the notebook's ``from braket.circuits
import Circuit`` works without modification.

Run from ``web/jupyterlite-build/`` *before* ``jupyter lite build``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BOOTSTRAP_MARKER = "Auto-injected Pyodide bootstrap"
BOOTSTRAP_SOURCE = """\
# Auto-injected Pyodide bootstrap (no-op under real Python).
import sys
if "pyodide" in sys.modules:
    import piplite
    await piplite.install("qcsim")
    import qcsim  # registers braket.* aliases in sys.modules
    # Make `from lib...` resolvable against the staged curriculum library.
    # JupyterLite typically mounts contents at /drive/; we add a couple of
    # plausible roots so the import works regardless of kernel version.
    for _p in ("/drive", "/home/pyodide", "/files"):
        if _p not in sys.path:
            sys.path.insert(0, _p)
"""


def inject_bootstrap(notebook_path: Path) -> bool:
    with notebook_path.open("r", encoding="utf-8") as fh:
        nb = json.load(fh)

    cells = nb.get("cells") or []
    if cells:
        first = cells[0]
        if isinstance(first.get("source"), list):
            first_source = "".join(first["source"])
        else:
            first_source = first.get("source", "")
        if BOOTSTRAP_MARKER in first_source:
            return False

    cell = {
        "cell_type": "code",
        "execution_count": None,
        # source_hidden collapses the INPUT only: the cell still runs first and
        # "Run All Cells" is unchanged, but the notebook now opens on its own H1
        # instead of on build-tooling boilerplate about a package the learner has
        # never heard of. JupyterLab's own collapse mechanism, already in the
        # shipped lab bundle — no new dependency. The tag stays as the machine-
        # readable marker; the source text is untouched so the BOOTSTRAP_MARKER
        # idempotency check above still recognises an already-injected cell.
        "metadata": {"tags": ["pyodide-bootstrap"], "jupyter": {"source_hidden": True}},
        "outputs": [],
        "source": BOOTSTRAP_SOURCE.splitlines(keepends=True),
    }
    cells.insert(0, cell)
    nb["cells"] = cells

    with notebook_path.open("w", encoding="utf-8") as fh:
        json.dump(nb, fh, indent=1)
    return True


def main() -> int:
    root = Path("files")
    if not root.exists():
        print("error: files/ does not exist (run from web/jupyterlite-build)", file=sys.stderr)
        return 1
    injected = 0
    skipped = 0
    for nb_path in sorted(root.rglob("*.ipynb")):
        if inject_bootstrap(nb_path):
            injected += 1
            print(f"  + {nb_path}")
        else:
            skipped += 1
    print(f"Injected: {injected}, already-bootstrapped: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
