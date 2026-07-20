"""qcsim — pure-NumPy state-vector simulator that mirrors the Braket API
subset used by this curriculum's notebooks.

When imported, qcsim registers itself in ``sys.modules`` as ``braket``,
``braket.circuits``, and ``braket.devices`` IF real Braket is not already
imported. This lets notebooks written ``from braket.circuits import Circuit``
run unchanged inside a Pyodide kernel where ``amazon-braket-sdk`` is not
installable.

In a local environment where ``amazon-braket-sdk`` IS installed, the alias
is a no-op (because ``braket`` is already in ``sys.modules`` by the time
qcsim is imported by the parity test suite).
"""

from __future__ import annotations

import sys
import types

from .circuits import Circuit
from .devices import LocalSimulator

__all__ = ["Circuit", "LocalSimulator"]
# 0.2.0: Braket-faithful qubit compaction (qubit_count/state-vector width =
# distinct used qubits), Gate-like Instruction.operator (.name matches Braket
# capitalization, e.g. "CNot"), and measured_qubits on results. The version bump
# changes the wheel filename so returning browsers fetch fresh, not a stale cache.
# 0.3.0: Category F parity pass. Browser-visible: print(circuit) now lays out one
# column per MOMENT (matching .depth and real Braket, where it previously printed
# one per gate and contradicted its own depth line in 12 notebooks) and renders
# Rx/Ry/Rz distinctly; sampling moved off numpy's global legacy RNG; an empty
# circuit's state_vector() raises like Braket's; unknown LocalSimulator backends
# are rejected as Braket rejects them; a float qubit index is a TypeError instead
# of silently building a different circuit. Bumped for the same cache reason.
__version__ = "0.3.0"


def _register_braket_aliases() -> None:
    """Make qcsim discoverable under the ``braket.*`` namespace when the
    real ``amazon-braket-sdk`` is not present.
    """

    if "braket" in sys.modules:
        return

    pkg = types.ModuleType("braket")
    pkg.__path__ = []  # mark as a namespace-style package

    circuits_mod = types.ModuleType("braket.circuits")
    circuits_mod.Circuit = Circuit  # type: ignore[attr-defined]

    devices_mod = types.ModuleType("braket.devices")
    devices_mod.LocalSimulator = LocalSimulator  # type: ignore[attr-defined]

    pkg.circuits = circuits_mod  # type: ignore[attr-defined]
    pkg.devices = devices_mod  # type: ignore[attr-defined]

    sys.modules["braket"] = pkg
    sys.modules["braket.circuits"] = circuits_mod
    sys.modules["braket.devices"] = devices_mod


_register_braket_aliases()
