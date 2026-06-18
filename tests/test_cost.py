"""Tests for lib/utils/cost.py."""

import pytest
from lib.utils.cost import estimate_cost, format_cost_warning


class TestEstimateCost:
    def test_ionq_cost(self):
        cost = estimate_cost("IonQ", shots=1000)
        assert cost == 0.30 + 0.01 * 1000

    def test_iqm_cost(self):
        cost = estimate_cost("IQM", shots=1000)
        assert cost == 0.30 + 0.00145 * 1000

    def test_quera_cost(self):
        cost = estimate_cost("QuEra", shots=1000)
        assert cost == 0.30 + 0.01 * 1000

    def test_rigetti_cost(self):
        cost = estimate_cost("Rigetti", shots=1000)
        assert cost == 0.30 + 0.00035 * 1000

    def test_sv1_cost(self):
        cost = estimate_cost("SV1", shots=1000, estimated_minutes=2.0)
        assert cost == 0.075 * 2.0

    def test_dm1_cost(self):
        cost = estimate_cost("DM1", shots=1000, estimated_minutes=3.0)
        assert cost == 0.075 * 3.0

    def test_tn1_cost(self):
        cost = estimate_cost("TN1", shots=1000, estimated_minutes=1.5)
        assert cost == 0.275 * 1.5

    def test_local_simulator_free(self):
        cost = estimate_cost("LocalSimulator", shots=10000, estimated_minutes=60.0)
        assert cost == 0.0

    def test_unknown_provider_raises(self):
        with pytest.raises(ValueError, match="Unknown provider"):
            estimate_cost("FakeQuantumCo", shots=100)

    def test_negative_shots_raises(self):
        # A negative input must fail loudly, not produce a negative "cost" that
        # silently passes a cost-awareness gate.
        with pytest.raises(ValueError, match="shots must be non-negative"):
            estimate_cost("IonQ", shots=-100)

    def test_negative_minutes_raises(self):
        with pytest.raises(ValueError, match="estimated_minutes must be non-negative"):
            estimate_cost("SV1", estimated_minutes=-5)

    def test_zero_shots_qpu(self):
        cost = estimate_cost("IonQ", shots=0)
        assert cost == 0.30

    def test_zero_minutes_simulator(self):
        cost = estimate_cost("SV1", shots=1000, estimated_minutes=0)
        assert cost == 0.0


class TestFormatCostWarning:
    def test_qpu_format(self):
        warning = format_cost_warning("IonQ", shots=1000)
        assert "$" in warning
        assert "1000 shots" in warning
        assert "IonQ" in warning

    def test_local_no_cost(self):
        warning = format_cost_warning("LocalSimulator")
        assert "No cost" in warning
        assert "local execution" in warning

    def test_simulator_format(self):
        warning = format_cost_warning("SV1", shots=500, estimated_minutes=2.0)
        assert "$" in warning
        assert "SV1" in warning
