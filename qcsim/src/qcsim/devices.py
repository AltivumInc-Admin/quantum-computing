"""Pure-NumPy LocalSimulator that runs qcsim Circuit instances."""

from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING, Optional

import numpy as np

if TYPE_CHECKING:
    from .circuits import Circuit


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

        if circuit.qubit_count == 0:
            # Match Braket, which refuses to run a gate-less circuit on a device.
            raise ValueError("Circuit must have at least one non-zero-qubit gate to run")

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

        # The measured register, in original qubit labels: the distinct used
        # qubits (e.g. [0, 2] for h(0).cnot(0, 2)). Guaranteed non-empty by the
        # zero-qubit guard above.
        measured_qubits = circuit._used_qubits()
        return _Task(_Result(measurements, measured_qubits))


__all__ = ["LocalSimulator"]
