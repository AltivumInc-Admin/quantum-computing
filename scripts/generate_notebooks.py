#!/usr/bin/env python3
"""Generate starter Jupyter notebooks for the workspace."""

import json


def create_notebook(filepath, title, description, section_guide):
    notebook = {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    f"# {title}\n",
                    "\n",
                    f"{description}\n",
                    "\n",
                    f"**Reference:** See [`{section_guide}`]({section_guide}) for concept explanations and context.",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "# Setup: Run this cell first\n",
                    "# Requires: pip install -e '.[dev]' from the project root (see `make setup`)\n",
                    "\n",
                    "from braket.circuits import Circuit\n",
                    "from braket.devices import LocalSimulator\n",
                    "import numpy as np\n",
                    "import matplotlib.pyplot as plt\n",
                    "\n",
                    "# Use local simulator by default (free, instant)\n",
                    "device = LocalSimulator()",
                ],
            },
        ],
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3.10.0"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    with open(filepath, "w") as f:
        json.dump(notebook, f, indent=1)


if __name__ == "__main__":
    # 00-foundations notebooks
    notebooks_00 = [
        (
            "00-foundations/notebooks/01-first-circuit.ipynb",
            "Your First Quantum Circuit",
            "Build, run, and measure a quantum circuit on the local simulator.",
        ),
        (
            "00-foundations/notebooks/02-single-qubit-gates.ipynb",
            "Single-Qubit Gates",
            "Explore X, Y, Z, H, S, T, and rotation gates. Visualize state transformations.",
        ),
        (
            "00-foundations/notebooks/03-multi-qubit-gates.ipynb",
            "Multi-Qubit Gates & Entanglement",
            "Create Bell states, explore CNOT, SWAP, and Toffoli gates.",
        ),
        (
            "00-foundations/notebooks/04-measurement-statistics.ipynb",
            "Measurement & Statistics",
            "Understand shot-based measurement, probability distributions, and statistical accuracy.",
        ),
        (
            "00-foundations/notebooks/05-circuit-composition.ipynb",
            "Circuit Composition",
            "Build larger circuits from reusable subcircuits using the shared library.",
        ),
    ]
    for path, title, desc in notebooks_00:
        create_notebook(path, title, desc, "../GUIDE.md")

    # 01-hardware notebooks
    notebooks_01 = [
        (
            "01-hardware/notebooks/01-device-discovery.ipynb",
            "Device Discovery",
            "Query Amazon Braket for available quantum devices and their properties.",
        ),
        (
            "01-hardware/notebooks/02-ionq-exploration.ipynb",
            "IonQ Trapped-Ion Exploration",
            "Explore IonQ's all-to-all connectivity and native gate set.",
        ),
        (
            "01-hardware/notebooks/03-iqm-exploration.ipynb",
            "IQM Superconducting Exploration",
            "Work with nearest-neighbor topology and transpilation.",
        ),
        (
            "01-hardware/notebooks/04-quera-analog.ipynb",
            "QuEra Analog Hamiltonian Simulation",
            "Define atom arrays and driving fields for analog quantum computing.",
        ),
        (
            "01-hardware/notebooks/05-simulator-comparison.ipynb",
            "Simulator Comparison",
            "Compare SV1, DM1, TN1, and local simulator performance and capabilities.",
        ),
        (
            "01-hardware/notebooks/06-noise-and-errors.ipynb",
            "Noise and Error Mitigation",
            "Study noise channels and basic error mitigation techniques.",
        ),
    ]
    for path, title, desc in notebooks_01:
        create_notebook(path, title, desc, "../GUIDE.md")

    # 02-algorithms notebooks
    notebooks_02 = [
        (
            "02-algorithms/notebooks/01-deutsch-jozsa.ipynb",
            "Deutsch-Jozsa Algorithm",
            "Determine if a function is constant or balanced with one query.",
        ),
        (
            "02-algorithms/notebooks/02-grovers-search.ipynb",
            "Grover's Search Algorithm",
            "Quadratic speedup for unstructured search. Build oracles and optimize iterations.",
        ),
        (
            "02-algorithms/notebooks/03-qft.ipynb",
            "Quantum Fourier Transform",
            "Build the QFT circuit and verify against classical FFT.",
        ),
        (
            "02-algorithms/notebooks/04-qpe.ipynb",
            "Quantum Phase Estimation",
            "Extract eigenvalues of unitary operators with controlled precision.",
        ),
        (
            "02-algorithms/notebooks/05-qaoa-maxcut.ipynb",
            "QAOA for MaxCut",
            "Solve graph optimization with the Quantum Approximate Optimization Algorithm.",
        ),
        (
            "02-algorithms/notebooks/06-amplitude-estimation.ipynb",
            "Amplitude Estimation",
            "Quadratic speedup for Monte Carlo estimation tasks.",
        ),
    ]
    for path, title, desc in notebooks_02:
        create_notebook(path, title, desc, "../GUIDE.md")

    # 03-quantum-ml notebooks
    notebooks_03 = [
        (
            "03-quantum-ml/notebooks/01-data-encoding.ipynb",
            "Quantum Data Encoding",
            "Encode classical data into quantum states: angle, amplitude, and IQP encodings.",
        ),
        (
            "03-quantum-ml/notebooks/02-quantum-kernels.ipynb",
            "Quantum Kernel Methods",
            "Compute quantum kernels and use them with classical SVMs.",
        ),
        (
            "03-quantum-ml/notebooks/03-variational-classifier.ipynb",
            "Variational Quantum Classifier",
            "Train a parameterized quantum circuit for binary classification.",
        ),
        (
            "03-quantum-ml/notebooks/04-pennylane-braket.ipynb",
            "PennyLane + Braket Integration",
            "Use PennyLane's automatic differentiation with Braket devices.",
        ),
        (
            "03-quantum-ml/notebooks/05-qnn-architecture.ipynb",
            "Quantum Neural Network Architectures",
            "Compare hardware-efficient and strongly-entangling QNN designs.",
        ),
        (
            "03-quantum-ml/notebooks/06-barren-plateaus.ipynb",
            "Barren Plateaus",
            "Diagnose vanishing gradients and apply mitigation strategies.",
        ),
        (
            "03-quantum-ml/notebooks/07-hybrid-ml-job.ipynb",
            "QML as a Hybrid Job",
            "Run quantum ML training at scale with Braket Hybrid Jobs.",
        ),
    ]
    for path, title, desc in notebooks_03:
        create_notebook(path, title, desc, "../GUIDE.md")

    # 04-quantum-chemistry notebooks
    notebooks_04 = [
        (
            "04-quantum-chemistry/notebooks/01-molecular-hamiltonians.ipynb",
            "Molecular Hamiltonians",
            "Build H2 and LiH Hamiltonians using OpenFermion and PySCF.",
        ),
        (
            "04-quantum-chemistry/notebooks/02-fermion-qubit-mapping.ipynb",
            "Fermion-to-Qubit Mappings",
            "Compare Jordan-Wigner and Bravyi-Kitaev transformations.",
        ),
        (
            "04-quantum-chemistry/notebooks/03-vqe-h2.ipynb",
            "VQE for Hydrogen (H2)",
            "Full Variational Quantum Eigensolver workflow for the simplest molecule.",
        ),
        (
            "04-quantum-chemistry/notebooks/04-vqe-lih.ipynb",
            "VQE for Lithium Hydride (LiH)",
            "Scale VQE to a larger molecule with active space selection.",
        ),
        (
            "04-quantum-chemistry/notebooks/05-ansatz-design.ipynb",
            "Ansatz Design Comparison",
            "UCCSD vs. hardware-efficient ansatze: depth, accuracy, trainability.",
        ),
        (
            "04-quantum-chemistry/notebooks/06-active-space.ipynb",
            "Active Space Selection",
            "Reduce qubit requirements by selecting chemically relevant orbitals.",
        ),
        (
            "04-quantum-chemistry/notebooks/07-excited-states.ipynb",
            "Excited State Calculation",
            "Go beyond ground state with SSVQE and subspace expansion.",
        ),
        (
            "04-quantum-chemistry/notebooks/08-hybrid-chemistry-job.ipynb",
            "Production VQE Hybrid Job",
            "Run chemistry VQE at production scale with Braket Hybrid Jobs.",
        ),
    ]
    for path, title, desc in notebooks_04:
        create_notebook(path, title, desc, "../GUIDE.md")

    # 05-hybrid-jobs notebooks
    notebooks_05 = [
        (
            "05-hybrid-jobs/notebooks/01-first-hybrid-job.ipynb",
            "Your First Hybrid Job",
            "Create, submit, and monitor a simple Braket Hybrid Job.",
        ),
        (
            "05-hybrid-jobs/notebooks/02-parametric-compilation.ipynb",
            "Parametric Compilation",
            "Speed up variational algorithms by compiling circuits once.",
        ),
        (
            "05-hybrid-jobs/notebooks/03-monitoring-metrics.ipynb",
            "Real-Time Monitoring",
            "Log and visualize custom metrics with CloudWatch integration.",
        ),
        (
            "05-hybrid-jobs/notebooks/04-checkpointing.ipynb",
            "Checkpointing & Recovery",
            "Save and restore state for fault-tolerant long-running jobs.",
        ),
        (
            "05-hybrid-jobs/notebooks/05-custom-containers.ipynb",
            "Custom Containers",
            "Build and deploy custom Docker images for specialized jobs.",
        ),
        (
            "05-hybrid-jobs/notebooks/06-pennylane-jobs.ipynb",
            "PennyLane Hybrid Jobs",
            "Run PennyLane variational workflows as managed Braket jobs.",
        ),
        (
            "05-hybrid-jobs/notebooks/07-production-patterns.ipynb",
            "Production Patterns",
            "Error handling, retries, cost controls, and deployment best practices.",
        ),
    ]
    for path, title, desc in notebooks_05:
        create_notebook(path, title, desc, "../GUIDE.md")

    print("All notebooks created successfully.")
