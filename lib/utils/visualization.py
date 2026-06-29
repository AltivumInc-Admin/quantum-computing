"""Visualization utilities for quantum computation results."""

import matplotlib.pyplot as plt
import numpy as np
from collections import Counter


def plot_histogram(counts: Counter, title: str = "Measurement Results", figsize=(10, 5)):
    """Plot a histogram of measurement results."""
    sorted_counts = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    total = sum(count for _, count in sorted_counts)
    if total == 0:
        raise ValueError("plot_histogram requires non-empty counts with at least one shot")
    positions = range(len(sorted_counts))
    labels = [label for label, _ in sorted_counts]
    probabilities = [count / total for _, count in sorted_counts]

    fig, ax = plt.subplots(figsize=figsize)
    ax.bar(positions, probabilities, color="#232f3e")
    ax.set_xticks(positions)
    ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=8)
    ax.set_ylabel("Probability")
    ax.set_title(title)
    ax.set_ylim(0, 1.0)
    plt.tight_layout()
    return fig


def plot_bloch_angles(theta: float, phi: float, title: str = "Qubit State"):
    """Plot a qubit state on a simplified 2D Bloch representation."""
    fig, ax = plt.subplots(figsize=(5, 5))
    circle = plt.Circle((0, 0), 1, fill=False, color="black", linewidth=1.5)
    ax.add_patch(circle)

    x = np.sin(theta) * np.cos(phi)
    z = np.cos(theta)
    ax.arrow(0, 0, x * 0.9, z * 0.9, head_width=0.05, head_length=0.03, fc="#ff9900", ec="#ff9900")

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
