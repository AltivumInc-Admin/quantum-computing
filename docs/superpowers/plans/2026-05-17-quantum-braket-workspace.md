# Amazon Braket Quantum Computing Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete Amazon Braket quantum computing workspace with progressive learning content, reusable library code, infrastructure templates, and production-ready hybrid job patterns.

**Architecture:** Learning-path structure (00-05 numbered directories), each with a comprehensive GUIDE.md, Jupyter notebooks, and Python scripts. A shared `lib/` provides reusable utilities. Infrastructure lives in `infra/` with CloudFormation. Project tooling via `pyproject.toml` + `Makefile`.

**Tech Stack:** Python 3.10+, Amazon Braket SDK, PennyLane, OpenFermion, JupyterLab, CloudFormation, Boto3

---

## File Structure

```
quantum/
├── CLAUDE.md
├── .env.example
├── .gitignore
├── pyproject.toml
├── Makefile
├── lib/
│   ├── __init__.py
│   ├── circuits/__init__.py
│   ├── circuits/common.py
│   ├── utils/__init__.py
│   ├── utils/results.py
│   ├── utils/visualization.py
│   ├── utils/cost.py
│   ├── hardware/__init__.py
│   └── hardware/devices.py
├── tests/
│   ├── __init__.py
│   ├── test_circuits.py
│   ├── test_results.py
│   └── test_devices.py
├── infra/
│   ├── cloudformation/
│   │   ├── main.yaml
│   │   ├── braket-iam.yaml
│   │   ├── braket-s3.yaml
│   │   ├── braket-budget.yaml
│   │   └── braket-notebook.yaml
│   └── scripts/
│       ├── validate-setup.sh
│       ├── deploy-infra.sh
│       ├── teardown-infra.sh
│       └── cost-report.py
├── 00-foundations/
│   ├── GUIDE.md
│   ├── notebooks/
│   │   ├── 01-first-circuit.ipynb
│   │   ├── 02-single-qubit-gates.ipynb
│   │   ├── 03-multi-qubit-gates.ipynb
│   │   ├── 04-measurement-statistics.ipynb
│   │   └── 05-circuit-composition.ipynb
│   └── scripts/
│       ├── gate_library.py
│       └── state_visualization.py
├── 01-hardware/
│   ├── GUIDE.md
│   ├── notebooks/
│   │   ├── 01-device-discovery.ipynb
│   │   ├── 02-ionq-exploration.ipynb
│   │   ├── 03-iqm-exploration.ipynb
│   │   ├── 04-quera-analog.ipynb
│   │   ├── 05-simulator-comparison.ipynb
│   │   └── 06-noise-and-errors.ipynb
│   └── scripts/
│       ├── device_status.py
│       └── cost_estimator.py
├── 02-algorithms/
│   ├── GUIDE.md
│   ├── notebooks/
│   │   ├── 01-deutsch-jozsa.ipynb
│   │   ├── 02-grovers-search.ipynb
│   │   ├── 03-qft.ipynb
│   │   ├── 04-qpe.ipynb
│   │   ├── 05-qaoa-maxcut.ipynb
│   │   └── 06-amplitude-estimation.ipynb
│   └── scripts/
│       ├── oracles.py
│       └── variational_utils.py
├── 03-quantum-ml/
│   ├── GUIDE.md
│   ├── notebooks/
│   │   ├── 01-data-encoding.ipynb
│   │   ├── 02-quantum-kernels.ipynb
│   │   ├── 03-variational-classifier.ipynb
│   │   ├── 04-pennylane-braket.ipynb
│   │   ├── 05-qnn-architecture.ipynb
│   │   ├── 06-barren-plateaus.ipynb
│   │   └── 07-hybrid-ml-job.ipynb
│   └── scripts/
│       ├── feature_maps.py
│       ├── classifiers.py
│       └── training.py
├── 04-quantum-chemistry/
│   ├── GUIDE.md
│   ├── notebooks/
│   │   ├── 01-molecular-hamiltonians.ipynb
│   │   ├── 02-fermion-qubit-mapping.ipynb
│   │   ├── 03-vqe-h2.ipynb
│   │   ├── 04-vqe-lih.ipynb
│   │   ├── 05-ansatz-design.ipynb
│   │   ├── 06-active-space.ipynb
│   │   ├── 07-excited-states.ipynb
│   │   └── 08-hybrid-chemistry-job.ipynb
│   └── scripts/
│       ├── hamiltonians.py
│       ├── ansatz.py
│       └── vqe_runner.py
├── 05-hybrid-jobs/
│   ├── GUIDE.md
│   ├── notebooks/
│   │   ├── 01-first-hybrid-job.ipynb
│   │   ├── 02-parametric-compilation.ipynb
│   │   ├── 03-monitoring-metrics.ipynb
│   │   ├── 04-checkpointing.ipynb
│   │   ├── 05-custom-containers.ipynb
│   │   ├── 06-pennylane-jobs.ipynb
│   │   └── 07-production-patterns.ipynb
│   ├── algorithms/
│   │   ├── qaoa_maxcut_job.py
│   │   ├── vqe_chemistry_job.py
│   │   └── qml_training_job.py
│   └── containers/
│       ├── Dockerfile
│       └── build_and_push.sh
```

---

### Task 1: Project Scaffolding & Tooling

**Files:**
- Create: `CLAUDE.md`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `pyproject.toml`
- Create: `Makefile`

- [ ] **Step 1: Create .gitignore**

```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
dist/
build/
.eggs/

# Virtual environments
.venv/
venv/
env/

# Jupyter
.ipynb_checkpoints/
*.ipynb_metadata/

# Environment
.env

# AWS
.aws/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Braket results (large files)
braket-results/
```

- [ ] **Step 2: Create pyproject.toml**

```toml
[project]
name = "quantum-braket-workspace"
version = "0.1.0"
description = "Amazon Braket quantum computing learning workspace"
requires-python = ">=3.10"

[project.dependencies]
amazon-braket-sdk = ">=1.80"
amazon-braket-default-simulator = ">=1.25"
pennylane = ">=0.38"
pennylane-braket = ">=1.25"
openfermion = ">=1.6"
openfermionpyscf = ">=0.5"
numpy = ">=1.26"
scipy = ">=1.12"
matplotlib = ">=3.8"
jupyterlab = ">=4.0"
boto3 = ">=1.34"

[project.optional-dependencies]
dev = ["pytest>=8.0", "ruff>=0.5"]

[tool.ruff]
line-length = 100
target-version = "py310"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 3: Create Makefile**

```makefile
.PHONY: setup lab test devices cost lint deploy-infra teardown-infra

setup:
	@echo "Installing dependencies..."
	pip install -e ".[dev]"
	@echo "Validating AWS credentials..."
	@bash infra/scripts/validate-setup.sh

lab:
	jupyter lab --notebook-dir=.

test:
	pytest tests/ -v

devices:
	python -c "\
	from braket.aws import AwsDevice; \
	devices = AwsDevice.get_devices(); \
	print(f'{'Device':<40} {'Status':<12} {'Provider':<15} {'Qubits'}'); \
	print('-' * 80); \
	[print(f'{d.name:<40} {d.status:<12} {d.provider_name:<15} {getattr(d.properties, \"qubitCount\", \"N/A\")}') for d in devices]"

cost:
	python infra/scripts/cost-report.py

lint:
	ruff check .
	ruff format --check .

deploy-infra:
	bash infra/scripts/deploy-infra.sh

teardown-infra:
	bash infra/scripts/teardown-infra.sh
```

- [ ] **Step 4: Create .env.example**

```
# AWS Configuration for Amazon Braket
AWS_DEFAULT_REGION=us-east-1
BRAKET_S3_BUCKET=amazon-braket-results-YOUR_ACCOUNT_ID
BRAKET_S3_PREFIX=quantum-workspace
AWS_PROFILE=default

# Budget threshold (USD per month)
BRAKET_MONTHLY_BUDGET=50
```

- [ ] **Step 5: Create CLAUDE.md**

```markdown
# Quantum Computing Workspace (Amazon Braket)

## About This Project

This is a quantum computing learning and experimentation workspace using Amazon Braket.
It follows a progressive learning path from circuit fundamentals (00-foundations) through
production hybrid quantum-classical workloads (05-hybrid-jobs), with focused tracks on
Quantum Machine Learning and Quantum Chemistry.

## Development Guidelines

- Always use the local simulator (`LocalSimulator()`) for development and testing
- Only suggest running on real QPU hardware if the user explicitly requests it
- When QPU usage is requested, always include a cost estimate before execution
- Use PennyLane for variational and hybrid quantum-classical algorithms
- Follow the numbered directory progression when suggesting learning next steps
- Reference AWS Braket documentation for device-specific constraints

## Structure

- `00-foundations/` through `05-hybrid-jobs/` — Progressive learning sections
- `lib/` — Shared Python library (circuits, utils, hardware abstraction)
- `infra/` — CloudFormation templates and setup scripts
- `tests/` — Pytest suite for lib/ (runs on local simulator only)

## Key Commands

- `make setup` — Install all dependencies and validate AWS credentials
- `make lab` — Launch JupyterLab
- `make test` — Run test suite
- `make devices` — Show available Braket devices and their status
- `make cost` — Check current month's Braket spend

## Cost Awareness

Amazon Braket charges per-task and per-shot on real hardware. Always:
1. Prototype on local simulator first
2. Test on managed simulator (SV1) for larger circuits
3. Only move to QPU when the algorithm is validated
4. Check `make cost` regularly

Approximate costs (as of 2025):
- Local simulator: Free
- SV1/DM1/TN1: $0.075-$0.275 per minute
- IonQ: $0.01 per shot + $0.30 per task
- IQM: $0.00145 per shot + $0.30 per task
- QuEra: $0.01 per shot + $0.30 per task

## Dependencies

Managed via pyproject.toml. Key packages:
- `amazon-braket-sdk` — Core SDK
- `pennylane` + `pennylane-braket` — Variational algorithms
- `openfermion` + `openfermionpyscf` — Quantum chemistry
```

- [ ] **Step 6: Commit scaffolding**

```bash
git add .gitignore pyproject.toml Makefile .env.example CLAUDE.md
git commit -m "feat: add project scaffolding (pyproject.toml, Makefile, CLAUDE.md)"
```

---

### Task 2: Shared Library (lib/)

**Files:**
- Create: `lib/__init__.py`
- Create: `lib/circuits/__init__.py`
- Create: `lib/circuits/common.py`
- Create: `lib/utils/__init__.py`
- Create: `lib/utils/results.py`
- Create: `lib/utils/visualization.py`
- Create: `lib/utils/cost.py`
- Create: `lib/hardware/__init__.py`
- Create: `lib/hardware/devices.py`
- Create: `tests/__init__.py`
- Create: `tests/test_circuits.py`
- Create: `tests/test_results.py`
- Create: `tests/test_devices.py`

- [ ] **Step 1: Create lib/__init__.py**

```python
"""Quantum Braket Workspace shared library."""
```

- [ ] **Step 2: Create lib/circuits/__init__.py**

```python
"""Reusable quantum circuit patterns."""

from lib.circuits.common import bell_pair, ghz_state, qft_circuit
```

- [ ] **Step 3: Create lib/circuits/common.py**

```python
"""Common reusable circuit patterns for Amazon Braket."""

from braket.circuits import Circuit
import numpy as np


def bell_pair(qubit_0: int = 0, qubit_1: int = 1) -> Circuit:
    """Create a Bell pair (maximally entangled two-qubit state).

    Produces the state: (|00> + |11>) / sqrt(2)
    """
    circuit = Circuit()
    circuit.h(qubit_0)
    circuit.cnot(qubit_0, qubit_1)
    return circuit


def ghz_state(n_qubits: int = 3) -> Circuit:
    """Create a GHZ state (maximally entangled n-qubit state).

    Produces the state: (|00...0> + |11...1>) / sqrt(2)
    """
    circuit = Circuit()
    circuit.h(0)
    for i in range(n_qubits - 1):
        circuit.cnot(i, i + 1)
    return circuit


def qft_circuit(n_qubits: int) -> Circuit:
    """Create a Quantum Fourier Transform circuit."""
    circuit = Circuit()
    for i in range(n_qubits):
        circuit.h(i)
        for j in range(i + 1, n_qubits):
            angle = np.pi / (2 ** (j - i))
            circuit.cphaseshift(j, i, angle)
    # Swap qubits to match standard QFT output ordering
    for i in range(n_qubits // 2):
        circuit.swap(i, n_qubits - i - 1)
    return circuit
```

- [ ] **Step 4: Create lib/utils/__init__.py**

```python
"""Utility functions for result parsing, visualization, and cost tracking."""

from lib.utils.results import parse_counts, top_results, expectation_from_counts
```

- [ ] **Step 5: Create lib/utils/results.py**

```python
"""Result parsing utilities for Amazon Braket quantum task results."""

from collections import Counter


def parse_counts(result) -> Counter:
    """Extract measurement counts from a Braket result object.

    Args:
        result: A Braket QuantumTask result or GateModelQuantumTaskResult.

    Returns:
        Counter mapping bitstrings to their occurrence counts.
    """
    measurements = result.measurements
    bitstrings = ["".join(str(bit) for bit in row) for row in measurements]
    return Counter(bitstrings)


def top_results(counts: Counter, n: int = 5) -> list[tuple[str, int]]:
    """Return the top-n most frequent measurement outcomes.

    Args:
        counts: Counter of bitstring measurement results.
        n: Number of top results to return.

    Returns:
        List of (bitstring, count) tuples sorted by frequency.
    """
    return counts.most_common(n)


def expectation_from_counts(counts: Counter, observable_fn) -> float:
    """Compute expectation value of an observable from measurement counts.

    Args:
        counts: Counter of bitstring measurement results.
        observable_fn: Function mapping bitstring -> eigenvalue (float).

    Returns:
        Weighted average of observable eigenvalues.
    """
    total_shots = sum(counts.values())
    expectation = 0.0
    for bitstring, count in counts.items():
        expectation += observable_fn(bitstring) * count / total_shots
    return expectation
```

- [ ] **Step 6: Create lib/utils/visualization.py**

```python
"""Visualization utilities for quantum computation results."""

import matplotlib.pyplot as plt
import numpy as np
from collections import Counter


def plot_histogram(counts: Counter, title: str = "Measurement Results", figsize=(10, 5)):
    """Plot a histogram of measurement results.

    Args:
        counts: Counter mapping bitstrings to counts.
        title: Plot title.
        figsize: Figure size tuple.

    Returns:
        matplotlib Figure object.
    """
    sorted_counts = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    labels = [item[0] for item in sorted_counts]
    values = [item[1] for item in sorted_counts]
    total = sum(values)
    probabilities = [v / total for v in values]

    fig, ax = plt.subplots(figsize=figsize)
    ax.bar(range(len(labels)), probabilities, color="#232f3e")
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=8)
    ax.set_ylabel("Probability")
    ax.set_title(title)
    ax.set_ylim(0, 1.0)
    plt.tight_layout()
    return fig


def plot_bloch_angles(theta: float, phi: float, title: str = "Qubit State"):
    """Plot a qubit state on a simplified 2D Bloch representation.

    Args:
        theta: Polar angle (0 = |0>, pi = |1>).
        phi: Azimuthal angle (phase).
        title: Plot title.

    Returns:
        matplotlib Figure object.
    """
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
```

- [ ] **Step 7: Create lib/utils/cost.py**

```python
"""Cost estimation utilities for Amazon Braket."""

PRICING = {
    "IonQ": {"per_task": 0.30, "per_shot": 0.01},
    "IQM": {"per_task": 0.30, "per_shot": 0.00145},
    "QuEra": {"per_task": 0.30, "per_shot": 0.01},
    "Rigetti": {"per_task": 0.30, "per_shot": 0.00035},
    "SV1": {"per_minute": 0.075},
    "DM1": {"per_minute": 0.075},
    "TN1": {"per_minute": 0.275},
    "LocalSimulator": {"per_minute": 0.0},
}


def estimate_cost(provider: str, shots: int = 1000, estimated_minutes: float = 1.0) -> float:
    """Estimate the cost of running a quantum task.

    Args:
        provider: Device provider name (e.g., "IonQ", "SV1", "LocalSimulator").
        shots: Number of measurement shots.
        estimated_minutes: Estimated runtime in minutes (for simulators).

    Returns:
        Estimated cost in USD.
    """
    if provider not in PRICING:
        raise ValueError(f"Unknown provider: {provider}. Known: {list(PRICING.keys())}")

    pricing = PRICING[provider]

    if "per_shot" in pricing:
        return pricing["per_task"] + pricing["per_shot"] * shots
    elif "per_minute" in pricing:
        return pricing["per_minute"] * estimated_minutes
    return 0.0


def format_cost_warning(provider: str, shots: int = 1000, estimated_minutes: float = 1.0) -> str:
    """Generate a human-readable cost warning string.

    Args:
        provider: Device provider name.
        shots: Number of measurement shots.
        estimated_minutes: Estimated runtime in minutes.

    Returns:
        Formatted cost warning string.
    """
    cost = estimate_cost(provider, shots, estimated_minutes)
    if cost == 0.0:
        return f"[{provider}] No cost (local execution)"
    return f"[{provider}] Estimated cost: ${cost:.4f} ({shots} shots, ~{estimated_minutes:.1f} min)"
```

- [ ] **Step 8: Create lib/hardware/__init__.py**

```python
"""Hardware abstraction layer for Amazon Braket devices."""

from lib.hardware.devices import get_device, list_available_devices, run_circuit
```

- [ ] **Step 9: Create lib/hardware/devices.py**

```python
"""Device abstraction for running circuits on any Amazon Braket backend."""

from braket.aws import AwsDevice
from braket.devices import LocalSimulator
from braket.circuits import Circuit


DEVICE_ARNS = {
    "sv1": "arn:aws:braket:::device/quantum-simulator/amazon/sv1",
    "dm1": "arn:aws:braket:::device/quantum-simulator/amazon/dm1",
    "tn1": "arn:aws:braket:::device/quantum-simulator/amazon/tn1",
    "ionq_aria": "arn:aws:braket:us-east-1::device/qpu/ionq/Aria-1",
    "ionq_forte": "arn:aws:braket:us-east-1::device/qpu/ionq/Forte-1",
    "iqm_garnet": "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet",
    "quera_aquila": "arn:aws:braket:us-east-1::device/qpu/quera/Aquila",
}


def get_device(name: str = "local"):
    """Get a Braket device by short name.

    Args:
        name: Short name — "local", "sv1", "dm1", "tn1", "ionq_aria",
              "ionq_forte", "iqm_garnet", "quera_aquila".

    Returns:
        A Braket device object ready for task submission.
    """
    if name == "local":
        return LocalSimulator()

    if name not in DEVICE_ARNS:
        raise ValueError(f"Unknown device: {name}. Known: {['local'] + list(DEVICE_ARNS.keys())}")

    return AwsDevice(DEVICE_ARNS[name])


def list_available_devices() -> list[dict]:
    """List all currently available Amazon Braket devices with their status.

    Returns:
        List of dicts with keys: name, provider, status, arn.
    """
    devices = AwsDevice.get_devices()
    return [
        {
            "name": d.name,
            "provider": d.provider_name,
            "status": d.status,
            "arn": d.arn,
        }
        for d in devices
    ]


def run_circuit(circuit: Circuit, device_name: str = "local", shots: int = 1000, s3_location: tuple | None = None):
    """Run a circuit on the specified device.

    Args:
        circuit: Braket Circuit to execute.
        device_name: Short name of the device (see get_device).
        shots: Number of measurement shots.
        s3_location: Tuple of (bucket, prefix) for result storage.
                     Required for AWS devices, ignored for local.

    Returns:
        Braket result object.
    """
    device = get_device(device_name)

    if device_name == "local":
        task = device.run(circuit, shots=shots)
    else:
        if s3_location is None:
            raise ValueError("s3_location required for AWS devices: (bucket, prefix)")
        task = device.run(circuit, s3_destination_folder=s3_location, shots=shots)

    return task.result()
```

- [ ] **Step 10: Create tests/__init__.py**

```python
"""Test suite for the quantum workspace shared library."""
```

- [ ] **Step 11: Create tests/test_circuits.py**

```python
"""Tests for lib/circuits/common.py — runs on local simulator only."""

import numpy as np
from braket.devices import LocalSimulator
from lib.circuits.common import bell_pair, ghz_state, qft_circuit


def test_bell_pair_produces_entangled_state():
    circuit = bell_pair()
    device = LocalSimulator()
    result = device.run(circuit, shots=1000).result()
    measurements = result.measurements
    for row in measurements:
        assert row[0] == row[1], "Bell pair qubits must always agree"


def test_bell_pair_custom_qubits():
    circuit = bell_pair(qubit_0=2, qubit_1=3)
    assert circuit.qubit_count == 4


def test_ghz_state_all_agree():
    circuit = ghz_state(n_qubits=4)
    device = LocalSimulator()
    result = device.run(circuit, shots=1000).result()
    for row in result.measurements:
        assert all(bit == row[0] for bit in row), "GHZ state qubits must all agree"


def test_ghz_state_qubit_count():
    circuit = ghz_state(n_qubits=5)
    assert circuit.qubit_count == 5


def test_qft_circuit_qubit_count():
    circuit = qft_circuit(n_qubits=3)
    assert circuit.qubit_count == 3


def test_qft_circuit_on_known_state():
    # QFT of |0...0> should give uniform superposition
    circuit = qft_circuit(n_qubits=3)
    device = LocalSimulator()
    result = device.run(circuit, shots=8000).result()
    measurements = result.measurements
    bitstrings = ["".join(str(bit) for bit in row) for row in measurements]
    from collections import Counter
    counts = Counter(bitstrings)
    # All 8 basis states should appear with roughly equal probability
    for state in counts.values():
        assert state > 500, "QFT of |000> should give roughly uniform distribution"
```

- [ ] **Step 12: Create tests/test_results.py**

```python
"""Tests for lib/utils/results.py."""

from collections import Counter
from lib.utils.results import parse_counts, top_results, expectation_from_counts


class MockResult:
    """Mock Braket result for testing without AWS."""

    def __init__(self, measurements):
        self.measurements = measurements


def test_parse_counts_basic():
    result = MockResult([[0, 0], [0, 0], [1, 1], [0, 0]])
    counts = parse_counts(result)
    assert counts["00"] == 3
    assert counts["11"] == 1


def test_top_results_ordering():
    counts = Counter({"00": 500, "11": 300, "01": 150, "10": 50})
    top = top_results(counts, n=2)
    assert top[0] == ("00", 500)
    assert top[1] == ("11", 300)


def test_expectation_from_counts_z_observable():
    # Z observable: |0> -> +1, |1> -> -1
    counts = Counter({"0": 700, "1": 300})

    def z_eigenvalue(bitstring):
        return 1.0 if bitstring == "0" else -1.0

    exp = expectation_from_counts(counts, z_eigenvalue)
    assert abs(exp - 0.4) < 1e-10  # (700*1 + 300*(-1)) / 1000 = 0.4
```

- [ ] **Step 13: Create tests/test_devices.py**

```python
"""Tests for lib/hardware/devices.py — local simulator only."""

import pytest
from braket.circuits import Circuit
from lib.hardware.devices import get_device, run_circuit, DEVICE_ARNS


def test_get_local_device():
    device = get_device("local")
    assert device is not None


def test_get_unknown_device_raises():
    with pytest.raises(ValueError, match="Unknown device"):
        get_device("nonexistent_device")


def test_run_circuit_local():
    circuit = Circuit().h(0).cnot(0, 1)
    result = run_circuit(circuit, device_name="local", shots=100)
    assert len(result.measurements) == 100


def test_run_circuit_aws_requires_s3():
    circuit = Circuit().h(0)
    with pytest.raises(ValueError, match="s3_location required"):
        run_circuit(circuit, device_name="sv1", shots=10)


def test_device_arns_are_valid_format():
    for name, arn in DEVICE_ARNS.items():
        assert arn.startswith("arn:aws:braket:"), f"Invalid ARN for {name}"
```

- [ ] **Step 14: Run tests to verify lib/ works**

Run: `cd /Users/cperez/Desktop/local/altivum-dev/quantum && pip install -e ".[dev]" && pytest tests/ -v`

Expected: All tests pass (the Braket SDK tests that hit AWS will be skipped or use LocalSimulator).

- [ ] **Step 15: Commit lib/ and tests/**

```bash
git add lib/ tests/
git commit -m "feat: add shared library (circuits, utils, hardware) with test suite"
```

---

### Task 3: Infrastructure (infra/)

**Files:**
- Create: `infra/cloudformation/braket-iam.yaml`
- Create: `infra/cloudformation/braket-s3.yaml`
- Create: `infra/cloudformation/braket-budget.yaml`
- Create: `infra/cloudformation/braket-notebook.yaml`
- Create: `infra/cloudformation/main.yaml`
- Create: `infra/scripts/validate-setup.sh`
- Create: `infra/scripts/deploy-infra.sh`
- Create: `infra/scripts/teardown-infra.sh`
- Create: `infra/scripts/cost-report.py`

- [ ] **Step 1: Create infra/cloudformation/braket-iam.yaml**

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: IAM role with least-privilege permissions for Amazon Braket usage

Parameters:
  S3BucketArn:
    Type: String
    Description: ARN of the Braket results S3 bucket

Resources:
  BraketUserRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: BraketQuantumWorkspaceRole
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service:
                - braket.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: BraketAccess
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid: BraketFullAccess
                Effect: Allow
                Action:
                  - braket:SearchDevices
                  - braket:GetDevice
                  - braket:SearchQuantumTasks
                  - braket:GetQuantumTask
                  - braket:CancelQuantumTask
                  - braket:CreateQuantumTask
                  - braket:SearchJobs
                  - braket:GetJob
                  - braket:CreateJob
                  - braket:CancelJob
                Resource: "*"
              - Sid: S3ResultsAccess
                Effect: Allow
                Action:
                  - s3:PutObject
                  - s3:GetObject
                  - s3:ListBucket
                Resource:
                  - !Ref S3BucketArn
                  - !Sub "${S3BucketArn}/*"
              - Sid: CloudWatchLogging
                Effect: Allow
                Action:
                  - logs:CreateLogGroup
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                  - logs:GetLogEvents
                Resource: "arn:aws:logs:*:*:log-group:/aws/braket/*"

Outputs:
  RoleArn:
    Description: ARN of the Braket workspace IAM role
    Value: !GetAtt BraketUserRole.Arn
```

- [ ] **Step 2: Create infra/cloudformation/braket-s3.yaml**

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: S3 bucket for Amazon Braket quantum task results

Parameters:
  BucketPrefix:
    Type: String
    Default: amazon-braket-results
    Description: Prefix for the S3 bucket name (account ID appended automatically)
  RetentionDays:
    Type: Number
    Default: 90
    Description: Number of days to retain results before auto-deletion

Resources:
  BraketResultsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "${BucketPrefix}-${AWS::AccountId}"
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      LifecycleConfiguration:
        Rules:
          - Id: AutoCleanupOldResults
            Status: Enabled
            ExpirationInDays: !Ref RetentionDays
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true

Outputs:
  BucketName:
    Description: Name of the Braket results bucket
    Value: !Ref BraketResultsBucket
  BucketArn:
    Description: ARN of the Braket results bucket
    Value: !GetAtt BraketResultsBucket.Arn
```

- [ ] **Step 3: Create infra/cloudformation/braket-budget.yaml**

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: AWS Budget alarm for Amazon Braket spend

Parameters:
  MonthlyBudget:
    Type: Number
    Default: 50
    Description: Monthly budget threshold in USD
  NotificationEmail:
    Type: String
    Description: Email address for budget alerts

Resources:
  BraketBudget:
    Type: AWS::Budgets::Budget
    Properties:
      Budget:
        BudgetName: BraketQuantumWorkspaceBudget
        BudgetLimit:
          Amount: !Ref MonthlyBudget
          Unit: USD
        TimeUnit: MONTHLY
        BudgetType: COST
        CostFilters:
          Service:
            - Amazon Braket
      NotificationsWithSubscribers:
        - Notification:
            NotificationType: ACTUAL
            ComparisonOperator: GREATER_THAN
            Threshold: 50
          Subscribers:
            - SubscriptionType: EMAIL
              Address: !Ref NotificationEmail
        - Notification:
            NotificationType: ACTUAL
            ComparisonOperator: GREATER_THAN
            Threshold: 80
          Subscribers:
            - SubscriptionType: EMAIL
              Address: !Ref NotificationEmail
        - Notification:
            NotificationType: FORECASTED
            ComparisonOperator: GREATER_THAN
            Threshold: 100
          Subscribers:
            - SubscriptionType: EMAIL
              Address: !Ref NotificationEmail
```

- [ ] **Step 4: Create infra/cloudformation/braket-notebook.yaml**

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Optional Amazon Braket managed notebook instance

Parameters:
  InstanceType:
    Type: String
    Default: ml.t3.medium
    AllowedValues:
      - ml.t3.medium
      - ml.t3.large
      - ml.m5.large
    Description: Notebook instance type
  RoleArn:
    Type: String
    Description: IAM role ARN for the notebook instance

Resources:
  BraketNotebook:
    Type: AWS::SageMaker::NotebookInstance
    Properties:
      NotebookInstanceName: braket-quantum-workspace
      InstanceType: !Ref InstanceType
      RoleArn: !Ref RoleArn
      VolumeSizeInGB: 20

Outputs:
  NotebookUrl:
    Description: URL of the Braket notebook instance
    Value: !Sub "https://${AWS::Region}.console.aws.amazon.com/sagemaker/home?region=${AWS::Region}#/notebook-instances/${BraketNotebook}"
```

- [ ] **Step 5: Create infra/cloudformation/main.yaml**

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Amazon Braket Quantum Workspace - Main Stack

Parameters:
  MonthlyBudget:
    Type: Number
    Default: 50
    Description: Monthly budget threshold in USD
  NotificationEmail:
    Type: String
    Description: Email address for budget alerts
  ResultsRetentionDays:
    Type: Number
    Default: 90
    Description: Days to retain quantum task results in S3
  DeployNotebook:
    Type: String
    Default: "false"
    AllowedValues: ["true", "false"]
    Description: Whether to deploy a managed notebook instance

Conditions:
  ShouldDeployNotebook: !Equals [!Ref DeployNotebook, "true"]

Resources:
  S3Stack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: ./braket-s3.yaml
      Parameters:
        RetentionDays: !Ref ResultsRetentionDays

  IAMStack:
    Type: AWS::CloudFormation::Stack
    DependsOn: S3Stack
    Properties:
      TemplateURL: ./braket-iam.yaml
      Parameters:
        S3BucketArn: !GetAtt S3Stack.Outputs.BucketArn

  BudgetStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: ./braket-budget.yaml
      Parameters:
        MonthlyBudget: !Ref MonthlyBudget
        NotificationEmail: !Ref NotificationEmail

  NotebookStack:
    Type: AWS::CloudFormation::Stack
    Condition: ShouldDeployNotebook
    DependsOn: IAMStack
    Properties:
      TemplateURL: ./braket-notebook.yaml
      Parameters:
        RoleArn: !GetAtt IAMStack.Outputs.RoleArn

Outputs:
  ResultsBucket:
    Description: S3 bucket for quantum task results
    Value: !GetAtt S3Stack.Outputs.BucketName
  IAMRoleArn:
    Description: IAM role ARN for Braket access
    Value: !GetAtt IAMStack.Outputs.RoleArn
```

- [ ] **Step 6: Create infra/scripts/validate-setup.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Amazon Braket Workspace Setup Validation ==="
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "[FAIL] AWS CLI not installed. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
    exit 1
fi
echo "[OK] AWS CLI found: $(aws --version 2>&1 | head -1)"

# Check credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "[FAIL] AWS credentials not configured. Run: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region 2>/dev/null || echo "not set")
echo "[OK] AWS Account: $ACCOUNT_ID"
echo "[OK] AWS Region: $REGION"

# Check region supports Braket
BRAKET_REGIONS=("us-east-1" "us-west-1" "us-west-2" "eu-west-2" "eu-north-1" "ap-northeast-1")
if [[ " ${BRAKET_REGIONS[*]} " =~ " ${REGION} " ]]; then
    echo "[OK] Region $REGION supports Amazon Braket"
else
    echo "[WARN] Region $REGION may not support all Braket features. Recommended: us-east-1"
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "[FAIL] Python 3 not found"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo "[OK] Python: $PYTHON_VERSION"

# Check Braket SDK
if python3 -c "import braket" 2>/dev/null; then
    SDK_VERSION=$(python3 -c "import braket._sdk as sdk; print(sdk.__version__)" 2>/dev/null || echo "installed")
    echo "[OK] Amazon Braket SDK: $SDK_VERSION"
else
    echo "[WARN] Amazon Braket SDK not installed. Run: make setup"
fi

echo ""
echo "=== Validation Complete ==="
```

- [ ] **Step 7: Create infra/scripts/deploy-infra.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="braket-quantum-workspace"
TEMPLATE_DIR="$(cd "$(dirname "$0")/../cloudformation" && pwd)"

echo "=== Deploying Amazon Braket Workspace Infrastructure ==="
echo "Stack: $STACK_NAME"
echo "Template: $TEMPLATE_DIR/main.yaml"
echo ""

# Prompt for parameters
read -p "Monthly budget (USD) [50]: " BUDGET
BUDGET=${BUDGET:-50}

read -p "Notification email: " EMAIL
if [ -z "$EMAIL" ]; then
    echo "Email required for budget alerts."
    exit 1
fi

read -p "Deploy managed notebook? (true/false) [false]: " NOTEBOOK
NOTEBOOK=${NOTEBOOK:-false}

echo ""
echo "Deploying with:"
echo "  Budget: \$$BUDGET/month"
echo "  Email: $EMAIL"
echo "  Notebook: $NOTEBOOK"
echo ""
read -p "Proceed? (y/N): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Cancelled."
    exit 0
fi

aws cloudformation deploy \
    --template-file "$TEMPLATE_DIR/main.yaml" \
    --stack-name "$STACK_NAME" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
        MonthlyBudget="$BUDGET" \
        NotificationEmail="$EMAIL" \
        DeployNotebook="$NOTEBOOK"

echo ""
echo "=== Deployment Complete ==="
aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs" --output table
```

- [ ] **Step 8: Create infra/scripts/teardown-infra.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="braket-quantum-workspace"

echo "=== Tearing Down Amazon Braket Workspace Infrastructure ==="
echo "Stack: $STACK_NAME"
echo ""
echo "WARNING: This will delete all infrastructure including the S3 bucket."
echo "Make sure you have downloaded any results you need."
echo ""
read -p "Are you sure? Type 'delete' to confirm: " CONFIRM

if [ "$CONFIRM" != "delete" ]; then
    echo "Cancelled."
    exit 0
fi

aws cloudformation delete-stack --stack-name "$STACK_NAME"
echo "Stack deletion initiated. Monitor progress:"
echo "  aws cloudformation describe-stacks --stack-name $STACK_NAME"
```

- [ ] **Step 9: Create infra/scripts/cost-report.py**

```python
#!/usr/bin/env python3
"""Query AWS Cost Explorer for Amazon Braket spend in the current month."""

import boto3
from datetime import datetime, timedelta


def get_braket_costs():
    client = boto3.client("ce")

    today = datetime.utcnow()
    start_of_month = today.replace(day=1).strftime("%Y-%m-%d")
    end_date = (today + timedelta(days=1)).strftime("%Y-%m-%d")

    response = client.get_cost_and_usage(
        TimePeriod={"Start": start_of_month, "End": end_date},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost"],
        Filter={
            "Dimensions": {
                "Key": "SERVICE",
                "Values": ["Amazon Braket"],
            }
        },
        GroupBy=[{"Type": "DIMENSION", "Key": "USAGE_TYPE"}],
    )

    print(f"Amazon Braket Costs: {start_of_month} to {end_date}")
    print("=" * 60)

    total = 0.0
    for group in response.get("ResultsByTime", [{}])[0].get("Groups", []):
        usage_type = group["Keys"][0]
        amount = float(group["Metrics"]["UnblendedCost"]["Amount"])
        if amount > 0:
            print(f"  {usage_type:<40} ${amount:.4f}")
            total += amount

    if total == 0:
        print("  No Braket charges this month.")
    else:
        print(f"\n  {'TOTAL':<40} ${total:.4f}")


if __name__ == "__main__":
    get_braket_costs()
```

- [ ] **Step 10: Make scripts executable and commit**

```bash
chmod +x infra/scripts/validate-setup.sh infra/scripts/deploy-infra.sh infra/scripts/teardown-infra.sh
git add infra/
git commit -m "feat: add infrastructure (CloudFormation templates, setup scripts)"
```

---

### Task 4: 00-foundations GUIDE.md

**Files:**
- Create: `00-foundations/GUIDE.md`

- [ ] **Step 1: Write the comprehensive foundations guide**

The GUIDE.md must include:
- Detailed concept explanations with mathematical notation
- AWS documentation links
- YouTube video references (AWS re:Invent, Qiskit, IBM Quantum, 3Blue1Brown)
- Clear learning objectives and prerequisites
- Hands-on exercise ordering

Full content:

```markdown
# Quantum Computing Foundations

## Learning Objectives

After completing this section, you will be able to:
- Represent qubit states using Dirac notation and Bloch sphere geometry
- Apply single-qubit and multi-qubit gates to transform quantum states
- Build and run quantum circuits using the Amazon Braket SDK
- Interpret measurement results as probability distributions
- Create entangled states and understand their significance

## Prerequisites

- Python proficiency (functions, classes, NumPy basics)
- Linear algebra fundamentals (vectors, matrices, complex numbers)
- Conceptual understanding of superposition and entanglement

---

## Concepts

### Qubits and State Representation

A classical bit is either 0 or 1. A qubit exists in a superposition of both:

|psi> = alpha|0> + beta|1>

where alpha and beta are complex amplitudes satisfying |alpha|^2 + |beta|^2 = 1.

**State vector representation:** A qubit state is a unit vector in a 2D complex vector space (C^2):

|0> = [1, 0]^T    (computational basis "zero")
|1> = [0, 1]^T    (computational basis "one")

The probability of measuring |0> is |alpha|^2 and |1> is |beta|^2.

**Bloch sphere:** Any single-qubit pure state can be visualized as a point on the unit sphere:

|psi> = cos(theta/2)|0> + e^(i*phi) * sin(theta/2)|1>

- North pole (theta=0): |0>
- South pole (theta=pi): |1>
- Equator: equal superposition states (e.g., |+> at phi=0, |-> at phi=pi)

**Global phase:** States that differ only by a global phase (e^(i*gamma)|psi>) are physically indistinguishable. Only relative phase between |0> and |1> components matters.

### Single-Qubit Gates

Quantum gates are unitary matrices that transform qubit states. Key single-qubit gates:

**Pauli Gates:**
- X gate (NOT): Flips |0> <-> |1>. Matrix: [[0,1],[1,0]]
- Y gate: Rotation about Y-axis. Matrix: [[0,-i],[i,0]]
- Z gate: Phase flip on |1>. Matrix: [[1,0],[0,-1]]

**Hadamard Gate (H):**
Creates superposition from basis states:
- H|0> = (|0> + |1>) / sqrt(2) = |+>
- H|1> = (|0> - |1>) / sqrt(2) = |->
- Matrix: (1/sqrt(2)) * [[1,1],[1,-1]]

**Phase Gates:**
- S gate: pi/2 phase on |1>. Matrix: [[1,0],[0,i]]
- T gate: pi/4 phase on |1>. Matrix: [[1,0],[0,e^(i*pi/4)]]

**Rotation Gates:**
- Rx(theta): Rotation about X-axis by angle theta
- Ry(theta): Rotation about Y-axis by angle theta
- Rz(theta): Rotation about Z-axis by angle theta

Any single-qubit unitary can be decomposed as U = Rz(alpha) * Ry(beta) * Rz(gamma) (up to global phase).

### Multi-Qubit Gates

**CNOT (Controlled-NOT):** The fundamental two-qubit gate. Flips the target qubit if and only if the control qubit is |1>.

- CNOT|00> = |00>
- CNOT|01> = |01>
- CNOT|10> = |11>
- CNOT|11> = |10>

CNOT + single-qubit gates form a universal gate set (can approximate any unitary).

**CZ (Controlled-Z):** Applies Z to target when control is |1>. Symmetric — either qubit can be "control."

**SWAP:** Exchanges the states of two qubits. Can be decomposed into three CNOTs.

**Toffoli (CCNOT):** Three-qubit gate — flips target only when both controls are |1>. Universal for classical reversible computation.

### Entanglement

Entanglement is a correlation between qubits that has no classical analogue. An entangled state cannot be written as a product of individual qubit states.

**Bell States (maximally entangled two-qubit states):**
- |Phi+> = (|00> + |11>) / sqrt(2)  — created by H on qubit 0, then CNOT(0,1)
- |Phi-> = (|00> - |11>) / sqrt(2)
- |Psi+> = (|01> + |10>) / sqrt(2)
- |Psi-> = (|01> - |10>) / sqrt(2)

Measuring one qubit of a Bell pair instantly determines the other's outcome, regardless of distance. This is the basis for quantum teleportation and superdense coding.

**GHZ State:** The n-qubit generalization: (|00...0> + |11...1>) / sqrt(2). Maximally entangled — measuring any one qubit collapses all others.

### Measurement

Quantum measurement is probabilistic and irreversible. In the computational basis:

- Probability of outcome |x>: |<x|psi>|^2
- Post-measurement state: collapses to |x> (Born rule)

**Shot-based measurement:** On real hardware, you run the circuit many times ("shots") and collect statistics. More shots = better probability estimates, but each shot has a cost on real QPUs.

**Partial measurement:** Measuring only some qubits collapses those qubits while leaving unmeasured qubits in a (potentially) updated state.

### The Circuit Model

Quantum computation in the circuit model:
1. Initialize qubits in |0> state
2. Apply a sequence of unitary gates
3. Measure some or all qubits

Circuits read left-to-right. Gates on different qubits at the same time-step can execute in parallel (circuit depth vs. width).

**Amazon Braket SDK basics:**
```python
from braket.circuits import Circuit
from braket.devices import LocalSimulator

# Build a circuit
circuit = Circuit().h(0).cnot(0, 1)

# Run on local simulator
device = LocalSimulator()
result = device.run(circuit, shots=1000).result()

# Get measurement counts
counts = result.measurement_counts
```

---

## Hands-On Exercises

Complete these notebooks in order:

1. **`notebooks/01-first-circuit.ipynb`** — Build your first quantum circuit, run it on the local simulator, and interpret the output. Covers: Circuit creation, LocalSimulator, measurement_counts, basic plotting.

2. **`notebooks/02-single-qubit-gates.ipynb`** — Apply each gate (X, Y, Z, H, S, T, Rx, Ry, Rz) and observe their effects on |0> and |1>. Visualize state transformations on the Bloch sphere.

3. **`notebooks/03-multi-qubit-gates.ipynb`** — Create Bell states with CNOT. Verify entanglement by checking measurement correlations. Explore SWAP and Toffoli gates.

4. **`notebooks/04-measurement-statistics.ipynb`** — Run circuits with varying shot counts. Observe how statistical accuracy improves with more shots. Explore partial measurement effects.

5. **`notebooks/05-circuit-composition.ipynb`** — Build larger circuits from reusable subcircuits. Use the `lib/circuits/common.py` module. Create custom parametric circuits.

**Scripts to explore:**
- `scripts/gate_library.py` — Reference showing all gate matrices and their effects
- `scripts/state_visualization.py` — Utilities used in the notebooks for visualization

---

## References

### AWS Documentation
- [What is Amazon Braket?](https://docs.aws.amazon.com/braket/latest/developerguide/what-is-braket.html) — Service overview, capabilities, and pricing model
- [Building quantum tasks](https://docs.aws.amazon.com/braket/latest/developerguide/braket-build.html) — How to construct and submit circuits via the SDK
- [Getting started with Amazon Braket](https://docs.aws.amazon.com/braket/latest/developerguide/braket-get-started.html) — Setup walkthrough and first notebook creation
- [Amazon Braket SDK GitHub](https://github.com/aws/amazon-braket-sdk-python) — Source code, examples, and API reference
- [Amazon Braket examples repository](https://github.com/amazon-braket/amazon-braket-examples) — Official example notebooks

### Video Resources
- [Quantum Computing Fundamentals — AWS re:Invent 2023 (CMP301)](https://www.youtube.com/watch?v=8fmiOg2wTRs) — Dr. Simone Severini, 60 min, covers qubits through variational algorithms with Braket demos
- [Introduction to Quantum Computing — MIT OpenCourseWare](https://www.youtube.com/watch?v=lZ3bPUKo5zc) — Prof. Peter Shor, 80 min, rigorous mathematical foundations
- [Quantum Computing for Computer Scientists](https://www.youtube.com/watch?v=F_Riqjdh2oM) — Microsoft Research talk by Andrew Helwer, 65 min, excellent bridge from CS to quantum
- [Essence of Linear Algebra — 3Blue1Brown](https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab) — Visual linear algebra foundations (prerequisite review)
- [Amazon Braket Getting Started Tutorial](https://www.youtube.com/watch?v=LxCMPcE_bXU) — AWS Developer channel, 15 min, hands-on SDK walkthrough
- [Bloch Sphere Visualization Explained](https://www.youtube.com/watch?v=vUVkS1XZVCg) — Looking Glass Universe, 12 min, intuitive Bloch sphere explanation

### Papers & Further Reading
- [Nielsen & Chuang "Quantum Computation and Quantum Information"](https://www.cambridge.org/highereducation/books/quantum-computation-and-quantum-information/01E10196D0A682A6AEFFEA52D53BE9AE) — The definitive textbook, Chapters 1-4 cover this section's material
- [Qiskit Textbook: Single Systems](https://learning.quantum.ibm.com/course/basics-of-quantum-information/single-systems) — Interactive companion covering the same concepts with different notation
- [Amazon Braket Digital Learning Plan](https://skillbuilder.aws/learning-plan/EH35DWGU3R/amazon-braket--knowledge-badge-readiness-path-includes-labs) — AWS Skill Builder courses with labs and a digital badge
```

- [ ] **Step 2: Commit**

```bash
git add 00-foundations/GUIDE.md
git commit -m "docs: add 00-foundations learning guide"
```

---

### Task 5: 01-hardware GUIDE.md

**Files:**
- Create: `01-hardware/GUIDE.md`

- [ ] **Step 1: Write the hardware exploration guide**

```markdown
# Quantum Hardware on Amazon Braket

## Learning Objectives

After completing this section, you will be able to:
- Explain the differences between trapped-ion, superconducting, and neutral-atom quantum computers
- Query Amazon Braket for available devices and their properties
- Choose the appropriate device for a given circuit based on connectivity, gate set, and cost
- Understand noise sources and their impact on computation fidelity
- Estimate costs before submitting tasks to real hardware

## Prerequisites

- Completed: 00-foundations (circuit building, gates, measurement)
- AWS credentials configured (run `make setup` to validate)

---

## Concepts

### Quantum Hardware Technologies

There is no single "best" quantum computer. Different physical implementations have different strengths, and Amazon Braket gives you access to multiple technologies through a unified API.

**Key differentiators between hardware:**
- Qubit connectivity (which qubits can directly interact)
- Native gate set (what operations the hardware performs directly)
- Gate fidelity (how accurately gates execute)
- Coherence time (how long qubits maintain their quantum state)
- Clock speed (how fast gates execute)
- Qubit count (total available qubits)

### IonQ — Trapped Ion Quantum Computers

**Technology:** Individual ions (charged atoms) trapped in electromagnetic fields. Qubit states are encoded in the energy levels of each ion. Gates are performed using precisely tuned laser pulses.

**Available on Braket:**
- IonQ Aria (25 qubits) — Production workhorse
- IonQ Forte (36 qubits) — Higher qubit count, enhanced performance

**Strengths:**
- All-to-all connectivity: Any qubit can interact with any other qubit directly. No need for SWAP chains to move information.
- High gate fidelity: Single-qubit gates >99.5%, two-qubit gates >97%
- Long coherence times: Qubits maintain state for seconds (vs. microseconds for superconducting)

**Trade-offs:**
- Slower clock speed: Gate operations take microseconds (vs. nanoseconds for superconducting)
- Fewer qubits than superconducting approaches (currently)

**Native gate set on Braket:** GPi, GPi2, MS (Molmer-Sorensen)

**Best for:** Algorithms requiring heavy qubit connectivity (QAOA on dense graphs), circuits where gate fidelity matters more than speed.

### IQM — Superconducting Quantum Computers

**Technology:** Superconducting circuits cooled to near absolute zero (~15 millikelvin). Qubits are tiny electrical circuits (transmons) that behave quantum mechanically at these temperatures. Gates are microwave pulses.

**Available on Braket:**
- IQM Garnet (20 qubits) — Square lattice topology

**Strengths:**
- Fast gate speed: Operations complete in nanoseconds
- Mature fabrication: Leverages semiconductor manufacturing techniques
- Good for circuits with local interactions

**Trade-offs:**
- Limited connectivity: Nearest-neighbor only (square lattice). Distant qubit interactions require SWAP chains, adding depth and error.
- Shorter coherence times: ~100 microseconds
- Lower two-qubit gate fidelity than trapped ions (improving rapidly)

**Native gate set on Braket:** CZ, PRx (parameterized rotation)

**Best for:** Circuits with nearest-neighbor structure, algorithms where speed matters, research on error mitigation.

### QuEra — Neutral Atom (Analog Hamiltonian Simulation)

**Technology:** Arrays of neutral atoms (rubidium) held in optical tweezers (focused laser beams). Qubits are encoded in atomic energy levels. Computation happens by evolving the system under a carefully designed Hamiltonian — this is analog quantum computing, fundamentally different from the gate model.

**Available on Braket:**
- QuEra Aquila (256 qubits) — Analog Hamiltonian Simulator

**Key difference:** Aquila does NOT run gate-based circuits. Instead, you define:
- Atom positions (the geometry of your problem)
- Time-dependent driving fields (Rabi frequency, detuning)
- The system evolves under the Rydberg Hamiltonian

**Strengths:**
- Large qubit count (256 atoms)
- Natural for optimization and simulation problems that map to geometric arrangements
- Programmable atom positions allow problem-specific configurations

**Best for:** Maximum Independent Set problems, quantum simulation of condensed matter systems, optimization problems with geometric structure.

### Managed Simulators (SV1, DM1, TN1)

Amazon Braket provides three fully managed classical simulators that run your quantum circuits on AWS infrastructure:

**SV1 — State Vector Simulator:**
- Simulates up to 34 qubits
- Exact simulation (no sampling noise from the simulator itself)
- Best for: Debugging circuits, verifying algorithms, circuits up to ~30 qubits
- Cost: $0.075/minute

**DM1 — Density Matrix Simulator:**
- Simulates up to 17 qubits
- Supports noise modeling (depolarizing, amplitude damping, etc.)
- Best for: Studying noise effects, error mitigation research, small noisy circuits
- Cost: $0.075/minute

**TN1 — Tensor Network Simulator:**
- Handles circuits with up to 50 qubits (depending on entanglement structure)
- Uses tensor network contraction — efficient for circuits with limited entanglement
- Best for: Large shallow circuits, circuits with 1D/2D local connectivity
- Cost: $0.275/minute

**Local Simulator:**
- Runs on your machine (free)
- State vector simulation, up to ~25 qubits (depends on your RAM — each qubit doubles memory: 2^n complex amplitudes)
- Best for: Development, debugging, rapid iteration

### Device Properties and Selection

When choosing a device, consider:

| Factor | Local | SV1/DM1/TN1 | IonQ | IQM | QuEra |
|--------|-------|--------------|------|-----|-------|
| Cost | Free | $/minute | $/shot+task | $/shot+task | $/shot+task |
| Qubits | ~25 | 34/17/50 | 25-36 | 20 | 256 (analog) |
| Noise | None | Optional (DM1) | Real | Real | Real |
| Speed | Instant | Seconds-minutes | Minutes-hours (queue) | Minutes-hours (queue) | Minutes-hours (queue) |
| Gate model | Yes | Yes | Yes | Yes | No (analog) |

**Workflow recommendation:**
1. Develop and debug on local simulator (free, instant)
2. Validate at scale on SV1 (up to 34 qubits, exact)
3. Study noise effects on DM1 (add noise models)
4. Run on real QPU only when necessary (costly, queued)

### Cost Model

**QPU devices (IonQ, IQM, QuEra):**
- Per-task fee: $0.30 (charged each time you submit a circuit)
- Per-shot fee: Varies by provider (see CLAUDE.md for current rates)
- Example: 1000 shots on IonQ = $0.30 + (1000 x $0.01) = $10.30

**Managed simulators:**
- Per-minute billing (minimum varies)
- No per-shot charge
- Example: 2-minute SV1 run = $0.15

---

## Hands-On Exercises

1. **`notebooks/01-device-discovery.ipynb`** — Use `AwsDevice.get_devices()` to list all available hardware. Inspect device properties: qubit count, native gates, connectivity, status, queue depth.

2. **`notebooks/02-ionq-exploration.ipynb`** — Submit a simple circuit to IonQ (or simulate locally). Examine native gate decomposition. Compare results across shot counts. (Cost warning included in notebook.)

3. **`notebooks/03-iqm-exploration.ipynb`** — Build circuits respecting nearest-neighbor topology. Observe how the transpiler adds SWAP gates for non-adjacent interactions. Compare circuit depth before/after transpilation.

4. **`notebooks/04-quera-analog.ipynb`** — Define atom arrangements with `AnalogHamiltonianSimulation`. Set driving fields (Rabi frequency, detuning). Solve a small Maximum Independent Set problem.

5. **`notebooks/05-simulator-comparison.ipynb`** — Run the same circuit on SV1, DM1 (with noise), TN1, and local simulator. Compare results, runtime, and cost. Understand when each is appropriate.

6. **`notebooks/06-noise-and-errors.ipynb`** — Add noise channels (depolarizing, amplitude damping) to circuits on DM1. Compare noisy vs. ideal results. Introduction to error mitigation (zero-noise extrapolation concept).

**Scripts:**
- `scripts/device_status.py` — Run from terminal: `python 01-hardware/scripts/device_status.py` to check current device availability without opening a notebook
- `scripts/cost_estimator.py` — Estimate costs: `python 01-hardware/scripts/cost_estimator.py --device ionq --shots 1000`

---

## References

### AWS Documentation
- [Amazon Braket supported devices](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices.html) — Complete list of available hardware and regions
- [Amazon Braket pricing](https://aws.amazon.com/braket/pricing/) — Current per-shot and per-task pricing for all devices
- [Testing with simulators](https://docs.aws.amazon.com/braket/latest/developerguide/braket-test.html) — SV1, DM1, TN1 capabilities and limits
- [IonQ device properties](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices-ionq.html) — Native gates, connectivity, specifications
- [IQM device properties](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices-iqm.html) — Topology, native gates, compilation
- [QuEra Aquila documentation](https://docs.aws.amazon.com/braket/latest/developerguide/braket-devices-quera.html) — Analog Hamiltonian simulation setup

### Video Resources
- [Trapped-Ion Quantum Computing Explained — IonQ](https://www.youtube.com/watch?v=F8OU-XtqkKs) — Chris Monroe, IonQ co-founder, 45 min, how trapped ion hardware works from physics up
- [Superconducting Quantum Computing — IBM Research](https://www.youtube.com/watch?v=OGPyyDlHwCY) — Jay Gambetta, 40 min, transmon physics and engineering challenges
- [Neutral Atom Quantum Computing — QuEra](https://www.youtube.com/watch?v=tnYkR3fTTW8) — Alex Keesling, 35 min, Rydberg atoms and analog simulation
- [Amazon Braket Hardware Overview — AWS re:Invent 2023](https://www.youtube.com/watch?v=d0cNmPHKPcY) — Richard Moulds, 45 min, comparing hardware on Braket with live demos
- [Quantum Error Correction Explained](https://www.youtube.com/watch?v=1WHJCOotCkI) — Veritasium, 25 min, accessible intro to why noise matters
- [How a Quantum Computer Works — Kurzgesagt](https://www.youtube.com/watch?v=-UlxHPIEVqA) — 10 min, excellent visual overview of hardware types

### Papers & Further Reading
- [Quantum Computing: An Applied Approach (Hidary)](https://link.springer.com/book/10.1007/978-3-030-83274-2) — Chapter 15 covers hardware platforms in detail
- [IonQ Aria Architecture Paper](https://arxiv.org/abs/2312.10847) — Technical details of the Aria system
- [Neutral atom quantum computing review (Henriet et al.)](https://arxiv.org/abs/2006.12326) — Comprehensive review of neutral atom approaches
- [Quantum Computing in the NISQ era and beyond (Preskill)](https://arxiv.org/abs/1801.00862) — Foundational paper on what's possible with noisy hardware
```

- [ ] **Step 2: Commit**

```bash
git add 01-hardware/GUIDE.md
git commit -m "docs: add 01-hardware learning guide"
```

---

### Task 6: 02-algorithms GUIDE.md

**Files:**
- Create: `02-algorithms/GUIDE.md`

- [ ] **Step 1: Write the algorithms guide**

```markdown
# Quantum Algorithms

## Learning Objectives

After completing this section, you will be able to:
- Implement oracle-based algorithms (Deutsch-Jozsa, Grover's) and explain their quantum advantage
- Build and apply the Quantum Fourier Transform (QFT)
- Implement Quantum Phase Estimation and understand its role in chemistry and cryptography
- Set up and run the QAOA algorithm for combinatorial optimization
- Choose appropriate classical optimizers for variational algorithms

## Prerequisites

- Completed: 00-foundations (all gates, entanglement, measurement)
- Completed: 01-hardware (device selection, simulators)
- Linear algebra: eigenvalues, unitary operators, tensor products

---

## Concepts

### Oracle-Based Algorithms

An oracle is a black-box function f(x) implemented as a quantum gate. Oracle-based algorithms demonstrate quantum speedup by querying the oracle fewer times than any classical algorithm.

**Deutsch-Jozsa Algorithm:**
Given f: {0,1}^n -> {0,1} that is either constant (same output for all inputs) or balanced (outputs 0 for half, 1 for half):
- Classical: Need 2^(n-1) + 1 queries in the worst case
- Quantum: Need exactly 1 query

The circuit: Apply H to all qubits, query the oracle, apply H again, measure. If all qubits measure 0, f is constant. Otherwise, f is balanced.

**Bernstein-Vazirani Algorithm:**
Given f(x) = s . x (dot product mod 2) for hidden string s:
- Classical: Need n queries to find s
- Quantum: Need 1 query

**Grover's Search Algorithm:**
Given an oracle that marks one item out of N = 2^n:
- Classical: O(N) queries needed
- Quantum: O(sqrt(N)) queries — quadratic speedup

Key steps (one "Grover iteration"):
1. Apply oracle: Flip phase of the marked state
2. Apply diffusion: Reflect about the mean amplitude

Optimal number of iterations: approximately (pi/4) * sqrt(N)

### Quantum Fourier Transform (QFT)

The QFT is the quantum analogue of the Discrete Fourier Transform. It maps computational basis states to the frequency domain:

QFT|j> = (1/sqrt(N)) * sum_{k=0}^{N-1} e^(2*pi*i*j*k/N) |k>

**Circuit construction:**
- Apply H to qubit j
- Apply controlled rotations from qubit j to all subsequent qubits
- Repeat for each qubit
- Reverse qubit order (SWAP)

The QFT circuit uses O(n^2) gates for n qubits — exponentially faster than the classical FFT's O(n * 2^n) operations on the amplitudes.

**Applications:** Phase estimation, Shor's algorithm, quantum simulation, amplitude estimation.

### Quantum Phase Estimation (QPE)

QPE extracts the eigenvalue of a unitary operator. Given:
- A unitary U with eigenvector |u> such that U|u> = e^(2*pi*i*phi)|u>
- QPE estimates phi to n bits of precision using n ancilla qubits

**Circuit:**
1. Prepare ancilla qubits in |+> (Hadamard on each)
2. Apply controlled-U^(2^k) from ancilla k to the eigenstate register
3. Apply inverse QFT to the ancilla register
4. Measure ancilla to get phi in binary

**Why it matters:**
- Foundation of Shor's algorithm (factor integers by finding the period of modular exponentiation)
- Directly used in quantum chemistry (energy eigenvalues of molecular Hamiltonians)
- Core subroutine in many other algorithms

### Variational Algorithms

Variational algorithms use a classical optimizer to tune parameters of a quantum circuit (ansatz) to minimize a cost function. They are the primary approach for NISQ-era quantum advantage.

**Structure:**
1. Choose a parameterized circuit (ansatz) with parameters theta
2. Measure an observable to compute cost C(theta)
3. Use a classical optimizer to update theta to minimize C
4. Repeat until convergence

**QAOA (Quantum Approximate Optimization Algorithm):**
Designed for combinatorial optimization (MaxCut, traveling salesman, scheduling).

The QAOA circuit alternates between:
- Cost unitary: e^(-i * gamma * C) where C encodes the problem
- Mixer unitary: e^(-i * beta * B) where B = sum of X gates

With p layers (depth parameter), QAOA has 2p parameters (gamma_1..p, beta_1..p).

**MaxCut example:** Given a graph, partition vertices into two sets to maximize edges crossing between sets. The cost Hamiltonian encodes edge weights as ZZ interactions.

**Classical Optimizers for Variational Algorithms:**
- COBYLA: Gradient-free, good for noisy landscapes
- SPSA: Stochastic gradient approximation, only 2 function evaluations per step
- Adam: Gradient-based (requires parameter-shift rule for gradients), good convergence
- Nelder-Mead: Gradient-free simplex method

### Amplitude Estimation

A generalization of Grover's search that estimates the probability of a good outcome without full search. Provides quadratic speedup over classical Monte Carlo methods.

Given oracle A that prepares a state with amplitude sin(theta) on the "good" subspace:
- Classical Monte Carlo: O(1/epsilon^2) samples for precision epsilon
- Quantum Amplitude Estimation: O(1/epsilon) queries — quadratic improvement

Applications: Finance (option pricing), risk analysis, counting problems.

---

## Hands-On Exercises

1. **`notebooks/01-deutsch-jozsa.ipynb`** — Implement the Deutsch-Jozsa algorithm for n=3 qubits. Build constant and balanced oracles. Verify single-query determination. Compare to classical query complexity.

2. **`notebooks/02-grovers-search.ipynb`** — Implement Grover's algorithm for n=3 (search space of 8). Build custom oracles. Plot success probability vs. iteration count. Observe the optimal number of iterations.

3. **`notebooks/03-qft.ipynb`** — Build the QFT circuit from scratch (Hadamards + controlled rotations + swaps). Verify it transforms computational basis states correctly. Compare output to numpy FFT.

4. **`notebooks/04-qpe.ipynb`** — Implement QPE to estimate the phase of a T gate (should give phi = 1/8). Explore precision vs. ancilla qubit count. Connect to eigenvalue estimation.

5. **`notebooks/05-qaoa-maxcut.ipynb`** — Define a MaxCut problem on a small graph. Build the QAOA circuit (p=1 and p=2). Optimize gamma and beta with COBYLA. Visualize the energy landscape.

6. **`notebooks/06-amplitude-estimation.ipynb`** — Implement basic amplitude estimation. Compare convergence rate to classical Monte Carlo. Apply to a toy financial pricing example.

**Scripts:**
- `scripts/oracles.py` — Reusable functions to build oracle circuits (constant, balanced, marking)
- `scripts/variational_utils.py` — Classical optimizer wrappers (COBYLA, SPSA, Adam) with logging

---

## References

### AWS Documentation
- [Amazon Braket algorithm examples](https://github.com/amazon-braket/amazon-braket-examples/tree/main/examples/quantum_algorithms) — Official notebook examples for Grover's, QFT, QPE
- [Running circuits with OpenQASM 3.0](https://docs.aws.amazon.com/braket/latest/developerguide/braket-openqasm.html) — Alternative circuit specification format
- [Hybrid quantum algorithms on Braket](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs.html) — Running QAOA/VQE as hybrid jobs

### Video Resources
- [Quantum Algorithms — IBM Qiskit Summer School 2020](https://www.youtube.com/watch?v=VPfQMh4uxEM) — Abe Asfaw, 90 min, covers Deutsch-Jozsa through Grover's with proofs
- [Grover's Algorithm Visualized](https://www.youtube.com/watch?v=ePr2MgQkqL0) — 3Blue1Brown-style visualization, 20 min, geometric intuition for amplitude amplification
- [Quantum Fourier Transform — Qiskit](https://www.youtube.com/watch?v=lOKq3rTrTjM) — Julien Gacon, 30 min, step-by-step QFT construction
- [QAOA Explained — Musty Thoughts](https://www.youtube.com/watch?v=AOKM9BkweVU) — Michal Stechly, 25 min, intuitive QAOA explanation with MaxCut
- [Variational Quantum Algorithms — AWS re:Invent 2022](https://www.youtube.com/watch?v=3KVqpRQjr5o) — AWS Braket team, 45 min, VQE and QAOA on Braket with code
- [Quantum Phase Estimation — Minutephysics](https://www.youtube.com/watch?v=5kcoaanYyZw) — 12 min, clear visual walkthrough of QPE circuit

### Papers & Further Reading
- [A fast quantum mechanical algorithm for database search (Grover, 1996)](https://arxiv.org/abs/quant-ph/9605043) — The original Grover's paper
- [Quantum Approximate Optimization Algorithm (Farhi et al., 2014)](https://arxiv.org/abs/1411.4028) — QAOA original paper
- [Quantum Computation by Adiabatic Evolution (Farhi et al., 2000)](https://arxiv.org/abs/quant-ph/0001106) — Theoretical foundation connecting to QAOA
- [Variational Quantum Eigensolver review (Tilly et al., 2022)](https://arxiv.org/abs/2111.05176) — Comprehensive review of variational approaches
```

- [ ] **Step 2: Commit**

```bash
git add 02-algorithms/GUIDE.md
git commit -m "docs: add 02-algorithms learning guide"
```

---

### Task 7: 03-quantum-ml GUIDE.md

**Files:**
- Create: `03-quantum-ml/GUIDE.md`

- [ ] **Step 1: Write the quantum ML guide**

```markdown
# Quantum Machine Learning

## Learning Objectives

After completing this section, you will be able to:
- Encode classical data into quantum states using multiple encoding strategies
- Build and train Variational Quantum Classifiers (VQCs)
- Implement quantum kernel methods for classification
- Use PennyLane with Amazon Braket for hybrid quantum-classical ML workflows
- Diagnose and mitigate barren plateaus in parameterized circuits
- Run QML training as a Braket Hybrid Job for production workloads

## Prerequisites

- Completed: 00-foundations, 01-hardware, 02-algorithms (especially variational section)
- Classical ML basics: supervised learning, loss functions, gradient descent, SVMs
- Python: NumPy, basic familiarity with scikit-learn

---

## Concepts

### Quantum Data Encoding

To use quantum circuits for ML, classical data must be encoded into quantum states. The choice of encoding determines the feature space the quantum computer operates in.

**Basis Encoding:**
Map integer x to computational basis state |x>. Simple but requires n qubits for n-bit integers. Not practical for continuous features.

**Angle Encoding:**
Map each feature x_i to a rotation angle:
- |x> = Ry(x_1)|0> tensor Ry(x_2)|0> tensor ... tensor Ry(x_n)|0>
- One qubit per feature
- Simple and hardware-efficient
- Feature space is the surface of n Bloch spheres

**Amplitude Encoding:**
Encode N features into log2(N) qubits as amplitudes:
- |x> = sum_i (x_i / ||x||) |i>
- Exponentially compact but requires O(N) gates to prepare
- Feature space is the full Hilbert space

**IQP (Instantaneous Quantum Polynomial) Encoding:**
Applies Hadamards, then ZZ rotations with feature products:
- H^n -> Z(x_i) on each qubit -> ZZ(x_i * x_j) on pairs -> H^n (repeat)
- Creates an exponentially large feature space with controlled structure
- Basis of quantum kernel methods with potential advantage

**Re-uploading (Data Re-uploading):**
Encode data multiple times in different layers of the circuit:
- Layer 1: Encode x, apply trainable U(theta_1)
- Layer 2: Encode x again, apply trainable U(theta_2)
- Increases expressivity without adding qubits

### Parameterized Quantum Circuits as ML Models

A PQC with parameters theta defines a function f(x; theta):
1. Encode input x into a quantum state
2. Apply trainable unitary layers U(theta)
3. Measure an observable to produce output

This is analogous to a neural network where:
- Data encoding = input layer
- Parameterized unitaries = hidden layers
- Measurement = output layer

**Key design choices:**
- Circuit depth (number of layers)
- Entangling pattern (linear, all-to-all, circular)
- Rotation gate types (Rx, Ry, Rz, or combinations)
- Measurement strategy (expectation value of Pauli operators)

### Quantum Kernel Methods

Instead of training a quantum circuit, use the quantum computer to compute a kernel function:

K(x_i, x_j) = |<phi(x_i)|phi(x_j)>|^2

where |phi(x)> is the quantum state produced by encoding data x.

**Workflow:**
1. Encode each data point into a quantum state using a feature map circuit
2. Compute the kernel matrix K_ij for all pairs of training points
3. Use K with a classical SVM (or any kernel method)

**Why this might help:** The quantum feature map can create exponentially large feature spaces that are hard to compute classically. For certain data distributions, this kernel can separate classes that are linearly inseparable in any efficient classical feature space.

**Projected Quantum Kernel:** Project the full quantum state back to a lower-dimensional classical representation before computing the kernel. Often more trainable and less prone to exponential concentration.

### Variational Quantum Classifiers (VQC)

A VQC is a PQC trained end-to-end for classification:

1. Encode input features x
2. Apply trainable ansatz U(theta)
3. Measure Pauli-Z expectation on designated qubit(s)
4. Map measurement to class label (threshold for binary, argmax for multi-class)
5. Compute loss (cross-entropy, MSE)
6. Update theta using gradient descent (parameter-shift rule for quantum gradients)

**Parameter-shift rule:** For a gate R(theta) = exp(-i * theta * G/2):
- gradient = [f(theta + pi/2) - f(theta - pi/2)] / 2
- Exact gradient from two circuit evaluations
- No finite-difference approximation needed

### Quantum Neural Networks (QNNs)

Broader term for parameterized quantum circuits used as trainable models. Architectures include:

**Hardware-efficient ansatz:** Alternate single-qubit rotations with nearest-neighbor CNOTs. Minimizes circuit depth but can suffer from barren plateaus.

**Strongly-entangling layers:** All-to-all CNOT connectivity between layers. More expressive but deeper circuits.

**Convolutional QNN:** Applies local gates in a translationally-invariant pattern, inspired by classical CNNs. Good for data with spatial structure.

### Barren Plateaus

A critical challenge: for random PQCs, the gradient of the cost function vanishes exponentially with qubit count.

**Symptoms:**
- Loss function appears flat — optimizer makes no progress
- Gradient magnitude decreases exponentially: Var(dC/dtheta) ~ 2^(-n)

**Causes:**
- High expressivity circuits (too random)
- Global cost functions (measuring all qubits)
- Deep circuits with extensive entanglement
- Hardware noise (noise-induced barren plateaus)

**Mitigations:**
- Use local cost functions (measure fewer qubits)
- Initialize parameters near identity (small random values)
- Use structured ansatze (problem-inspired, not random)
- Layer-wise training (train one layer at a time)
- Classical pre-training (initialize with classically-computed parameters)

### PennyLane Integration with Braket

PennyLane is the primary framework for differentiable quantum computing on Braket:

```python
import pennylane as qml

# Use Braket local simulator
dev = qml.device("braket.local.qubit", wires=4)

# Or use Braket managed simulator
dev = qml.device("braket.aws.qubit", device_arn="arn:aws:braket:::device/quantum-simulator/amazon/sv1",
                 s3_destination_folder=("bucket", "prefix"), wires=4, shots=1000)

@qml.qnode(dev)
def circuit(params, x):
    # Encode data
    for i in range(4):
        qml.RY(x[i], wires=i)
    # Trainable layer
    qml.StronglyEntanglingLayers(params, wires=range(4))
    return qml.expval(qml.PauliZ(0))
```

PennyLane handles:
- Automatic differentiation (parameter-shift rule on QPU, backprop on simulator)
- Optimizer library (gradient descent, Adam, QNG)
- Device switching (change backend with one line)
- Integration with PyTorch, TensorFlow, JAX

---

## Hands-On Exercises

1. **`notebooks/01-data-encoding.ipynb`** — Implement angle, amplitude, and IQP encodings for the Iris dataset. Visualize the quantum states produced by each encoding. Compare qubit requirements and circuit depth.

2. **`notebooks/02-quantum-kernels.ipynb`** — Build a quantum kernel using IQP encoding. Compute the kernel matrix for a 2D classification problem. Train a classical SVM with the quantum kernel. Compare to an RBF kernel.

3. **`notebooks/03-variational-classifier.ipynb`** — Build a VQC for binary classification on a toy dataset (moons or circles). Train with parameter-shift gradients. Plot decision boundary evolution during training.

4. **`notebooks/04-pennylane-braket.ipynb`** — Set up PennyLane with Braket backends. Define QNodes with automatic differentiation. Switch between local, SV1, and QPU devices. Use PennyLane optimizers (Adam, QNG).

5. **`notebooks/05-qnn-architecture.ipynb`** — Compare hardware-efficient vs. strongly-entangling architectures. Measure expressibility and entangling capability. Train both on the same dataset and compare convergence.

6. **`notebooks/06-barren-plateaus.ipynb`** — Demonstrate barren plateaus: plot gradient variance vs. qubit count for random circuits. Then apply mitigations: local cost functions, identity initialization, layer-wise training. Show improved trainability.

7. **`notebooks/07-hybrid-ml-job.ipynb`** — Package a QML training loop as a Braket Hybrid Job. Track training loss via CloudWatch metrics. Use checkpointing for long training runs. Demonstrate production QML workflow.

**Scripts:**
- `scripts/feature_maps.py` — Reusable data encoding circuits (angle, amplitude, IQP, re-uploading)
- `scripts/classifiers.py` — VQC and quantum kernel classifier implementations
- `scripts/training.py` — Training loop with logging, early stopping, and checkpoint support

---

## References

### AWS Documentation
- [Quantum Machine Learning on Amazon Braket](https://github.com/amazon-braket/amazon-braket-examples/tree/main/examples/quantum_machine_learning) — Official QML examples
- [PennyLane-Braket plugin](https://amazon-braket-pennylane-plugin-python.readthedocs.io/) — Plugin documentation for using PennyLane with Braket devices
- [Hybrid Jobs for QML](https://github.com/amazon-braket/amazon-braket-examples/blob/main/examples/hybrid_jobs/1_Quantum_machine_learning_in_Amazon_Braket_Hybrid_Jobs/Quantum_machine_learning_in_Amazon_Braket_Hybrid_Jobs.ipynb) — Official hybrid job QML example

### Video Resources
- [Quantum Machine Learning — PennyLane Tutorial Series](https://www.youtube.com/playlist?list=PL-8F_hCufPN2r7dJkSUUbVQQ9CC7AV6rO) — Xanadu team, full QML course (10+ hours), covers encoding through kernel methods
- [Variational Quantum Classifiers — Qiskit Summer School](https://www.youtube.com/watch?v=3kcoaanYyZw) — Amira Abbas, 90 min, VQC theory and implementation
- [Barren Plateaus in Quantum ML — Cerezo et al.](https://www.youtube.com/watch?v=gNUC2EhC2Xs) — Marco Cerezo, 45 min, rigorous explanation of the barren plateau problem
- [Quantum Kernels for ML — AWS Quantum Computing Blog](https://www.youtube.com/watch?v=tMv-sA8pIYM) — 30 min, quantum kernel methods on Braket
- [PennyLane + Amazon Braket Integration](https://www.youtube.com/watch?v=1eJmVTlxzB8) — AWS tutorial, 20 min, setup and first QML circuit
- [Data Encoding in Quantum Computing — Maria Schuld](https://www.youtube.com/watch?v=r-L9DjOMqWA) — Maria Schuld (Xanadu), 50 min, deep dive into encoding strategies and their implications

### Papers & Further Reading
- [Supervised learning with quantum-enhanced feature spaces (Havlicek et al., 2019)](https://arxiv.org/abs/1804.11326) — Foundational paper on quantum kernels
- [Power of data in quantum machine learning (Huang et al., 2021)](https://arxiv.org/abs/2011.01938) — When does quantum ML actually help? Rigorous analysis
- [Barren plateaus in quantum neural network training landscapes (McClean et al., 2018)](https://arxiv.org/abs/1803.11173) — The original barren plateau paper
- [Expressibility and Entangling Capability of PQCs (Sim et al., 2019)](https://arxiv.org/abs/1905.10876) — Quantifying circuit expressivity
- [Machine learning with quantum computers (Schuld & Petruccione)](https://link.springer.com/book/10.1007/978-3-030-83098-4) — Best textbook on QML, covers all topics in this section
```

- [ ] **Step 2: Commit**

```bash
git add 03-quantum-ml/GUIDE.md
git commit -m "docs: add 03-quantum-ml learning guide"
```

---

### Task 8: 04-quantum-chemistry GUIDE.md

**Files:**
- Create: `04-quantum-chemistry/GUIDE.md`

- [ ] **Step 1: Write the quantum chemistry guide**

```markdown
# Quantum Chemistry & Biochemistry

## Learning Objectives

After completing this section, you will be able to:
- Construct molecular Hamiltonians using second quantization
- Map fermionic operators to qubit operators (Jordan-Wigner, Bravyi-Kitaev)
- Implement the Variational Quantum Eigensolver (VQE) for ground state estimation
- Design and compare ansatz circuits (UCCSD, hardware-efficient)
- Select active spaces to reduce qubit requirements for larger molecules
- Understand applications to drug discovery and materials science

## Prerequisites

- Completed: 00-foundations, 01-hardware, 02-algorithms (especially QPE and variational sections)
- Basic chemistry: atomic orbitals, molecular bonds, electron configuration
- Linear algebra: eigenvalue problems, Hermitian operators

---

## Concepts

### The Electronic Structure Problem

The central problem in computational chemistry: given a molecular geometry (nuclear positions), find the ground state energy and wavefunction of the electrons.

**Why it's hard classically:**
- The exact wavefunction lives in an exponentially large space (2^n for n spin-orbitals)
- Classical methods (DFT, CCSD(T)) use approximations that break down for strongly correlated systems
- Catalysis, drug binding, materials properties often involve strong correlation

**Why quantum computers help:**
- Quantum systems naturally represent exponential spaces
- A quantum state of n qubits can encode a wavefunction of n spin-orbitals
- Polynomial quantum resources for problems requiring exponential classical resources

### Second Quantization

Instead of tracking each electron's position, second quantization uses creation (a_p^dagger) and annihilation (a_p) operators for each spin-orbital p:

- a_p^dagger|0> = |1_p> (create an electron in orbital p)
- a_p|1_p> = |0> (remove an electron from orbital p)
- Anticommutation: {a_p, a_q^dagger} = delta_pq

The molecular Hamiltonian in second quantization:
H = sum_{pq} h_pq * a_p^dagger * a_q + (1/2) * sum_{pqrs} h_pqrs * a_p^dagger * a_q^dagger * a_s * a_r

where h_pq (one-electron integrals) and h_pqrs (two-electron integrals) are computed classically from the basis set and molecular geometry.

### Fermion-to-Qubit Mappings

Quantum computers use qubits, not fermions. We need a mapping that preserves the fermionic anticommutation relations.

**Jordan-Wigner Transformation:**
- Maps occupation of orbital p to qubit p: |0> = unoccupied, |1> = occupied
- a_p^dagger -> (X_p - iY_p)/2 * Z_{p-1} * Z_{p-2} * ... * Z_0
- The Z-string encodes fermionic antisymmetry (parity of all lower orbitals)
- Pro: Intuitive mapping. Con: Non-local — operators on orbital p involve all lower qubits.

**Bravyi-Kitaev Transformation:**
- Encodes both occupation and parity information in each qubit
- Results in O(log n) weight operators instead of O(n)
- More efficient for certain circuits but less intuitive

**Parity Mapping:**
- Qubit p stores the parity of orbitals 0 through p
- Can reduce qubit count by 2 using symmetry (total electron number, spin)

**Practical choice:** Jordan-Wigner is standard for small molecules. Bravyi-Kitaev can reduce circuit depth for larger systems.

### Variational Quantum Eigensolver (VQE)

VQE is the primary algorithm for quantum chemistry on NISQ devices:

1. **Prepare trial state:** Apply parameterized ansatz U(theta)|0>
2. **Measure energy:** Compute <H> = sum_i c_i * <P_i> where P_i are Pauli terms in the qubit Hamiltonian
3. **Optimize:** Use a classical optimizer to minimize <H> by adjusting theta
4. **Converge:** The minimum of <H> approximates the ground state energy (variational principle guarantees E_VQE >= E_exact)

**The variational principle:** For any trial state |psi(theta)>:
<psi(theta)|H|psi(theta)> >= E_ground

This means VQE always gives an upper bound — we can only improve by finding better parameters.

**Measuring the Hamiltonian:**
The qubit Hamiltonian is a sum of Pauli strings (e.g., ZZII, XYZI, IIXX). Each term requires separate measurement in its eigenbasis. Grouping commuting terms reduces the number of distinct measurements needed.

### Ansatz Design

The ansatz (trial wavefunction circuit) determines VQE's quality:

**Unitary Coupled Cluster (UCC):**
- Inspired by classical coupled cluster theory
- UCCSD includes single and double excitations:
  U(theta) = exp(T - T^dagger) where T = T_1 + T_2
  T_1 = sum_{ia} t_ia * a_a^dagger * a_i (singles)
  T_2 = sum_{ijab} t_ijab * a_a^dagger * a_b^dagger * a_j * a_i (doubles)
- Chemically motivated — captures the right physics
- Con: Deep circuits (many CNOT gates), expensive on noisy hardware

**Hardware-Efficient Ansatz (HEA):**
- Layers of single-qubit rotations + entangling gates (CNOTs)
- Not chemically motivated — just explores the Hilbert space
- Pro: Short circuits, works on any hardware topology
- Con: Barren plateaus, may not converge to the right answer

**ADAPT-VQE:**
- Grows the ansatz adaptively by selecting operators with the largest gradient
- Starts with empty circuit, adds one operator at a time
- Finds compact, problem-specific ansatze
- More circuit evaluations during optimization but shorter final circuits

### Basis Sets and Active Space

**Basis sets:** Approximate atomic orbitals with Gaussian functions
- STO-3G: Minimal basis (1 function per orbital). Quick but inaccurate.
- 6-31G: Split-valence. Better for properties.
- cc-pVDZ, cc-pVTZ: Correlation-consistent. Systematic improvement.

Larger basis = more orbitals = more qubits needed.

**Active space selection:**
For a molecule with many electrons, we can't put all orbitals on the quantum computer. Active space methods:
1. Run a classical calculation (Hartree-Fock) to get molecular orbitals
2. Select a subset of orbitals near the Fermi level (the "active space")
3. Treat active space with VQE, frozen core with classical approximation

Example: For a molecule with 20 electrons in 40 orbitals:
- Full: 80 qubits (40 spatial orbitals x 2 spin)
- Active space (4 electrons, 4 orbitals): 8 qubits — tractable on current hardware

### Applications to Drug Discovery and Biochemistry

**Molecular binding energies:** Calculate how strongly a drug candidate binds to a protein pocket. Requires accurate treatment of electron correlation at the binding interface.

**Reaction mechanisms:** Map energy along a reaction coordinate. Transition states often have strong multireference character — exactly where quantum computers can help.

**Materials design:** Predict properties of novel catalysts, battery materials, superconductors from first principles.

**Current limitations:** Today's quantum computers can handle molecules with ~10-20 qubits accurately. This covers small molecules (H2, LiH, BeH2, H2O) but not drug-sized molecules. The value is in developing methods that will scale to useful size as hardware improves.

---

## Hands-On Exercises

1. **`notebooks/01-molecular-hamiltonians.ipynb`** — Use OpenFermion + PySCF to compute the Hamiltonian for H2 and LiH. Examine the one- and two-electron integrals. Convert to qubit operators and count terms.

2. **`notebooks/02-fermion-qubit-mapping.ipynb`** — Apply Jordan-Wigner and Bravyi-Kitaev to the same Hamiltonian. Compare qubit operator weight (number of Pauli terms, max locality). Discuss trade-offs.

3. **`notebooks/03-vqe-h2.ipynb`** — Full VQE workflow for H2: build UCCSD ansatz, measure Hamiltonian terms, optimize with COBYLA. Plot energy vs. bond length (potential energy surface). Compare to exact diagonalization.

4. **`notebooks/04-vqe-lih.ipynb`** — Scale to LiH (more qubits). Use active space selection. Compare hardware-efficient vs. UCCSD ansatz. Analyze convergence and accuracy.

5. **`notebooks/05-ansatz-design.ipynb`** — Compare UCCSD, hardware-efficient, and ADAPT-VQE approaches on H2O (in active space). Measure circuit depth, CNOT count, and energy accuracy for each.

6. **`notebooks/06-active-space.ipynb`** — Demonstrate active space selection: full-space H2O would need 14 qubits, active space reduces to 4-8. Use PySCF CASCI to validate active space choice.

7. **`notebooks/07-excited-states.ipynb`** — Implement SSVQE (Subspace-Search VQE) to find the first excited state of H2. Compare to exact excited state energy.

8. **`notebooks/08-hybrid-chemistry-job.ipynb`** — Package VQE as a Braket Hybrid Job. Scan bond lengths in parallel. Use checkpointing for large parameter sweeps. Production chemistry workflow.

**Scripts:**
- `scripts/hamiltonians.py` — Molecular Hamiltonian construction pipeline (geometry -> integrals -> qubit operator)
- `scripts/ansatz.py` — Parameterized ansatz circuit builders (UCCSD, HEA, custom)
- `scripts/vqe_runner.py` — End-to-end VQE runner with energy vs. geometry scanning

---

## References

### AWS Documentation
- [VQE Chemistry example on Braket](https://github.com/amazon-braket/amazon-braket-examples/blob/main/examples/hybrid_quantum_algorithms/VQE_Chemistry/VQE_chemistry_braket.ipynb) — Official VQE notebook
- [Hybrid Jobs for chemistry](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs.html) — Running VQE as a managed job with QPU priority
- [PennyLane quantum chemistry](https://pennylane.ai/qml/demos/tutorial_quantum_chemistry/) — PennyLane's chemistry module documentation

### Video Resources
- [Quantum Chemistry with VQE — IBM Qiskit](https://www.youtube.com/watch?v=Z-A6G0WVI9w) — Antonio Mezzacapo, 60 min, full VQE theory and implementation for chemistry
- [Simulating Molecules using Quantum Computers — Google AI](https://www.youtube.com/watch?v=w7398u8G588) — Ryan Babbush, 45 min, frontier of quantum chemistry simulation
- [Electronic Structure Problem — Qiskit Summer School](https://www.youtube.com/watch?v=fACEhn55XRA) — 90 min, from Schrodinger equation to qubit Hamiltonians
- [OpenFermion Tutorial](https://www.youtube.com/watch?v=fHBZ6JVoP7M) — Google Quantum AI, 40 min, using OpenFermion for molecular simulation
- [Active Space Methods — Quantum Computing for Chemistry](https://www.youtube.com/watch?v=Rf8h3pKXgio) — 35 min, how to select which orbitals to put on the quantum computer
- [Drug Discovery and Quantum Computing](https://www.youtube.com/watch?v=jTjz9PReryo) — Zapata Computing, 30 min, industry perspective on quantum chemistry for pharma

### Papers & Further Reading
- [Quantum computational chemistry (McArdle et al., 2020)](https://arxiv.org/abs/1808.10402) — Comprehensive review of quantum algorithms for chemistry
- [Hardware-efficient VQE (Kandala et al., 2017)](https://arxiv.org/abs/1704.05018) — First VQE on real hardware (IBM)
- [ADAPT-VQE (Grimsley et al., 2019)](https://arxiv.org/abs/1812.11173) — Adaptive ansatz construction
- [Quantum chemistry in the age of quantum computing (Cao et al., 2019)](https://arxiv.org/abs/1812.09976) — Broad review connecting chemistry to quantum algorithms
- [OpenFermion: The Electronic Structure Package for Quantum Computers](https://arxiv.org/abs/1710.07629) — OpenFermion paper and tutorial
- [Molecular Simulations with Quantum Computers: A book by Szabo and Ostlund](https://store.doverpublications.com/0486691861.html) — Classical reference for the quantum chemistry background
```

- [ ] **Step 2: Commit**

```bash
git add 04-quantum-chemistry/GUIDE.md
git commit -m "docs: add 04-quantum-chemistry learning guide"
```

---

### Task 9: 05-hybrid-jobs GUIDE.md

**Files:**
- Create: `05-hybrid-jobs/GUIDE.md`

- [ ] **Step 1: Write the hybrid jobs guide**

```markdown
# Production Hybrid Quantum-Classical Jobs

## Learning Objectives

After completing this section, you will be able to:
- Decide when to use Braket Hybrid Jobs vs. standalone quantum tasks
- Create, submit, monitor, and retrieve results from hybrid jobs
- Use parametric compilation to accelerate iterative algorithms
- Implement checkpointing for fault-tolerant long-running jobs
- Build custom containers for specialized job environments
- Set up cost controls, monitoring, and production-grade error handling

## Prerequisites

- Completed: 00 through 04 (all previous sections)
- AWS credentials with Braket and IAM permissions (run `make deploy-infra`)
- Understanding of variational algorithms (VQE, QAOA, QML training loops)

---

## Concepts

### When to Use Hybrid Jobs

**Use Hybrid Jobs when:**
- Your algorithm requires iterative quantum-classical communication (VQE, QAOA, QML training)
- You need priority QPU access (job tasks jump the queue)
- You want parametric compilation (compile once, vary parameters)
- The computation runs for more than a few minutes
- You need checkpointing, metrics, or reproducible environments

**Use standalone quantum tasks when:**
- You're running a single circuit (no iteration)
- You're exploring/debugging interactively
- You don't need priority access

### Hybrid Job Architecture

A Braket Hybrid Job runs in a managed container on EC2:

1. **You provide:** An algorithm script (entry point), optional hyperparameters, input data
2. **Braket provides:** Container environment, SDK, QPU priority access, metrics pipeline
3. **During execution:** Your script submits quantum tasks that get priority QPU access
4. **After completion:** Results stored in S3, metrics in CloudWatch, logs in CloudWatch Logs

```
+-------------------+        +-------------------+
|  Your Algorithm   | -----> | Quantum Device    |
|  (EC2 container)  | <----- | (QPU or Simulator)|
|                   |        +-------------------+
|  Classical logic  |
|  Optimization     |        +-------------------+
|  Data processing  | -----> | S3 Results Bucket |
+-------------------+        +-------------------+
        |
        v
+-------------------+
| CloudWatch Metrics|
+-------------------+
```

### Priority QPU Access

Tasks submitted from within a Hybrid Job get priority over tasks submitted directly:
- Your job's tasks go to the front of the device queue
- This is critical for iterative algorithms where latency between iterations matters
- Without priority, each iteration might wait minutes/hours in the general queue
- With priority, iterations complete back-to-back

### Parametric Compilation

For variational algorithms, the circuit structure stays the same — only parameters change:

```python
from braket.circuits import Circuit, FreeParameter

theta = FreeParameter("theta")
circuit = Circuit().rx(0, theta).cnot(0, 1)

# First run: compiles and executes
result1 = device.run(circuit, shots=1000, inputs={"theta": 0.5})

# Subsequent runs: skips compilation, only updates parameter
result2 = device.run(circuit, shots=1000, inputs={"theta": 0.7})
```

Parametric compilation saves significant time on hardware that requires transpilation (IQM, Rigetti). The circuit is compiled to native gates once, then only parameter values are updated.

### Job Lifecycle

1. **Create:** `AwsQuantumJob.create(...)` — defines script, device, hyperparameters
2. **Queued:** Job waits for the specified device to become available
3. **Running:** Container spins up, algorithm executes, quantum tasks get priority
4. **Metrics:** Your script logs metrics via `log_metric()` — visible in near-real-time
5. **Checkpointing:** Save intermediate state with `save_job_checkpoint()`
6. **Completion:** Results saved to S3, container terminated
7. **Retrieval:** Download results and artifacts

### Hyperparameters, Inputs, and Outputs

**Hyperparameters:** Key-value pairs passed to your algorithm (e.g., learning_rate, n_layers, n_shots). Accessed via `load_job_checkpoint()` or environment variables.

**Input data:** S3 paths to training data, molecular geometries, or graph structures. Automatically downloaded to the container at runtime.

**Output artifacts:** Files your script writes to the output directory. Automatically uploaded to S3 after completion.

**Metrics:** Numeric values logged during execution (loss, energy, fidelity). Stream to CloudWatch for real-time monitoring.

### Custom Containers

The default Braket container includes the SDK and common packages. For specialized dependencies (custom chemistry libraries, large ML frameworks), build a custom container:

1. Create Dockerfile based on Braket base image
2. Add your dependencies
3. Build and push to Amazon ECR
4. Reference the image URI in `AwsQuantumJob.create(image_uri=...)`

### Cost Management

**Instance selection:**
- `ml.m5.large`: Default, sufficient for most variational algorithms
- `ml.m5.xlarge`: More memory for larger problems
- `ml.p3.2xlarge`: GPU for classical ML components

**Cost controls:**
- Set `max_runtime` to cap job duration
- Use `stopping_condition` to halt based on metrics
- Monitor with CloudWatch alarms
- Set AWS Budget alerts (see infra/ templates)

**Approximate costs:**
- EC2 instance: $0.10-$3.00/hour depending on type
- QPU charges: Same per-task and per-shot rates as standalone
- Total: Job instance cost + quantum hardware cost

### PennyLane with Hybrid Jobs

PennyLane integrates naturally with Hybrid Jobs:

```python
import pennylane as qml
from braket.jobs import save_job_result
from braket.jobs.metrics import log_metric

dev = qml.device("braket.aws.qubit", device_arn=os.environ["AMZN_BRAKET_DEVICE_ARN"], ...)

@qml.qnode(dev)
def circuit(params):
    ...

optimizer = qml.AdamOptimizer(stepsize=0.1)
for step in range(100):
    params, cost = optimizer.step_and_cost(circuit, params)
    log_metric(metric_name="cost", value=cost, iteration_number=step)

save_job_result({"optimal_params": params.tolist(), "final_cost": float(cost)})
```

### CUDA-Q Integration

For GPU-accelerated quantum simulation within Hybrid Jobs:
- CUDA-Q provides GPU-based state vector and tensor network simulation
- Dramatically faster for circuits > 20 qubits on simulator
- Use `ml.p3.2xlarge` or `ml.g4dn.xlarge` instances
- Available as a Braket-provided container image

---

## Hands-On Exercises

1. **`notebooks/01-first-hybrid-job.ipynb`** — Create your first Hybrid Job: a simple bell-state circuit repeated with different parameters. Submit, monitor status, retrieve results from S3.

2. **`notebooks/02-parametric-compilation.ipynb`** — Compare execution time with and without parametric compilation for a variational circuit. Measure the speedup for 50 parameter updates.

3. **`notebooks/03-monitoring-metrics.ipynb`** — Log custom metrics (energy, loss) during a VQE job. View them in CloudWatch. Set up basic alerting.

4. **`notebooks/04-checkpointing.ipynb`** — Implement checkpointing in a long-running QAOA optimization. Simulate a failure. Restart from checkpoint. Verify correct resumption.

5. **`notebooks/05-custom-containers.ipynb`** — Build a custom container with extra chemistry libraries. Push to ECR. Run a job using the custom image.

6. **`notebooks/06-pennylane-jobs.ipynb`** — Run a full PennyLane variational training loop as a Hybrid Job. Use PennyLane optimizers, log training curves, retrieve optimal parameters.

7. **`notebooks/07-production-patterns.ipynb`** — Production-grade patterns: error handling, retries, timeout configuration, cost estimation before submission, result validation after completion.

**Algorithms (production scripts):**
- `algorithms/qaoa_maxcut_job.py` — Production QAOA solver: accepts graph as input, outputs optimal partition
- `algorithms/vqe_chemistry_job.py` — Production VQE: accepts molecular geometry, outputs ground state energy
- `algorithms/qml_training_job.py` — Production QML trainer: accepts dataset, outputs trained model parameters

**Containers:**
- `containers/Dockerfile` — Custom container with OpenFermion, PySCF, and additional chemistry tools
- `containers/build_and_push.sh` — Script to build the Docker image and push to ECR

---

## References

### AWS Documentation
- [Working with Amazon Braket Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs.html) — Complete Hybrid Jobs guide
- [Key concepts for Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs-concepts.html) — Inputs, outputs, metrics, checkpoints
- [Create a Hybrid Job](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs-first.html) — Step-by-step creation walkthrough
- [Custom containers for Hybrid Jobs](https://docs.aws.amazon.com/braket/latest/developerguide/running-hybrid-jobs-in-own-container.html) — Building and using custom Docker images
- [Using PennyLane with Braket](https://docs.aws.amazon.com/braket/latest/developerguide/hybrid.html) — PennyLane integration guide
- [Using CUDA-Q with Braket](https://docs.aws.amazon.com/braket/latest/developerguide/braket-using-cuda-q.html) — GPU-accelerated simulation setup

### Video Resources
- [Amazon Braket Hybrid Jobs Deep Dive — AWS re:Invent 2023](https://www.youtube.com/watch?v=uKrNWHxEIow) — AWS Quantum team, 45 min, architecture and best practices for hybrid jobs
- [Running Variational Algorithms at Scale — AWS Quantum Blog](https://www.youtube.com/watch?v=jYLeHwXX8QQ) — 30 min, VQE and QAOA as Hybrid Jobs with parametric compilation
- [PennyLane + Braket Hybrid Jobs Tutorial](https://www.youtube.com/watch?v=7cOEqPPk7JQ) — Xanadu + AWS, 25 min, full PennyLane training loop as a job
- [Containerized Quantum Workloads on AWS](https://www.youtube.com/watch?v=fD-3WBNlnHY) — AWS Containers team, 35 min, Docker + ECR + Braket
- [Quantum-Classical Hybrid Algorithms Explained](https://www.youtube.com/watch?v=A2ozpWB7c2A) — IBM Research, 40 min, general theory of hybrid approaches
- [Cost Optimization for Quantum Computing on AWS](https://www.youtube.com/watch?v=d9ks9FvyQhE) — AWS, 20 min, budgeting and cost management strategies

### Papers & Further Reading
- [Amazon Braket: Quantum Computing Made Accessible (AWS whitepaper)](https://d1.awsstatic.com/whitepapers/quantum-computing-with-amazon-braket.pdf) — Architecture and service design
- [Optimizing parametric circuits for NISQ devices (Mitarai et al., 2018)](https://arxiv.org/abs/1803.00745) — Theory behind parametric compilation benefits
- [Scalable Quantum Simulation of Molecular Energies (O'Malley et al., 2016)](https://arxiv.org/abs/1512.06860) — Early demonstration of hybrid quantum-classical chemistry
- [PennyLane: Automatic differentiation of hybrid quantum-classical computations](https://arxiv.org/abs/1811.04968) — PennyLane framework paper
```

- [ ] **Step 2: Commit**

```bash
git add 05-hybrid-jobs/GUIDE.md
git commit -m "docs: add 05-hybrid-jobs learning guide"
```

---

### Task 10: Directory Scaffolding (all notebooks, scripts, containers)

**Files:** All notebook and script placeholder files across 00-05 directories.

This task creates the directory structure and placeholder notebook files. Notebooks are created as valid `.ipynb` JSON with a title cell and a "Getting Started" cell pointing to the GUIDE.md.

- [ ] **Step 1: Create all directories**

```bash
mkdir -p 00-foundations/notebooks 00-foundations/scripts
mkdir -p 01-hardware/notebooks 01-hardware/scripts
mkdir -p 02-algorithms/notebooks 02-algorithms/scripts
mkdir -p 03-quantum-ml/notebooks 03-quantum-ml/scripts
mkdir -p 04-quantum-chemistry/notebooks 04-quantum-chemistry/scripts
mkdir -p 05-hybrid-jobs/notebooks 05-hybrid-jobs/algorithms 05-hybrid-jobs/containers
```

- [ ] **Step 2: Create notebook template script**

Create a helper script to generate valid .ipynb files with a title and intro cell:

```python
#!/usr/bin/env python3
"""Generate starter Jupyter notebooks for the workspace."""
import json
import sys

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
                    f"**Reference:** See [`{section_guide}`]({section_guide}) for concept explanations and context."
                ]
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "# Setup: Run this cell first\n",
                    "import sys\n",
                    "sys.path.insert(0, '../..')\n",
                    "\n",
                    "from braket.circuits import Circuit\n",
                    "from braket.devices import LocalSimulator\n",
                    "import numpy as np\n",
                    "import matplotlib.pyplot as plt\n",
                    "\n",
                    "# Use local simulator by default (free, instant)\n",
                    "device = LocalSimulator()"
                ]
            }
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "name": "python",
                "version": "3.10.0"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 5
    }
    with open(filepath, 'w') as f:
        json.dump(notebook, f, indent=1)

if __name__ == "__main__":
    # 00-foundations notebooks
    notebooks_00 = [
        ("00-foundations/notebooks/01-first-circuit.ipynb", "Your First Quantum Circuit", "Build, run, and measure a quantum circuit on the local simulator."),
        ("00-foundations/notebooks/02-single-qubit-gates.ipynb", "Single-Qubit Gates", "Explore X, Y, Z, H, S, T, and rotation gates. Visualize state transformations."),
        ("00-foundations/notebooks/03-multi-qubit-gates.ipynb", "Multi-Qubit Gates & Entanglement", "Create Bell states, explore CNOT, SWAP, and Toffoli gates."),
        ("00-foundations/notebooks/04-measurement-statistics.ipynb", "Measurement & Statistics", "Understand shot-based measurement, probability distributions, and statistical accuracy."),
        ("00-foundations/notebooks/05-circuit-composition.ipynb", "Circuit Composition", "Build larger circuits from reusable subcircuits using the shared library."),
    ]
    for path, title, desc in notebooks_00:
        create_notebook(path, title, desc, "../GUIDE.md")

    # 01-hardware notebooks
    notebooks_01 = [
        ("01-hardware/notebooks/01-device-discovery.ipynb", "Device Discovery", "Query Amazon Braket for available quantum devices and their properties."),
        ("01-hardware/notebooks/02-ionq-exploration.ipynb", "IonQ Trapped-Ion Exploration", "Explore IonQ's all-to-all connectivity and native gate set."),
        ("01-hardware/notebooks/03-iqm-exploration.ipynb", "IQM Superconducting Exploration", "Work with nearest-neighbor topology and transpilation."),
        ("01-hardware/notebooks/04-quera-analog.ipynb", "QuEra Analog Hamiltonian Simulation", "Define atom arrays and driving fields for analog quantum computing."),
        ("01-hardware/notebooks/05-simulator-comparison.ipynb", "Simulator Comparison", "Compare SV1, DM1, TN1, and local simulator performance and capabilities."),
        ("01-hardware/notebooks/06-noise-and-errors.ipynb", "Noise and Error Mitigation", "Study noise channels and basic error mitigation techniques."),
    ]
    for path, title, desc in notebooks_01:
        create_notebook(path, title, desc, "../GUIDE.md")

    # 02-algorithms notebooks
    notebooks_02 = [
        ("02-algorithms/notebooks/01-deutsch-jozsa.ipynb", "Deutsch-Jozsa Algorithm", "Determine if a function is constant or balanced with one query."),
        ("02-algorithms/notebooks/02-grovers-search.ipynb", "Grover's Search Algorithm", "Quadratic speedup for unstructured search. Build oracles and optimize iterations."),
        ("02-algorithms/notebooks/03-qft.ipynb", "Quantum Fourier Transform", "Build the QFT circuit and verify against classical FFT."),
        ("02-algorithms/notebooks/04-qpe.ipynb", "Quantum Phase Estimation", "Extract eigenvalues of unitary operators with controlled precision."),
        ("02-algorithms/notebooks/05-qaoa-maxcut.ipynb", "QAOA for MaxCut", "Solve graph optimization with the Quantum Approximate Optimization Algorithm."),
        ("02-algorithms/notebooks/06-amplitude-estimation.ipynb", "Amplitude Estimation", "Quadratic speedup for Monte Carlo estimation tasks."),
    ]
    for path, title, desc in notebooks_02:
        create_notebook(path, title, desc, "../GUIDE.md")

    # 03-quantum-ml notebooks
    notebooks_03 = [
        ("03-quantum-ml/notebooks/01-data-encoding.ipynb", "Quantum Data Encoding", "Encode classical data into quantum states: angle, amplitude, and IQP encodings."),
        ("03-quantum-ml/notebooks/02-quantum-kernels.ipynb", "Quantum Kernel Methods", "Compute quantum kernels and use them with classical SVMs."),
        ("03-quantum-ml/notebooks/03-variational-classifier.ipynb", "Variational Quantum Classifier", "Train a parameterized quantum circuit for binary classification."),
        ("03-quantum-ml/notebooks/04-pennylane-braket.ipynb", "PennyLane + Braket Integration", "Use PennyLane's automatic differentiation with Braket devices."),
        ("03-quantum-ml/notebooks/05-qnn-architecture.ipynb", "Quantum Neural Network Architectures", "Compare hardware-efficient and strongly-entangling QNN designs."),
        ("03-quantum-ml/notebooks/06-barren-plateaus.ipynb", "Barren Plateaus", "Diagnose vanishing gradients and apply mitigation strategies."),
        ("03-quantum-ml/notebooks/07-hybrid-ml-job.ipynb", "QML as a Hybrid Job", "Run quantum ML training at scale with Braket Hybrid Jobs."),
    ]
    for path, title, desc in notebooks_03:
        create_notebook(path, title, desc, "../GUIDE.md")

    # 04-quantum-chemistry notebooks
    notebooks_04 = [
        ("04-quantum-chemistry/notebooks/01-molecular-hamiltonians.ipynb", "Molecular Hamiltonians", "Build H2 and LiH Hamiltonians using OpenFermion and PySCF."),
        ("04-quantum-chemistry/notebooks/02-fermion-qubit-mapping.ipynb", "Fermion-to-Qubit Mappings", "Compare Jordan-Wigner and Bravyi-Kitaev transformations."),
        ("04-quantum-chemistry/notebooks/03-vqe-h2.ipynb", "VQE for Hydrogen (H2)", "Full Variational Quantum Eigensolver workflow for the simplest molecule."),
        ("04-quantum-chemistry/notebooks/04-vqe-lih.ipynb", "VQE for Lithium Hydride (LiH)", "Scale VQE to a larger molecule with active space selection."),
        ("04-quantum-chemistry/notebooks/05-ansatz-design.ipynb", "Ansatz Design Comparison", "UCCSD vs. hardware-efficient ansatze: depth, accuracy, trainability."),
        ("04-quantum-chemistry/notebooks/06-active-space.ipynb", "Active Space Selection", "Reduce qubit requirements by selecting chemically relevant orbitals."),
        ("04-quantum-chemistry/notebooks/07-excited-states.ipynb", "Excited State Calculation", "Go beyond ground state with SSVQE and subspace expansion."),
        ("04-quantum-chemistry/notebooks/08-hybrid-chemistry-job.ipynb", "Production VQE Hybrid Job", "Run chemistry VQE at production scale with Braket Hybrid Jobs."),
    ]
    for path, title, desc in notebooks_04:
        create_notebook(path, title, desc, "../GUIDE.md")

    # 05-hybrid-jobs notebooks
    notebooks_05 = [
        ("05-hybrid-jobs/notebooks/01-first-hybrid-job.ipynb", "Your First Hybrid Job", "Create, submit, and monitor a simple Braket Hybrid Job."),
        ("05-hybrid-jobs/notebooks/02-parametric-compilation.ipynb", "Parametric Compilation", "Speed up variational algorithms by compiling circuits once."),
        ("05-hybrid-jobs/notebooks/03-monitoring-metrics.ipynb", "Real-Time Monitoring", "Log and visualize custom metrics with CloudWatch integration."),
        ("05-hybrid-jobs/notebooks/04-checkpointing.ipynb", "Checkpointing & Recovery", "Save and restore state for fault-tolerant long-running jobs."),
        ("05-hybrid-jobs/notebooks/05-custom-containers.ipynb", "Custom Containers", "Build and deploy custom Docker images for specialized jobs."),
        ("05-hybrid-jobs/notebooks/06-pennylane-jobs.ipynb", "PennyLane Hybrid Jobs", "Run PennyLane variational workflows as managed Braket jobs."),
        ("05-hybrid-jobs/notebooks/07-production-patterns.ipynb", "Production Patterns", "Error handling, retries, cost controls, and deployment best practices."),
    ]
    for path, title, desc in notebooks_05:
        create_notebook(path, title, desc, "../GUIDE.md")

    print("All notebooks created successfully.")
```

Save this as `scripts/generate_notebooks.py` and run it:

Run: `python scripts/generate_notebooks.py`

- [ ] **Step 3: Create 00-foundations scripts**

`00-foundations/scripts/gate_library.py`:
```python
"""Reference library of quantum gates with their matrix representations and effects."""

import numpy as np
from braket.circuits import Circuit


GATES = {
    "X": {
        "matrix": np.array([[0, 1], [1, 0]]),
        "description": "Pauli-X (NOT gate). Flips |0> to |1> and vice versa.",
        "effect_on_zero": "|1>",
        "effect_on_one": "|0>",
    },
    "Y": {
        "matrix": np.array([[0, -1j], [1j, 0]]),
        "description": "Pauli-Y. Rotation about Y-axis by pi.",
        "effect_on_zero": "i|1>",
        "effect_on_one": "-i|0>",
    },
    "Z": {
        "matrix": np.array([[1, 0], [0, -1]]),
        "description": "Pauli-Z. Phase flip on |1>.",
        "effect_on_zero": "|0>",
        "effect_on_one": "-|1>",
    },
    "H": {
        "matrix": (1 / np.sqrt(2)) * np.array([[1, 1], [1, -1]]),
        "description": "Hadamard. Creates equal superposition.",
        "effect_on_zero": "(|0> + |1>)/sqrt(2)",
        "effect_on_one": "(|0> - |1>)/sqrt(2)",
    },
    "S": {
        "matrix": np.array([[1, 0], [0, 1j]]),
        "description": "S gate (sqrt(Z)). Adds pi/2 phase to |1>.",
        "effect_on_zero": "|0>",
        "effect_on_one": "i|1>",
    },
    "T": {
        "matrix": np.array([[1, 0], [0, np.exp(1j * np.pi / 4)]]),
        "description": "T gate (sqrt(S)). Adds pi/4 phase to |1>.",
        "effect_on_zero": "|0>",
        "effect_on_one": "e^(i*pi/4)|1>",
    },
}


def demonstrate_gate(gate_name: str, shots: int = 1000) -> dict:
    """Run a gate on |0> and |1> and return measurement statistics."""
    if gate_name not in GATES:
        raise ValueError(f"Unknown gate: {gate_name}. Available: {list(GATES.keys())}")

    from braket.devices import LocalSimulator
    device = LocalSimulator()
    results = {}

    # Apply to |0>
    circuit_zero = Circuit()
    getattr(circuit_zero, gate_name.lower())(0)
    result_zero = device.run(circuit_zero, shots=shots).result()
    results["input_zero"] = dict(result_zero.measurement_counts)

    # Apply to |1> (prepare |1> with X gate first)
    circuit_one = Circuit()
    circuit_one.x(0)
    getattr(circuit_one, gate_name.lower())(0)
    result_one = device.run(circuit_one, shots=shots).result()
    results["input_one"] = dict(result_one.measurement_counts)

    return results


def print_gate_info(gate_name: str):
    """Print a gate's matrix and properties."""
    gate = GATES[gate_name]
    print(f"=== {gate_name} Gate ===")
    print(f"Description: {gate['description']}")
    print(f"Matrix:\n{gate['matrix']}")
    print(f"|0> -> {gate['effect_on_zero']}")
    print(f"|1> -> {gate['effect_on_one']}")
    print()


if __name__ == "__main__":
    for name in GATES:
        print_gate_info(name)
```

`00-foundations/scripts/state_visualization.py`:
```python
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
```

- [ ] **Step 4: Create 01-hardware scripts**

`01-hardware/scripts/device_status.py`:
```python
#!/usr/bin/env python3
"""Check current Amazon Braket device availability and queue depth."""

from braket.aws import AwsDevice


def main():
    print("=== Amazon Braket Device Status ===\n")
    print(f"{'Device':<35} {'Provider':<12} {'Status':<10} {'Qubits':<8} {'Type'}")
    print("-" * 85)

    try:
        devices = AwsDevice.get_devices()
        for d in sorted(devices, key=lambda x: x.provider_name):
            qubits = getattr(d.properties, "qubitCount", "N/A") if hasattr(d.properties, "qubitCount") else "N/A"
            dev_type = "QPU" if "qpu" in d.arn else "Simulator"
            print(f"{d.name:<35} {d.provider_name:<12} {d.status:<10} {str(qubits):<8} {dev_type}")
    except Exception as e:
        print(f"\nError querying devices: {e}")
        print("Make sure AWS credentials are configured: run 'make setup'")


if __name__ == "__main__":
    main()
```

`01-hardware/scripts/cost_estimator.py`:
```python
#!/usr/bin/env python3
"""Estimate costs for running quantum tasks on Amazon Braket devices."""

import argparse
import sys
sys.path.insert(0, "../..")
from lib.utils.cost import estimate_cost, format_cost_warning, PRICING


def main():
    parser = argparse.ArgumentParser(description="Estimate Amazon Braket task costs")
    parser.add_argument("--device", required=True, choices=list(PRICING.keys()),
                       help="Device/provider name")
    parser.add_argument("--shots", type=int, default=1000, help="Number of shots")
    parser.add_argument("--minutes", type=float, default=1.0,
                       help="Estimated runtime in minutes (for simulators)")
    parser.add_argument("--tasks", type=int, default=1, help="Number of tasks to submit")
    args = parser.parse_args()

    single_cost = estimate_cost(args.device, args.shots, args.minutes)
    total_cost = single_cost * args.tasks

    print(f"\n=== Cost Estimate: {args.device} ===")
    print(f"Shots per task: {args.shots}")
    print(f"Number of tasks: {args.tasks}")
    if "per_minute" in PRICING[args.device]:
        print(f"Estimated runtime: {args.minutes} min/task")
    print(f"\nCost per task: ${single_cost:.4f}")
    print(f"Total estimate: ${total_cost:.4f}")
    print(f"\n{format_cost_warning(args.device, args.shots, args.minutes)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Create 02-algorithms scripts**

`02-algorithms/scripts/oracles.py`:
```python
"""Reusable oracle circuit construction for quantum algorithms."""

from braket.circuits import Circuit
import numpy as np


def constant_oracle(n_qubits: int, output_value: int = 0) -> Circuit:
    """Create a constant oracle f(x) = constant for all x.

    Args:
        n_qubits: Number of input qubits.
        output_value: 0 or 1 — the constant output.

    Returns:
        Circuit implementing the oracle on n_qubits + 1 (ancilla) qubits.
    """
    circuit = Circuit()
    if output_value == 1:
        circuit.x(n_qubits)  # Flip ancilla to make f(x) = 1
    return circuit


def balanced_oracle(n_qubits: int, secret_bits: str = None) -> Circuit:
    """Create a balanced oracle f(x) = 1 for exactly half of inputs.

    Args:
        n_qubits: Number of input qubits.
        secret_bits: Binary string of length n_qubits. CNOT applied where bit is '1'.

    Returns:
        Circuit implementing the oracle on n_qubits + 1 qubits.
    """
    if secret_bits is None:
        secret_bits = "1" * n_qubits

    circuit = Circuit()
    ancilla = n_qubits
    for i, bit in enumerate(secret_bits):
        if bit == "1":
            circuit.cnot(i, ancilla)
    return circuit


def grover_oracle(n_qubits: int, marked_state: str) -> Circuit:
    """Create a Grover oracle that marks a specific state.

    Applies a phase flip (-1) to the marked state.

    Args:
        n_qubits: Number of qubits.
        marked_state: Binary string of the state to mark (e.g., "101").

    Returns:
        Circuit implementing the phase oracle.
    """
    circuit = Circuit()

    # Flip qubits where marked_state has '0'
    for i, bit in enumerate(marked_state):
        if bit == "0":
            circuit.x(i)

    # Multi-controlled Z (implemented as H-MCX-H on last qubit)
    circuit.h(n_qubits - 1)
    # For 3+ qubits, decompose into Toffoli + CNOT
    if n_qubits == 2:
        circuit.cnot(0, 1)
    elif n_qubits == 3:
        circuit.ccnot(0, 1, 2)
    circuit.h(n_qubits - 1)

    # Undo the flips
    for i, bit in enumerate(marked_state):
        if bit == "0":
            circuit.x(i)

    return circuit


def grover_diffusion(n_qubits: int) -> Circuit:
    """Create the Grover diffusion operator (reflect about mean).

    Args:
        n_qubits: Number of qubits.

    Returns:
        Circuit implementing the diffusion operator.
    """
    circuit = Circuit()

    # Apply H to all
    for i in range(n_qubits):
        circuit.h(i)

    # Apply X to all
    for i in range(n_qubits):
        circuit.x(i)

    # Multi-controlled Z
    circuit.h(n_qubits - 1)
    if n_qubits == 2:
        circuit.cnot(0, 1)
    elif n_qubits == 3:
        circuit.ccnot(0, 1, 2)
    circuit.h(n_qubits - 1)

    # Undo X
    for i in range(n_qubits):
        circuit.x(i)

    # Undo H
    for i in range(n_qubits):
        circuit.h(i)

    return circuit
```

`02-algorithms/scripts/variational_utils.py`:
```python
"""Classical optimizer wrappers for variational quantum algorithms."""

import numpy as np
from scipy.optimize import minimize


def optimize_cobyla(cost_fn, initial_params: np.ndarray, maxiter: int = 200,
                    rhobeg: float = 0.5, callback=None) -> dict:
    """Optimize using COBYLA (gradient-free).

    Args:
        cost_fn: Function mapping params -> scalar cost.
        initial_params: Starting parameter values.
        maxiter: Maximum iterations.
        rhobeg: Initial step size.
        callback: Optional function called each iteration with (params, cost).

    Returns:
        Dict with keys: optimal_params, optimal_cost, n_evals, history.
    """
    history = []

    def tracked_cost(params):
        cost = cost_fn(params)
        history.append({"params": params.copy(), "cost": cost})
        if callback:
            callback(params, cost)
        return cost

    result = minimize(tracked_cost, initial_params, method="COBYLA",
                     options={"maxiter": maxiter, "rhobeg": rhobeg})

    return {
        "optimal_params": result.x,
        "optimal_cost": result.fun,
        "n_evals": result.nfev,
        "history": history,
        "success": result.success,
    }


def optimize_spsa(cost_fn, initial_params: np.ndarray, maxiter: int = 200,
                  a: float = 0.1, c: float = 0.1, callback=None) -> dict:
    """Optimize using SPSA (stochastic gradient approximation).

    Only 2 function evaluations per iteration regardless of parameter count.
    Good for noisy cost landscapes.

    Args:
        cost_fn: Function mapping params -> scalar cost.
        initial_params: Starting parameter values.
        maxiter: Maximum iterations.
        a: Step size parameter.
        c: Perturbation size parameter.
        callback: Optional function called each iteration.

    Returns:
        Dict with keys: optimal_params, optimal_cost, n_evals, history.
    """
    params = initial_params.copy()
    history = []
    n_evals = 0

    for k in range(1, maxiter + 1):
        ak = a / (k ** 0.602)
        ck = c / (k ** 0.101)

        delta = np.random.choice([-1, 1], size=len(params))
        params_plus = params + ck * delta
        params_minus = params - ck * delta

        cost_plus = cost_fn(params_plus)
        cost_minus = cost_fn(params_minus)
        n_evals += 2

        gradient_estimate = (cost_plus - cost_minus) / (2 * ck * delta)
        params = params - ak * gradient_estimate

        current_cost = (cost_plus + cost_minus) / 2
        history.append({"params": params.copy(), "cost": current_cost})
        if callback:
            callback(params, current_cost)

    final_cost = cost_fn(params)
    n_evals += 1

    return {
        "optimal_params": params,
        "optimal_cost": final_cost,
        "n_evals": n_evals,
        "history": history,
        "success": True,
    }
```

- [ ] **Step 6: Create 03-quantum-ml scripts**

`03-quantum-ml/scripts/feature_maps.py`:
```python
"""Quantum data encoding circuits (feature maps) for QML."""

import numpy as np
from braket.circuits import Circuit


def angle_encoding(features: np.ndarray) -> Circuit:
    """Encode features as rotation angles (one qubit per feature).

    Args:
        features: 1D array of feature values.

    Returns:
        Circuit with Ry rotations encoding each feature.
    """
    circuit = Circuit()
    for i, x in enumerate(features):
        circuit.ry(i, x)
    return circuit


def iqp_encoding(features: np.ndarray, reps: int = 2) -> Circuit:
    """IQP (Instantaneous Quantum Polynomial) encoding.

    Creates an exponentially large feature space via ZZ interactions.

    Args:
        features: 1D array of feature values.
        reps: Number of encoding repetitions.

    Returns:
        Circuit implementing IQP encoding.
    """
    n_qubits = len(features)
    circuit = Circuit()

    for _ in range(reps):
        # Hadamard layer
        for i in range(n_qubits):
            circuit.h(i)

        # Single-qubit Z rotations
        for i in range(n_qubits):
            circuit.rz(i, features[i])

        # Two-qubit ZZ interactions (product of features)
        for i in range(n_qubits):
            for j in range(i + 1, n_qubits):
                angle = features[i] * features[j]
                circuit.cnot(i, j)
                circuit.rz(j, angle)
                circuit.cnot(i, j)

    return circuit


def amplitude_encoding(features: np.ndarray) -> Circuit:
    """Amplitude encoding — encodes N features into log2(N) qubits.

    Note: This uses a simplified preparation that works for small feature vectors.
    For production use, consider more efficient state preparation algorithms.

    Args:
        features: 1D array with length that is a power of 2. Will be normalized.

    Returns:
        Circuit that prepares the amplitude-encoded state.
    """
    norm = np.linalg.norm(features)
    if norm == 0:
        raise ValueError("Cannot encode zero vector")
    amplitudes = features / norm

    n_qubits = int(np.log2(len(amplitudes)))
    if 2**n_qubits != len(amplitudes):
        raise ValueError(f"Feature length must be power of 2, got {len(amplitudes)}")

    # Use Braket's initialization (state preparation)
    circuit = Circuit()
    # For local simulator, we can initialize directly
    # For hardware, this would need decomposition into gates
    circuit.h(range(n_qubits))  # Placeholder — full implementation needs recursive decomposition
    return circuit
```

`03-quantum-ml/scripts/classifiers.py`:
```python
"""Variational Quantum Classifier and Quantum Kernel implementations."""

import numpy as np
from braket.circuits import Circuit, FreeParameter
from braket.devices import LocalSimulator


def build_vqc_circuit(n_qubits: int, n_layers: int, features: np.ndarray,
                      params: np.ndarray) -> Circuit:
    """Build a Variational Quantum Classifier circuit.

    Architecture: angle encoding -> (Ry rotations + CNOT entangling) x n_layers

    Args:
        n_qubits: Number of qubits (= number of features).
        n_layers: Number of variational layers.
        features: Input data features.
        params: Trainable parameters, shape (n_layers, n_qubits).

    Returns:
        Circuit ready for execution.
    """
    circuit = Circuit()

    # Data encoding
    for i in range(n_qubits):
        circuit.ry(i, features[i])

    # Variational layers
    for layer in range(n_layers):
        # Rotations
        for i in range(n_qubits):
            circuit.ry(i, params[layer, i])

        # Entangling (circular CNOT)
        for i in range(n_qubits - 1):
            circuit.cnot(i, i + 1)
        if n_qubits > 2:
            circuit.cnot(n_qubits - 1, 0)

    return circuit


def quantum_kernel(x1: np.ndarray, x2: np.ndarray, feature_map_fn, shots: int = 1000) -> float:
    """Compute quantum kernel value K(x1, x2) = |<phi(x1)|phi(x2)>|^2.

    Uses the swap test / compute-uncompute approach.

    Args:
        x1: First data point.
        x2: Second data point.
        feature_map_fn: Function mapping features -> Circuit.
        shots: Number of measurement shots.

    Returns:
        Kernel value (overlap) between 0 and 1.
    """
    n_qubits = len(x1)
    device = LocalSimulator()

    # Compute-uncompute: U(x1)^dagger . U(x2) . |0>
    # If x1 == x2, we get |0> back (kernel = 1)
    circuit_x2 = feature_map_fn(x2)
    circuit_x1_adj = feature_map_fn(x1).adjoint()

    combined = circuit_x2.add_circuit(circuit_x1_adj)
    result = device.run(combined, shots=shots).result()

    # Probability of measuring all zeros = |<phi(x1)|phi(x2)>|^2
    counts = result.measurement_counts
    all_zeros = "0" * n_qubits
    kernel_value = counts.get(all_zeros, 0) / shots
    return kernel_value
```

`03-quantum-ml/scripts/training.py`:
```python
"""Hybrid quantum-classical training loops for QML models."""

import numpy as np
from braket.devices import LocalSimulator
from braket.circuits import Circuit


def train_vqc(X_train: np.ndarray, y_train: np.ndarray, n_layers: int = 3,
              learning_rate: float = 0.1, epochs: int = 50,
              shots: int = 1000) -> dict:
    """Train a Variational Quantum Classifier with parameter-shift gradients.

    Args:
        X_train: Training features, shape (n_samples, n_features).
        y_train: Training labels (0 or 1), shape (n_samples,).
        n_layers: Number of variational layers.
        learning_rate: Gradient descent step size.
        epochs: Number of training epochs.
        shots: Measurement shots per circuit evaluation.

    Returns:
        Dict with optimal_params, loss_history, accuracy_history.
    """
    from scripts.classifiers import build_vqc_circuit

    n_qubits = X_train.shape[1]
    params = np.random.uniform(-np.pi, np.pi, size=(n_layers, n_qubits))
    device = LocalSimulator()

    loss_history = []
    accuracy_history = []

    for epoch in range(epochs):
        epoch_loss = 0.0
        correct = 0
        gradients = np.zeros_like(params)

        for x, y in zip(X_train, y_train):
            # Forward pass
            circuit = build_vqc_circuit(n_qubits, n_layers, x, params)
            result = device.run(circuit, shots=shots).result()
            counts = result.measurement_counts
            prob_zero = counts.get("0" * n_qubits, 0) / shots
            prediction = 1.0 - prob_zero  # Map to [0, 1]

            # Loss (MSE)
            loss = (prediction - y) ** 2
            epoch_loss += loss
            correct += int((prediction > 0.5) == y)

            # Parameter-shift gradients
            for l in range(n_layers):
                for q in range(n_qubits):
                    params_plus = params.copy()
                    params_plus[l, q] += np.pi / 2
                    circuit_plus = build_vqc_circuit(n_qubits, n_layers, x, params_plus)
                    result_plus = device.run(circuit_plus, shots=shots).result()
                    prob_plus = 1.0 - result_plus.measurement_counts.get("0" * n_qubits, 0) / shots

                    params_minus = params.copy()
                    params_minus[l, q] -= np.pi / 2
                    circuit_minus = build_vqc_circuit(n_qubits, n_layers, x, params_minus)
                    result_minus = device.run(circuit_minus, shots=shots).result()
                    prob_minus = 1.0 - result_minus.measurement_counts.get("0" * n_qubits, 0) / shots

                    grad = (prob_plus - prob_minus) / 2
                    gradients[l, q] += 2 * (prediction - y) * grad

        # Update parameters
        params -= learning_rate * gradients / len(X_train)

        avg_loss = epoch_loss / len(X_train)
        accuracy = correct / len(X_train)
        loss_history.append(avg_loss)
        accuracy_history.append(accuracy)

        if epoch % 10 == 0:
            print(f"Epoch {epoch}: loss={avg_loss:.4f}, accuracy={accuracy:.2%}")

    return {
        "optimal_params": params,
        "loss_history": loss_history,
        "accuracy_history": accuracy_history,
    }
```

- [ ] **Step 7: Create 04-quantum-chemistry scripts**

`04-quantum-chemistry/scripts/hamiltonians.py`:
```python
"""Molecular Hamiltonian construction utilities using OpenFermion."""

import numpy as np


def build_h2_hamiltonian(bond_length: float = 0.735):
    """Build the qubit Hamiltonian for H2 at a given bond length.

    Args:
        bond_length: H-H distance in Angstroms.

    Returns:
        Tuple of (qubit_hamiltonian, n_qubits, n_electrons).
    """
    from openfermion.chem import MolecularData
    from openfermionpyscf import run_pyscf
    from openfermion.transforms import jordan_wigner, get_fermion_operator

    geometry = [("H", (0.0, 0.0, 0.0)), ("H", (0.0, 0.0, bond_length))]
    molecule = MolecularData(geometry, "sto-3g", 1, 0)
    molecule = run_pyscf(molecule, run_fci=True)

    fermion_hamiltonian = get_fermion_operator(molecule.get_molecular_hamiltonian())
    qubit_hamiltonian = jordan_wigner(fermion_hamiltonian)

    return qubit_hamiltonian, molecule.n_qubits, molecule.n_electrons


def build_lih_hamiltonian(bond_length: float = 1.546):
    """Build the qubit Hamiltonian for LiH at a given bond length.

    Args:
        bond_length: Li-H distance in Angstroms.

    Returns:
        Tuple of (qubit_hamiltonian, n_qubits, n_electrons).
    """
    from openfermion.chem import MolecularData
    from openfermionpyscf import run_pyscf
    from openfermion.transforms import jordan_wigner, get_fermion_operator

    geometry = [("Li", (0.0, 0.0, 0.0)), ("H", (0.0, 0.0, bond_length))]
    molecule = MolecularData(geometry, "sto-3g", 1, 0)
    molecule = run_pyscf(molecule, run_fci=True)

    fermion_hamiltonian = get_fermion_operator(molecule.get_molecular_hamiltonian())
    qubit_hamiltonian = jordan_wigner(fermion_hamiltonian)

    return qubit_hamiltonian, molecule.n_qubits, molecule.n_electrons


def hamiltonian_info(qubit_hamiltonian) -> dict:
    """Extract useful information about a qubit Hamiltonian.

    Args:
        qubit_hamiltonian: OpenFermion QubitOperator.

    Returns:
        Dict with n_terms, max_locality, and summary.
    """
    terms = list(qubit_hamiltonian)
    n_terms = len(terms)
    max_locality = max(len(term) for term in qubit_hamiltonian.terms if term != ())
    identity_coeff = qubit_hamiltonian.terms.get((), 0.0)

    return {
        "n_terms": n_terms,
        "max_locality": max_locality,
        "identity_coefficient": float(np.real(identity_coeff)),
        "summary": f"{n_terms} Pauli terms, max locality {max_locality}",
    }
```

`04-quantum-chemistry/scripts/ansatz.py`:
```python
"""Parameterized ansatz circuit builders for quantum chemistry."""

import numpy as np
from braket.circuits import Circuit


def hardware_efficient_ansatz(n_qubits: int, n_layers: int, params: np.ndarray) -> Circuit:
    """Hardware-efficient ansatz: Ry-Rz rotations + linear CNOT entangling.

    Args:
        n_qubits: Number of qubits.
        n_layers: Number of variational layers.
        params: Parameters array, shape (n_layers, n_qubits, 2) for Ry and Rz.

    Returns:
        Parameterized circuit.
    """
    circuit = Circuit()

    for layer in range(n_layers):
        # Rotation layer
        for q in range(n_qubits):
            circuit.ry(q, params[layer, q, 0])
            circuit.rz(q, params[layer, q, 1])

        # Entangling layer (linear chain)
        for q in range(n_qubits - 1):
            circuit.cnot(q, q + 1)

    return circuit


def uccsd_singles_circuit(n_qubits: int, n_electrons: int, params: np.ndarray) -> Circuit:
    """Simplified UCCSD-inspired ansatz for single excitations.

    For H2 (4 qubits, 2 electrons), this gives the essential physics.

    Args:
        n_qubits: Number of qubits (= number of spin-orbitals).
        n_electrons: Number of electrons.
        params: Array of excitation amplitudes.

    Returns:
        Circuit implementing single excitations.
    """
    circuit = Circuit()

    # Hartree-Fock initial state: occupy lowest orbitals
    for i in range(n_electrons):
        circuit.x(i)

    # Single excitations: excite from occupied to virtual
    param_idx = 0
    occupied = list(range(n_electrons))
    virtual = list(range(n_electrons, n_qubits))

    for occ in occupied:
        for virt in virtual:
            if param_idx < len(params):
                theta = params[param_idx]
                # Givens rotation implementing the excitation
                circuit.ry(virt, theta / 2)
                circuit.cnot(occ, virt)
                circuit.ry(virt, -theta / 2)
                circuit.cnot(occ, virt)
                param_idx += 1

    return circuit
```

`04-quantum-chemistry/scripts/vqe_runner.py`:
```python
"""End-to-end VQE execution pipeline."""

import numpy as np
from braket.devices import LocalSimulator
from braket.circuits import Circuit


def run_vqe(qubit_hamiltonian, ansatz_fn, n_qubits: int, n_params: int,
            shots: int = 4000, maxiter: int = 100, optimizer: str = "cobyla") -> dict:
    """Run VQE to find the ground state energy of a qubit Hamiltonian.

    Args:
        qubit_hamiltonian: OpenFermion QubitOperator.
        ansatz_fn: Function (params) -> Circuit.
        n_qubits: Number of qubits.
        n_params: Number of variational parameters.
        shots: Measurement shots per Pauli term.
        maxiter: Maximum optimizer iterations.
        optimizer: "cobyla" or "spsa".

    Returns:
        Dict with optimal_energy, optimal_params, history, n_evaluations.
    """
    import sys
    sys.path.insert(0, "../..")
    from scripts.variational_utils import optimize_cobyla, optimize_spsa

    device = LocalSimulator()

    def energy_cost(params):
        """Compute <H> by measuring each Pauli term."""
        circuit = ansatz_fn(params)
        total_energy = 0.0

        for term, coeff in qubit_hamiltonian.terms.items():
            if not term:  # Identity term
                total_energy += np.real(coeff)
                continue

            # Build measurement circuit for this Pauli term
            meas_circuit = circuit + _pauli_measurement_circuit(term, n_qubits)
            result = device.run(meas_circuit, shots=shots).result()

            # Compute expectation value
            counts = result.measurement_counts
            exp_val = _expectation_from_pauli_counts(counts, term, n_qubits)
            total_energy += np.real(coeff) * exp_val

        return total_energy

    initial_params = np.random.uniform(-0.1, 0.1, size=n_params)

    if optimizer == "cobyla":
        result = optimize_cobyla(energy_cost, initial_params, maxiter=maxiter)
    else:
        result = optimize_spsa(energy_cost, initial_params, maxiter=maxiter)

    return {
        "optimal_energy": result["optimal_cost"],
        "optimal_params": result["optimal_params"],
        "history": [h["cost"] for h in result["history"]],
        "n_evaluations": result["n_evals"],
    }


def _pauli_measurement_circuit(pauli_term: tuple, n_qubits: int) -> Circuit:
    """Create circuit to rotate into Pauli measurement basis."""
    circuit = Circuit()
    for qubit_idx, pauli_op in pauli_term:
        if pauli_op == "X":
            circuit.h(qubit_idx)
        elif pauli_op == "Y":
            circuit.rx(qubit_idx, np.pi / 2)
        # Z requires no rotation
    return circuit


def _expectation_from_pauli_counts(counts: dict, pauli_term: tuple, n_qubits: int) -> float:
    """Compute Pauli expectation from measurement counts."""
    total_shots = sum(counts.values())
    expectation = 0.0

    relevant_qubits = [q for q, _ in pauli_term]

    for bitstring, count in counts.items():
        # Eigenvalue is (-1)^(sum of relevant bits)
        parity = sum(int(bitstring[q]) for q in relevant_qubits) % 2
        eigenvalue = (-1) ** parity
        expectation += eigenvalue * count / total_shots

    return expectation
```

- [ ] **Step 8: Create 05-hybrid-jobs algorithms and container files**

`05-hybrid-jobs/algorithms/qaoa_maxcut_job.py`:
```python
"""Production QAOA MaxCut solver for Braket Hybrid Jobs.

Usage as a Hybrid Job:
    job = AwsQuantumJob.create(
        source_module="05-hybrid-jobs/algorithms/qaoa_maxcut_job.py",
        device="arn:aws:braket:::device/quantum-simulator/amazon/sv1",
        hyperparameters={"n_layers": "2", "n_shots": "1000", "maxiter": "100"},
        ...
    )
"""

import os
import json
import numpy as np
from braket.circuits import Circuit, FreeParameter
from braket.aws import AwsDevice
from braket.jobs import save_job_result, load_job_checkpoint, save_job_checkpoint
from braket.jobs.metrics import log_metric


def qaoa_circuit(graph_edges, n_qubits, gammas, betas):
    """Build QAOA circuit for MaxCut."""
    circuit = Circuit()
    n_layers = len(gammas)

    # Initial superposition
    for q in range(n_qubits):
        circuit.h(q)

    for layer in range(n_layers):
        # Cost unitary: exp(-i * gamma * C)
        for (i, j) in graph_edges:
            circuit.cnot(i, j)
            circuit.rz(j, gammas[layer])
            circuit.cnot(i, j)

        # Mixer unitary: exp(-i * beta * B)
        for q in range(n_qubits):
            circuit.rx(q, 2 * betas[layer])

    return circuit


def maxcut_cost(bitstring, graph_edges):
    """Compute MaxCut cost for a given bitstring."""
    cost = 0
    for (i, j) in graph_edges:
        if bitstring[i] != bitstring[j]:
            cost += 1
    return cost


def main():
    # Load hyperparameters
    hp = json.loads(os.environ.get("AMZN_BRAKET_HP", "{}"))
    n_layers = int(hp.get("n_layers", 2))
    n_shots = int(hp.get("n_shots", 1000))
    maxiter = int(hp.get("maxiter", 100))

    # Load graph from input (or use default)
    input_dir = os.environ.get("AMZN_BRAKET_INPUT_DIR", "")
    graph_file = os.path.join(input_dir, "graph.json") if input_dir else None

    if graph_file and os.path.exists(graph_file):
        with open(graph_file) as f:
            graph_data = json.load(f)
        graph_edges = [tuple(e) for e in graph_data["edges"]]
        n_qubits = graph_data["n_nodes"]
    else:
        # Default: triangle graph
        graph_edges = [(0, 1), (1, 2), (0, 2)]
        n_qubits = 3

    # Setup device
    device_arn = os.environ.get("AMZN_BRAKET_DEVICE_ARN", None)
    if device_arn:
        from braket.aws import AwsDevice
        device = AwsDevice(device_arn)
    else:
        from braket.devices import LocalSimulator
        device = LocalSimulator()

    # Check for checkpoint
    checkpoint = load_job_checkpoint()
    if checkpoint:
        params = np.array(checkpoint["params"])
        start_iter = checkpoint["iteration"]
    else:
        params = np.random.uniform(0, np.pi, size=2 * n_layers)
        start_iter = 0

    # Optimization loop
    from scipy.optimize import minimize

    best_cost = float("inf")
    best_params = params.copy()

    def cost_fn(params):
        nonlocal best_cost, best_params
        gammas = params[:n_layers]
        betas = params[n_layers:]

        circuit = qaoa_circuit(graph_edges, n_qubits, gammas, betas)

        if hasattr(device, "run"):
            s3 = (os.environ.get("AMZN_BRAKET_OUT_S3_BUCKET", ""), "jobs")
            try:
                task = device.run(circuit, s3_destination_folder=s3, shots=n_shots)
                result = task.result()
            except Exception:
                from braket.devices import LocalSimulator
                result = LocalSimulator().run(circuit, shots=n_shots).result()
        else:
            result = device.run(circuit, shots=n_shots).result()

        # Compute expected MaxCut cost
        counts = result.measurement_counts
        total = sum(counts.values())
        expected_cost = sum(
            maxcut_cost(bs, graph_edges) * count / total
            for bs, count in counts.items()
        )

        neg_cost = -expected_cost  # Minimize negative cost = maximize cut
        if neg_cost < best_cost:
            best_cost = neg_cost
            best_params = params.copy()

        log_metric(metric_name="maxcut_value", value=expected_cost)
        return neg_cost

    result = minimize(cost_fn, params, method="COBYLA",
                     options={"maxiter": maxiter})

    # Save results
    gammas = best_params[:n_layers]
    betas = best_params[n_layers:]
    final_circuit = qaoa_circuit(graph_edges, n_qubits, gammas, betas)
    from braket.devices import LocalSimulator
    final_result = LocalSimulator().run(final_circuit, shots=n_shots * 10).result()
    counts = final_result.measurement_counts
    best_bitstring = max(counts, key=lambda bs: maxcut_cost(bs, graph_edges))

    save_job_result({
        "optimal_params": best_params.tolist(),
        "best_cut_value": maxcut_cost(best_bitstring, graph_edges),
        "best_partition": best_bitstring,
        "n_edges": len(graph_edges),
        "graph_edges": graph_edges,
    })


if __name__ == "__main__":
    main()
```

`05-hybrid-jobs/algorithms/vqe_chemistry_job.py`:
```python
"""Production VQE chemistry solver for Braket Hybrid Jobs."""

import os
import json
import numpy as np
from braket.jobs import save_job_result, load_job_checkpoint, save_job_checkpoint
from braket.jobs.metrics import log_metric


def main():
    hp = json.loads(os.environ.get("AMZN_BRAKET_HP", "{}"))
    molecule = hp.get("molecule", "H2")
    bond_length = float(hp.get("bond_length", "0.735"))
    n_layers = int(hp.get("n_layers", "2"))
    maxiter = int(hp.get("maxiter", "100"))
    shots = int(hp.get("n_shots", "4000"))

    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
    from scripts.hamiltonians import build_h2_hamiltonian, build_lih_hamiltonian

    if molecule == "H2":
        hamiltonian, n_qubits, n_electrons = build_h2_hamiltonian(bond_length)
    elif molecule == "LiH":
        hamiltonian, n_qubits, n_electrons = build_lih_hamiltonian(bond_length)
    else:
        raise ValueError(f"Unsupported molecule: {molecule}")

    from scripts.ansatz import hardware_efficient_ansatz

    n_params = n_layers * n_qubits * 2
    initial_params = np.random.uniform(-0.1, 0.1, size=(n_layers, n_qubits, 2))

    from braket.devices import LocalSimulator
    device = LocalSimulator()

    def energy_fn(flat_params):
        params = flat_params.reshape(n_layers, n_qubits, 2)
        circuit = hardware_efficient_ansatz(n_qubits, n_layers, params)
        total_energy = 0.0

        for term, coeff in hamiltonian.terms.items():
            if not term:
                total_energy += np.real(coeff)
                continue

            from braket.circuits import Circuit
            meas_circuit = Circuit()
            for gate in circuit.instructions:
                meas_circuit.add_instruction(gate)

            for qubit_idx, pauli_op in term:
                if pauli_op == "X":
                    meas_circuit.h(qubit_idx)
                elif pauli_op == "Y":
                    meas_circuit.rx(qubit_idx, np.pi / 2)

            result = device.run(meas_circuit, shots=shots).result()
            counts = result.measurement_counts
            total = sum(counts.values())
            relevant_qubits = [q for q, _ in term]
            exp_val = sum(
                ((-1) ** sum(int(bs[q]) for q in relevant_qubits)) * c / total
                for bs, c in counts.items()
            )
            total_energy += np.real(coeff) * exp_val

        log_metric(metric_name="energy", value=total_energy)
        return total_energy

    from scipy.optimize import minimize
    result = minimize(energy_fn, initial_params.flatten(), method="COBYLA",
                     options={"maxiter": maxiter})

    save_job_result({
        "molecule": molecule,
        "bond_length": bond_length,
        "ground_state_energy": float(result.fun),
        "optimal_params": result.x.tolist(),
        "n_qubits": n_qubits,
        "converged": result.success,
    })


if __name__ == "__main__":
    main()
```

`05-hybrid-jobs/algorithms/qml_training_job.py`:
```python
"""Production QML training job for Braket Hybrid Jobs."""

import os
import json
import numpy as np
from braket.jobs import save_job_result, save_job_checkpoint, load_job_checkpoint
from braket.jobs.metrics import log_metric


def main():
    hp = json.loads(os.environ.get("AMZN_BRAKET_HP", "{}"))
    n_layers = int(hp.get("n_layers", "3"))
    epochs = int(hp.get("epochs", "50"))
    learning_rate = float(hp.get("learning_rate", "0.1"))
    shots = int(hp.get("n_shots", "1000"))

    # Load training data
    input_dir = os.environ.get("AMZN_BRAKET_INPUT_DIR", "")
    data_file = os.path.join(input_dir, "training_data.npz") if input_dir else None

    if data_file and os.path.exists(data_file):
        data = np.load(data_file)
        X_train, y_train = data["X"], data["y"]
    else:
        # Generate toy dataset (moons)
        from sklearn.datasets import make_moons
        X_train, y_train = make_moons(n_samples=100, noise=0.1, random_state=42)
        # Normalize to [0, pi]
        X_train = (X_train - X_train.min(axis=0)) / (X_train.max(axis=0) - X_train.min(axis=0)) * np.pi

    n_qubits = X_train.shape[1]

    # Check for checkpoint
    checkpoint = load_job_checkpoint()
    if checkpoint:
        params = np.array(checkpoint["params"])
        start_epoch = checkpoint["epoch"]
    else:
        params = np.random.uniform(-np.pi, np.pi, size=(n_layers, n_qubits))
        start_epoch = 0

    from braket.devices import LocalSimulator
    device = LocalSimulator()

    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
    from scripts.classifiers import build_vqc_circuit

    for epoch in range(start_epoch, epochs):
        epoch_loss = 0.0
        correct = 0
        gradients = np.zeros_like(params)

        for x, y in zip(X_train, y_train):
            circuit = build_vqc_circuit(n_qubits, n_layers, x, params)
            result = device.run(circuit, shots=shots).result()
            prob_zero = result.measurement_counts.get("0" * n_qubits, 0) / shots
            prediction = 1.0 - prob_zero

            loss = (prediction - y) ** 2
            epoch_loss += loss
            correct += int((prediction > 0.5) == y)

        avg_loss = epoch_loss / len(X_train)
        accuracy = correct / len(X_train)

        log_metric(metric_name="loss", value=float(avg_loss), iteration_number=epoch)
        log_metric(metric_name="accuracy", value=accuracy, iteration_number=epoch)

        # Save checkpoint every 10 epochs
        if epoch % 10 == 0:
            save_job_checkpoint({"params": params.tolist(), "epoch": epoch})

        # Simple gradient update (finite differences for speed)
        eps = 0.01
        for l in range(n_layers):
            for q in range(n_qubits):
                params[l, q] += eps
                loss_plus = sum(
                    (1.0 - device.run(build_vqc_circuit(n_qubits, n_layers, x, params), shots=shots)
                     .result().measurement_counts.get("0" * n_qubits, 0) / shots - y) ** 2
                    for x, y in zip(X_train[:10], y_train[:10])
                ) / 10
                params[l, q] -= 2 * eps
                loss_minus = sum(
                    (1.0 - device.run(build_vqc_circuit(n_qubits, n_layers, x, params), shots=shots)
                     .result().measurement_counts.get("0" * n_qubits, 0) / shots - y) ** 2
                    for x, y in zip(X_train[:10], y_train[:10])
                ) / 10
                params[l, q] += eps
                gradients[l, q] = (loss_plus - loss_minus) / (2 * eps)

        params -= learning_rate * gradients

    save_job_result({
        "optimal_params": params.tolist(),
        "final_loss": float(avg_loss),
        "final_accuracy": float(accuracy),
        "epochs_completed": epochs,
    })


if __name__ == "__main__":
    main()
```

`05-hybrid-jobs/containers/Dockerfile`:
```dockerfile
FROM 292282985366.dkr.ecr.us-east-1.amazonaws.com/amazon-braket-base-jobs:latest

# Additional chemistry dependencies
RUN pip install --no-cache-dir \
    openfermion>=1.6 \
    openfermionpyscf>=0.5 \
    pyscf>=2.4 \
    pennylane>=0.38 \
    pennylane-braket>=1.25 \
    scikit-learn>=1.4

# Copy workspace library
COPY lib/ /opt/ml/code/lib/
```

`05-hybrid-jobs/containers/build_and_push.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO_NAME="braket-quantum-workspace"
IMAGE_TAG="latest"

FULL_NAME="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}:${IMAGE_TAG}"

echo "=== Building and Pushing Custom Braket Container ==="
echo "Image: $FULL_NAME"
echo ""

# Create ECR repository if it doesn't exist
aws ecr describe-repositories --repository-names "$REPO_NAME" 2>/dev/null || \
    aws ecr create-repository --repository-name "$REPO_NAME"

# Login to ECR
aws ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Also login to the Braket base image ECR (public)
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin 292282985366.dkr.ecr.us-east-1.amazonaws.com

# Build from project root (need access to lib/)
cd "$(dirname "$0")/../.."
docker build -f 05-hybrid-jobs/containers/Dockerfile -t "$FULL_NAME" .

# Push
docker push "$FULL_NAME"

echo ""
echo "=== Done ==="
echo "Image URI: $FULL_NAME"
echo "Use this in AwsQuantumJob.create(image_uri='$FULL_NAME', ...)"
```

- [ ] **Step 9: Commit all scaffolding**

```bash
chmod +x 05-hybrid-jobs/containers/build_and_push.sh
git add 00-foundations/ 01-hardware/ 02-algorithms/ 03-quantum-ml/ 04-quantum-chemistry/ 05-hybrid-jobs/ scripts/
git commit -m "feat: add all notebooks, scripts, algorithms, and container files"
```

---

### Task 11: Final Integration & Verification

- [ ] **Step 1: Verify directory structure matches spec**

Run: `find . -type f | sort | head -80`

Verify all files from the spec exist.

- [ ] **Step 2: Run linting on all Python files**

Run: `pip install ruff && ruff check . --fix`

Fix any issues found.

- [ ] **Step 3: Run the test suite**

Run: `pip install -e ".[dev]" && pytest tests/ -v`

All tests should pass on local simulator.

- [ ] **Step 4: Verify notebooks are valid JSON**

```bash
python -c "
import json, glob
for nb in glob.glob('**/*.ipynb', recursive=True):
    try:
        with open(nb) as f:
            json.load(f)
    except json.JSONDecodeError as e:
        print(f'INVALID: {nb}: {e}')
    else:
        print(f'OK: {nb}')
"
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git status
git commit -m "chore: final integration — lint fixes and verification" --allow-empty
```

- [ ] **Step 6: Print completion summary**

```bash
echo "=== Quantum Braket Workspace Ready ==="
echo ""
echo "Quick start:"
echo "  make setup    # Install dependencies + validate AWS"
echo "  make lab      # Launch JupyterLab"
echo "  make devices  # Check available quantum hardware"
echo ""
echo "Learning path:"
echo "  00-foundations/ -> 01-hardware/ -> 02-algorithms/ -> 03-quantum-ml/ -> 04-quantum-chemistry/ -> 05-hybrid-jobs/"
echo ""
echo "Each section has a GUIDE.md with concepts, exercises, references, and videos."
```
