"""Visualization utilities for quantum computation results."""

from collections import Counter

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.axes import Axes
from matplotlib.figure import Figure

# Below this in-plane magnitude the X-Z projection of the Bloch vector is too short to
# read as a direction, so the state is marked at the origin instead of drawn as a speck.
_IN_PLANE_EPS = 1e-3


def plot_histogram(
    counts: Counter,
    title: str = "Measurement Results",
    figsize: tuple[float, float] = (10, 5),
    ax: Axes | None = None,
) -> Figure:
    """Plot a histogram of measurement results.

    Draws onto ``ax`` when one is supplied — so a caller can compose a grid of panels
    without re-implementing this body — and otherwise creates its own figure sized by
    ``figsize`` (``figsize`` is ignored when ``ax`` is given, since the caller owns the
    layout). Returns the Figure either way.
    """
    sorted_counts = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    total = sum(count for _, count in sorted_counts)
    if total == 0:
        raise ValueError("plot_histogram requires non-empty counts with at least one shot")
    positions = range(len(sorted_counts))
    labels = [label for label, _ in sorted_counts]
    probabilities = [count / total for _, count in sorted_counts]

    owns_figure = ax is None
    if ax is None:
        fig, ax = plt.subplots(figsize=figsize)
    else:
        fig = ax.get_figure()

    ax.bar(positions, probabilities, color="#232f3e")
    ax.set_xticks(positions)
    ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=8)
    ax.set_ylabel("Probability")
    ax.set_title(title)
    ax.set_ylim(0, 1.0)
    if owns_figure:
        # Only lay out a figure we created — a caller composing subplots owns theirs.
        fig.tight_layout()
    return fig


def plot_bloch_angles(
    theta: float,
    phi: float,
    title: str = "Qubit State",
    ax: Axes | None = None,
) -> Figure:
    """Plot a qubit state on a simplified 2D Bloch representation: the X-Z slice.

    For ``|psi> = cos(theta/2)|0> + e^(i*phi) sin(theta/2)|1>`` the Bloch vector is
    ``(sin(theta)cos(phi), sin(theta)sin(phi), cos(theta))``. This is a flat drawing, so
    only the X and Z components are plotted; the Y component — the part of the phase that
    points out of the page — is reported in a caption instead of being dropped silently.

    Arrow length is therefore the IN-PLANE magnitude ``sqrt(x^2 + z^2)``, **not** state
    purity: every pure state whose ``phi`` tilts it off the X-Z plane draws shorter than
    the unit circle. ``|+i>`` (``theta=pi/2, phi=pi/2``) projects to a single point, and is
    drawn as a dot at the origin rather than as an invisible zero-length arrow.

    Draws onto ``ax`` when one is supplied and otherwise creates its own figure. Returns
    the Figure either way.
    """
    if ax is None:
        fig, ax = plt.subplots(figsize=(5, 5))
    else:
        fig = ax.get_figure()

    circle = plt.Circle((0, 0), 1, fill=False, color="black", linewidth=1.5)
    ax.add_patch(circle)

    x = np.sin(theta) * np.cos(phi)
    y = np.sin(theta) * np.sin(phi)
    z = np.cos(theta)
    in_plane = float(np.hypot(x, z))

    if in_plane < _IN_PLANE_EPS:
        # The Bloch vector points straight out of this slice (|+i>, |-i>). A zero-length
        # arrow renders as a head-width speck at the origin, which reads as "no state at
        # all" — mark the point explicitly and let the caption carry the phase.
        ax.plot(0, 0, marker="o", markersize=10, color="#ff9900", zorder=3)
    else:
        ax.arrow(
            0,
            0,
            x * 0.9,
            z * 0.9,
            head_width=0.05,
            head_length=0.03,
            fc="#ff9900",
            ec="#ff9900",
        )

    if abs(y) > _IN_PLANE_EPS:
        # Name the component this projection cannot show, so a shortened arrow is never
        # misread as a mixed state.
        ax.text(0, -1.26, f"out of plane: y = {y:+.2f}", ha="center", fontsize=8, color="#ff9900")

    ax.set_xlim(-1.3, 1.3)
    ax.set_ylim(-1.3, 1.3)
    ax.set_aspect("equal")
    ax.axhline(y=0, color="gray", linestyle="--", linewidth=0.5)
    ax.axvline(x=0, color="gray", linestyle="--", linewidth=0.5)
    ax.set_xlabel("X")
    ax.set_ylabel("Z")
    ax.set_title(title)
    ax.text(0, 1.1, "|0>", ha="center", fontsize=10)
    ax.text(0, -1.1, "|1>", ha="center", fontsize=10)
    return fig
