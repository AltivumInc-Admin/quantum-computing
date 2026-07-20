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

# The Braket task-result schema tags each returned result type with this enum value
# (a str subclass), which is how the amplitudes are located by identity below.
_STATEVECTOR = "statevector"


def statevector(circuit) -> np.ndarray:
    """Return the exact final state vector of ``circuit`` as a complex ndarray.

    Works under both engines:

    * a qcsim circuit delegates to its ``state_vector()`` convenience;
    * a real Braket circuit has its INSTRUCTIONS replayed onto a fresh circuit,
      which is run on the local simulator in analytic mode (``shots=0``) with a
      ``StateVector`` result type attached. Working on a separate circuit
      matters: the real ``state_vector()`` mutates the circuit by appending a
      result type, and a helper must not edit its caller's circuit.

    Any result types already attached by the caller are deliberately NOT carried
    over. ``Circuit.copy()`` would bring them along and ``state_vector()``
    APPENDS, so the amplitudes would land last while ``values[0]`` returned
    whatever the caller attached first — a ``.probability()`` circuit would
    silently yield probabilities labelled as amplitudes. Some result types
    (``.sample()``) are not even legal at ``shots=0``. Replaying instructions
    sidesteps both, and the amplitudes are then selected by identity rather than
    by position.

    The circuit must be fully bound (no unresolved ``FreeParameter``).
    """
    if type(circuit).__module__.partition(".")[0] == "qcsim":
        return np.asarray(circuit.state_vector(), dtype=np.complex128)

    # Real Braket SDK. Import lazily: this branch only executes where the real
    # SDK is installed, and a module-level import would drag braket into the
    # import graph of the browser bundle (web/jupyterlite-build/build.sh stages
    # lib/ wholesale into the Pyodide lab, where only qcsim exists).
    from braket.circuits import Circuit  # lazy, for the same browser-safety reason

    global _local_simulator
    if _local_simulator is None:
        from braket.devices import LocalSimulator

        _local_simulator = LocalSimulator()

    # Replay the gates onto a fresh circuit: the caller's circuit is left untouched AND
    # none of their result types come with us (see the docstring).
    working = Circuit().add(circuit.instructions)
    working.state_vector()  # registers the StateVector result type
    result = _local_simulator.run(working, shots=0).result()

    # Select by identity, not by position — `values` is ordered by result-type
    # registration, so an index is only ever right by accident.
    for entry in result.result_types:
        if getattr(getattr(entry, "type", None), "type", None) == _STATEVECTOR:
            return np.asarray(entry.value, dtype=np.complex128)
    raise RuntimeError(
        "the analytic run returned no StateVector result type "
        f"(got {[getattr(e.type, 'type', None) for e in result.result_types]})"
    )
