"""Shared pytest fixtures for the quantum workspace test suite."""

import pytest
from braket.devices import LocalSimulator


@pytest.fixture(scope="session")
def local_simulator():
    """Session-scoped local simulator instance."""
    return LocalSimulator()


class MockResult:
    """Mock Braket result for testing without AWS."""

    def __init__(self, measurements, measured_qubits=None):
        self.measurements = measurements
        # Only set the attribute when provided, so parse_counts' getattr default
        # path (no measured_qubits exposed) stays exercised by existing tests.
        if measured_qubits is not None:
            self.measured_qubits = measured_qubits


@pytest.fixture
def mock_result_factory():
    """Factory fixture for creating mock Braket results."""

    def _create(measurements, measured_qubits=None):
        return MockResult(measurements, measured_qubits)

    return _create


@pytest.fixture
def run_local(local_simulator):
    """Helper fixture that runs a circuit on the local simulator and returns the result."""

    def _run(circuit, shots=1000):
        return local_simulator.run(circuit, shots=shots).result()

    return _run


@pytest.fixture(autouse=True)
def _deterministic_qcsim_sampling():
    """Pin qcsim's sampler so the notebook tier cannot flake.

    Category F moved qcsim off numpy's global legacy RNG onto a private
    Generator, because real Braket never reads or advances the global one --
    a `np.random.seed(...)` in a notebook silently made qcsim's measurement
    sampling reproducible in the browser while the same cell was stochastic
    against the real SDK. That divergence is gone, which is correct, but it
    also means the 16 notebooks pairing a seed with `device.run(...)` now
    produce genuinely random histograms in CI.

    Seeding the private sampler here restores CI determinism WITHOUT restoring
    the divergence: notebooks still see Braket-faithful behavior, and only the
    test process pins the stream.
    """
    try:
        from qcsim import devices as _qcsim_devices
    except ImportError:  # qcsim not installed in this environment
        return
    seed = getattr(_qcsim_devices, "_seed_sampler", None)
    if seed is not None:
        seed(0)
