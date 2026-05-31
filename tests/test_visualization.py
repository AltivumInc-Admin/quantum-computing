"""Tests for lib/utils/visualization.py."""

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pytest
from collections import Counter

from lib.utils.visualization import plot_histogram, plot_bloch_angles


@pytest.fixture(autouse=True)
def close_figures():
    yield
    plt.close("all")


class TestPlotHistogram:
    def test_returns_figure(self):
        counts = Counter({"00": 500, "11": 500})
        fig = plot_histogram(counts)
        assert isinstance(fig, plt.Figure)

    def test_title_applied(self):
        counts = Counter({"0": 700, "1": 300})
        fig = plot_histogram(counts, title="Test Title")
        ax = fig.axes[0]
        assert ax.get_title() == "Test Title"

    def test_single_state(self):
        counts = Counter({"000": 1000})
        fig = plot_histogram(counts)
        ax = fig.axes[0]
        assert len(ax.patches) == 1

    def test_ylabel_is_probability(self):
        counts = Counter({"0": 600, "1": 400})
        fig = plot_histogram(counts)
        ax = fig.axes[0]
        assert ax.get_ylabel() == "Probability"


class TestPlotBlochAngles:
    def test_returns_figure(self):
        fig = plot_bloch_angles(0, 0)
        assert isinstance(fig, plt.Figure)

    def test_zero_state(self):
        fig = plot_bloch_angles(theta=0, phi=0, title="|0> State")
        ax = fig.axes[0]
        assert ax.get_title() == "|0> State"

    def test_one_state(self):
        fig = plot_bloch_angles(theta=np.pi, phi=0, title="|1> State")
        ax = fig.axes[0]
        assert ax.get_title() == "|1> State"

    def test_superposition_state(self):
        fig = plot_bloch_angles(theta=np.pi / 2, phi=0)
        assert isinstance(fig, plt.Figure)
