"""Pure-NumPy LocalSimulator that runs qcsim Circuit instances."""

from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING, Optional

import numpy as np

if TYPE_CHECKING:
    from .circuits import Circuit


class _Result:
    """Subset-compatible stand-in for braket.tasks.GateModelQuantumTaskResult."""

    def __init__(self, measurements: np.ndarray) -> None:
        self.measurements = measurements  # shape (shots, n_qubits), dtype int8

    @property
    def measurement_counts(self) -> Counter:
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
    """In-process state-vector simulator."""

    def __init__(self, backend: Optional[str] = None) -> None:
        # Accept and ignore a backend name for Braket-compat call sites.
        self._backend = backend or "default"

    def run(self, circuit: "Circuit", shots: int = 0) -> _Task:
        if shots <= 0:
            raise ValueError(
                "shots must be a positive integer; qcsim does not support analytic mode"
            )

        n = max(circuit.qubit_count, 1)
        state = circuit.state_vector()
        probs = np.abs(state) ** 2

        # Numerical-stability re-normalization (gate ops can accumulate tiny drift)
        total = probs.sum()
        if total > 0:
            probs = probs / total

        indices = np.random.choice(2**n, size=shots, p=probs)

        # Convert each sampled basis-state index into a bit vector.
        # Qubit 0 is the most-significant bit (big-endian).
        measurements = np.zeros((shots, n), dtype=np.int8)
        for j in range(n):
            shift = n - 1 - j
            measurements[:, j] = ((indices >> shift) & 1).astype(np.int8)

        return _Task(_Result(measurements))


__all__ = ["LocalSimulator"]
