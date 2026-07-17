"""Portable state-vector extraction that works under qcsim AND the real Braket SDK.

``Circuit.state_vector()`` is the one place the two engines' semantics diverge:

* qcsim (the pure-NumPy browser stand-in) computes the final amplitudes
  directly and returns a ``numpy.ndarray``;
* the real ``amazon-braket-sdk`` registers a ``StateVector`` result type on the
  circuit and returns the *circuit* (for chaining) — the amplitudes only exist
  on a device result after ``device.run(circuit, shots=0)``.

Notebook code written as ``sv = circuit.state_vector()`` therefore works in the
browser but raises ``TypeError`` under the real SDK the moment ``sv`` is used
as an array. ``statevector(circuit)`` hides that divergence: call it with a
circuit from either engine and get the exact final state as a complex ndarray.
"""

from __future__ import annotations

import numpy as np

# Lazily-initialized LocalSimulator shared by every real-SDK call. Notebook
# energy functions call ``statevector`` inside optimization/grid loops, and
# constructing a fresh simulator per call is measurable overhead. The variable
# lives at module level but is only ever populated inside the real-SDK branch
# below, so importing this module never touches braket (browser-safety).
_local_simulator = None


def statevector(circuit) -> np.ndarray:
    """Return the exact final state vector of ``circuit`` as a complex ndarray.

    Works under both engines:

    * a qcsim circuit delegates to its ``state_vector()`` convenience;
    * a real Braket circuit runs a COPY on the local simulator in analytic mode
      (``shots=0``) with a ``StateVector`` result type attached. The copy
      matters: the real ``state_vector()`` mutates the circuit by appending a
      result type, and a helper must not edit its caller's circuit.

    The circuit must be fully bound (no unresolved ``FreeParameter``).
    """
    if type(circuit).__module__.partition(".")[0] == "qcsim":
        return np.asarray(circuit.state_vector(), dtype=np.complex128)

    # Real Braket SDK. Import lazily: this branch only executes where the real
    # SDK is installed, and a module-level import would drag braket into the
    # import graph of the browser bundle (web/jupyterlite-build/build.sh stages
    # lib/ wholesale into the Pyodide lab, where only qcsim exists).
    global _local_simulator
    if _local_simulator is None:
        from braket.devices import LocalSimulator

        _local_simulator = LocalSimulator()

    working = circuit.copy()
    working.state_vector()  # registers the StateVector result type on the copy
    result = _local_simulator.run(working, shots=0).result()
    return np.asarray(result.values[0], dtype=np.complex128)
