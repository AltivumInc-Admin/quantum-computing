"""Visualization utilities for qubit states and circuit results."""

import numpy as np
import matplotlib.pyplot as plt
from braket.devices import LocalSimulator
from braket.circuits import Circuit


def visualize_circuit_results(circuit: Circuit, shots: int = 1000, title: str = "Results"):
    """Run a circuit on local simulator and plot measurement histogram."""
    device = LocalSimulator()
    result = device.run(circuit, shots=shots).result()
    counts = result.measurement_counts

    sorted_items = sorted(counts.items())
    labels = [item[0] for item in sorted_items]
    values = [item[1] / shots for item in sorted_items]

    fig, ax = plt.subplots(figsize=(max(6, len(labels) * 0.8), 4))
    ax.bar(labels, values, color="#232f3e", edgecolor="#ff9900", linewidth=1.2)
    ax.set_xlabel("Measurement Outcome")
    ax.set_ylabel("Probability")
    ax.set_title(title)
    ax.set_ylim(0, 1.0)
    plt.tight_layout()
    return fig


def compare_states(circuits: dict[str, Circuit], shots: int = 1000):
    """Run multiple circuits and compare their output distributions side by side."""
    device = LocalSimulator()
    fig, axes = plt.subplots(1, len(circuits), figsize=(5 * len(circuits), 4))
    if len(circuits) == 1:
        axes = [axes]

    for ax, (name, circuit) in zip(axes, circuits.items()):
        result = device.run(circuit, shots=shots).result()
        counts = result.measurement_counts
        sorted_items = sorted(counts.items())
        labels = [item[0] for item in sorted_items]
        values = [item[1] / shots for item in sorted_items]
        ax.bar(labels, values, color="#232f3e")
        ax.set_title(name)
        ax.set_ylim(0, 1.0)
        ax.set_ylabel("Probability")

    plt.tight_layout()
    return fig
