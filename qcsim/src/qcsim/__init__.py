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
__version__ = "0.1.0"


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
