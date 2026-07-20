"""Tests for lib/utils/visualization.py."""

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pytest
from collections import Counter
from matplotlib.patches import FancyArrow

from lib.utils.visualization import plot_histogram, plot_bloch_angles


@pytest.fixture(autouse=True)
def close_figures():
    yield
    plt.close("all")


def arrow_tip(ax):
    """The Bloch arrow's endpoint, read back off the rendered patch.

    ``ax.arrow`` draws a ``FancyArrow`` polygon; its vertex farthest from the origin is
    the tip. Returns ``None`` when no arrow was drawn (the out-of-plane case).
    """
    arrows = [p for p in ax.patches if isinstance(p, FancyArrow)]
    assert len(arrows) <= 1, f"expected at most one arrow, got {len(arrows)}"
    if not arrows:
        return None
    return max(arrows[0].get_xy(), key=lambda v: v[0] ** 2 + v[1] ** 2)


def origin_markers(ax):
    """Point markers drawn on ``ax`` (the dashed axis lines carry no marker)."""
    return [line for line in ax.lines if line.get_marker() == "o"]


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

    def test_rejects_empty_counts(self):
        with pytest.raises(ValueError, match="at least one shot"):
            plot_histogram(Counter())

    def test_rejects_zero_total_counts(self):
        with pytest.raises(ValueError, match="at least one shot"):
            plot_histogram(Counter({"00": 0}))

    def test_draws_onto_a_supplied_axes(self):
        # The ``ax=`` path lets a caller compose a grid without re-implementing the body.
        fig, axes = plt.subplots(1, 2)
        returned = plot_histogram(Counter({"00": 5, "11": 5}), ax=axes[1])
        assert returned is fig
        assert len(axes[1].patches) == 2
        assert not axes[0].patches, "drew onto the wrong axes"


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

    # --- geometry: the arrow itself, not just the frame around it -------------------
    # Without these, the helper could draw the arrow backwards, at the wrong length, or
    # not at all and every assertion above would still pass.

    @pytest.mark.parametrize(
        "theta, phi, expected",
        [
            (0.0, 0.0, (0.0, 0.9)),  # |0> points to +z
            (np.pi, 0.0, (0.0, -0.9)),  # |1> points to -z
            (np.pi / 2, 0.0, (0.9, 0.0)),  # |+> points to +x
            (np.pi, np.pi, (0.0, -0.9)),  # phase is irrelevant at the poles
        ],
        ids=["zero", "one", "plus", "one-with-phase"],
    )
    def test_arrow_points_where_the_state_lives(self, theta, phi, expected):
        ax = plot_bloch_angles(theta=theta, phi=phi).axes[0]
        tip = arrow_tip(ax)
        assert tip is not None, "expected a drawn arrow"
        # The tip sits at 0.9 of the unit circle (the head is inset by head_length).
        assert tip[0] == pytest.approx(expected[0], abs=0.04)
        assert tip[1] == pytest.approx(expected[1], abs=0.04)

    def test_out_of_plane_state_is_visible_and_labeled(self):
        # |+i> (theta=pi/2, phi=pi/2) projects onto the X-Z slice as a single point. It
        # must not render as an invisible speck inside an otherwise empty circle.
        ax = plot_bloch_angles(theta=np.pi / 2, phi=np.pi / 2).axes[0]
        assert arrow_tip(ax) is None, "a zero-length arrow is an invisible speck"
        assert len(origin_markers(ax)) == 1, "the degenerate state must be marked"
        marker = origin_markers(ax)[0]
        assert marker.get_xydata()[0] == pytest.approx([0.0, 0.0])
        captions = [t.get_text() for t in ax.texts if "out of plane" in t.get_text()]
        assert captions == ["out of plane: y = +1.00"]

    def test_partial_phase_shortens_the_arrow_and_says_so(self):
        # At phi=pi/3 a fully PURE state projects to half the radius. Arrow length inside
        # a Bloch circle reads as purity, so the caption naming the out-of-plane component
        # is what keeps the drawing honest.
        ax = plot_bloch_angles(theta=np.pi / 2, phi=np.pi / 3).axes[0]
        tip = arrow_tip(ax)
        assert tip is not None
        assert tip[0] == pytest.approx(0.45, abs=0.04)  # 0.5 (in-plane) * 0.9
        assert any("out of plane" in t.get_text() for t in ax.texts)

    def test_in_plane_state_carries_no_out_of_plane_caption(self):
        ax = plot_bloch_angles(theta=np.pi / 2, phi=0.0).axes[0]
        assert not any("out of plane" in t.get_text() for t in ax.texts)

    def test_draws_onto_a_supplied_axes(self):
        # The notebook composes a 1x4 comparison grid through this path.
        fig, axes = plt.subplots(1, 2)
        returned = plot_bloch_angles(np.pi / 2, 0.0, title="|+>", ax=axes[0])
        assert returned is fig
        assert axes[0].get_title() == "|+>"
        assert arrow_tip(axes[0]) is not None
        assert not axes[1].patches, "drew onto the wrong axes"
