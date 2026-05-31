# Kernel startup hook for the in-browser Pyodide kernel.
#
# Runs once when a new kernel session begins. Installs the qcsim wheel
# (which mirrors the braket.* namespace) so notebook code written as
# `from braket.circuits import Circuit` works unchanged. Also extends
# sys.path so `from lib.utils.results import ...` resolves against the
# curriculum's shared library.

import sys

try:
    import piplite

    await piplite.install("qcsim")  # noqa: F704
    import qcsim  # noqa: F401 — triggers braket.* alias registration
except Exception as exc:  # pragma: no cover - kernel diagnostic only
    print(f"[startup] qcsim install/import failed: {exc}", file=sys.stderr)

# Make the curriculum's `lib/` importable.
if "/files" not in sys.path:
    sys.path.insert(0, "/files")
