"""Shared pytest fixtures for the quantum workspace test suite."""

import pytest
from braket.circuits import Circuit
from braket.devices import LocalSimulator

from lib.circuits.common import ghz_state


@pytest.fixture(scope="session")
def local_simulator():
    """Session-scoped local simulator instance."""
    return LocalSimulator()


@pytest.fixture
def sample_bell_circuit():
    """A simple Bell pair circuit (H on qubit 0, CNOT 0->1)."""
    return Circuit().h(0).cnot(0, 1)


@pytest.fixture
def sample_ghz_circuit():
    """A 3-qubit GHZ state circuit."""
    return ghz_state(3)


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
