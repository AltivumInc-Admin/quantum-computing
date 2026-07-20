"""Pure-NumPy LocalSimulator that runs qcsim Circuit instances."""

from __future__ import annotations

import warnings
from collections import Counter
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from .circuits import Circuit


# qcsim's OWN sampler stream. Real Braket's LocalSimulator neither reads nor
# advances numpy's global legacy RNG: `np.random.seed(n)` does not make its
# histogram reproducible, and a run leaves every later `np.random.*` draw
# untouched. qcsim used `np.random.choice` (the global legacy stream) and so
# diverged on BOTH counts — a seeded notebook froze in the browser while the
# same notebook varied on the real SDK, and a run silently desynchronised every
# classical draw after it. A module-private Generator matches Braket exactly.
# tests/test_qcsim_parity.py seeds this via _seed_sampler for determinism.
#
# Constructed LAZILY, on the first run. `numpy.random` is a lazily-imported
# numpy submodule costing ~7ms locally (more under Pyodide, where qcsim is
# imported in a browser tab), and building the Generator at module scope would
# drag that whole cost into every `import braket.circuits` — including the many
# notebook cells that only build circuits and never sample. The previous
# `np.random.choice` call site deferred it the same way; keep that property.
_RNG: np.random.Generator | None = None

# Backend names real Braket's LocalSimulator accepts (verified by executing the
# installed SDK). qcsim implements exactly ONE engine — noiseless state vector —
# so it accepts the same names Braket does rather than inventing a narrower set,
# but warns loudly for the two that mean genuinely different physics.
_BRAKET_BACKENDS = ("braket_ahs", "braket_dm", "braket_sv", "default")

# Backends whose real-Braket semantics qcsim does NOT implement. Answering a
# density-matrix (noise) request with a clean noiseless distribution, silently,
# is the dishonest case this warning exists to remove.
_UNIMPLEMENTED_BACKENDS = {
    "braket_dm": "a density-matrix (noise) simulator",
    "braket_ahs": "an analog Hamiltonian (Rydberg) simulator",
}


def _sampler() -> np.random.Generator:
    """qcsim's private shot sampler, built on first use."""
    global _RNG
    if _RNG is None:
        _RNG = np.random.default_rng()
    return _RNG


def _seed_sampler(seed: int | None = None) -> None:
    """Reseed qcsim's private sampler.

    Test-only hook. There is deliberately no public seeding API: real Braket
    offers none either, and honouring ``np.random.seed`` is the exact divergence
    the private generator exists to remove.
    """
    global _RNG
    _RNG = np.random.default_rng(seed)


class _Result:
    """Subset-compatible stand-in for braket.tasks.GateModelQuantumTaskResult."""

    def __init__(self, measurements: np.ndarray, measured_qubits: list[int]) -> None:
        self.measurements = measurements  # shape (shots, n_qubits), dtype int8
        # The qubits each measurement column corresponds to, in their ORIGINAL
        # labels (Braket sets this too). For a compacted register these are the
        # distinct used qubits ascending — e.g. [0, 2] for h(0).cnot(0, 2). Lets
        # lib/utils/results.parse_counts validate its positional bitstring
        # assumption instead of silently trusting it.
        self.measured_qubits = measured_qubits

    @property
    def measurement_counts(self) -> Counter[str]:
        return Counter("".join(str(int(b)) for b in row) for row in self.measurements)

    @property
    def measurement_probabilities(self) -> dict[str, float]:
        counts = self.measurement_counts
        total = sum(counts.values()) or 1
        return {k: v / total for k, v in counts.items()}


class _Task:
    """Subset-compatible stand-in for braket.tasks.QuantumTask."""

    def __init__(self, result: _Result) -> None:
        self._result = result

    def result(self) -> _Result:
        return self._result


class LocalSimulator:
    """In-process state-vector simulator.

    qcsim has exactly one engine: a noiseless state-vector simulator. It has no
    noise channels and no analog-Hamiltonian support, and does not claim to.

    Args:
        backend: A Braket backend name. Validated against the same set real
            Braket accepts, so a typo fails here the way it would on the real
            SDK instead of running silently. Naming a backend qcsim does not
            implement (``braket_dm``, ``braket_ahs``) is accepted for
            call-site compatibility but warns, because the answer you get back
            is a noiseless state-vector one regardless of the name.

    Raises:
        ValueError: If ``backend`` is not one of the names real Braket accepts.
    """

    def __init__(self, backend: str | None = None) -> None:
        name = backend if backend is not None else "default"
        if name not in _BRAKET_BACKENDS:
            raise ValueError(f"Only the following devices are available {_BRAKET_BACKENDS}")
        if name in _UNIMPLEMENTED_BACKENDS:
            warnings.warn(
                f"qcsim has no {_UNIMPLEMENTED_BACKENDS[name]}: the browser simulator "
                f"answers a {name!r} request with its ONLY engine, a noiseless "
                "state-vector simulation. Results will differ from real Braket. "
                "Run this notebook locally against the real SDK for that backend.",
                RuntimeWarning,
                stacklevel=2,
            )
        self._backend = name

    def run(self, circuit: Circuit, shots: int = 0) -> _Task:
        if shots <= 0:
            raise ValueError(
                "shots must be a positive integer; qcsim does not support analytic mode"
            )

        if circuit.qubit_count == 0:
            # Match Braket, which refuses to run a gate-less circuit on a device.
            raise ValueError("Circuit must have at least one non-zero-qubit gate to run")

        # Guaranteed >= 1 by the guard above — no second, redundant floor here.
        n = circuit.qubit_count
        state = circuit.state_vector()
        probs = np.abs(state) ** 2

        # Numerical-stability re-normalization (gate ops can accumulate tiny drift)
        total = probs.sum()
        if total > 0:
            probs = probs / total

        indices = _sampler().choice(2**n, size=shots, p=probs)

        # Convert each sampled basis-state index into a bit vector.
        # Qubit 0 is the most-significant bit (big-endian).
        measurements = np.zeros((shots, n), dtype=np.int8)
        for j in range(n):
            shift = n - 1 - j
            measurements[:, j] = ((indices >> shift) & 1).astype(np.int8)

        # The measured register, in original qubit labels: the distinct used
        # qubits (e.g. [0, 2] for h(0).cnot(0, 2)). Guaranteed non-empty by the
        # zero-qubit guard above.
        measured_qubits = circuit._used_qubits()
        return _Task(_Result(measurements, measured_qubits))


__all__ = ["LocalSimulator"]
