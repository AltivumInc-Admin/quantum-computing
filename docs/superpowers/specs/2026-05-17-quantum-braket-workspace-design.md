# Amazon Braket Quantum Computing Workspace Design

## Overview

A dedicated workspace for exploring quantum computing on AWS using Amazon Braket. Structured as a progressive learning path from circuit fundamentals through production hybrid quantum-classical workloads, with focused tracks on Quantum Machine Learning and Quantum Chemistry/Biochemistry.

## Target User

- Conceptual understanding of quantum computing (superposition, entanglement, gates)
- Transitioning to hands-on implementation via Amazon Braket
- Interested in all available hardware: IonQ (trapped ion), IQM (superconducting), QuEra (neutral atom), and managed simulators (SV1, DM1, TN1)
- Development preference: Jupyter notebooks for exploration + Python scripts for reusable modules

## Directory Structure

```
quantum/
├── 00-foundations/
│   ├── GUIDE.md
│   ├── notebooks/
│   └── scripts/
├── 01-hardware/
│   ├── GUIDE.md
│   ├── notebooks/
│   └── scripts/
├── 02-algorithms/
│   ├── GUIDE.md
│   ├── notebooks/
│   └── scripts/
├── 03-quantum-ml/
│   ├── GUIDE.md
│   ├── notebooks/
│   └── scripts/
├── 04-quantum-chemistry/
│   ├── GUIDE.md
│   ├── notebooks/
│   └── scripts/
├── 05-hybrid-jobs/
│   ├── GUIDE.md
│   ├── notebooks/
│   ├── algorithms/
│   └── containers/
├── infra/
│   ├── cloudformation/
│   └── scripts/
├── lib/
│   ├── circuits/
│   ├── utils/
│   └── hardware/
├── tests/
├── pyproject.toml
├── .env.example
├── Makefile
└── CLAUDE.md
```

## Section Details

### 00-foundations/

**Purpose:** Bridge from conceptual understanding to hands-on circuit building.

**GUIDE.md covers:**
- Qubits: mathematical representation (|0>, |1>, Bloch sphere, state vectors)
- Single-qubit gates: X, Y, Z, H, S, T, Rx, Ry, Rz with matrix representations
- Multi-qubit gates: CNOT, CZ, SWAP, Toffoli
- Circuit model of computation: gate ordering, measurement, classical registers
- Superposition and interference as computational resources
- Entanglement: Bell states, GHZ states, practical implications
- Measurement: Born rule, projective measurement, partial measurement
- Amazon Braket SDK basics: Circuit class, gates, result types

**Notebooks:**
1. `01-first-circuit.ipynb` — Hello quantum world on the local simulator
2. `02-single-qubit-gates.ipynb` — Exploring each gate, visualizing state changes
3. `03-multi-qubit-gates.ipynb` — Entanglement, Bell states, correlations
4. `04-measurement-statistics.ipynb` — Shot-based results, probability distributions
5. `05-circuit-composition.ipynb` — Building larger circuits from smaller ones

**Scripts:**
- `gate_library.py` — Reference implementations of common gates
- `state_visualization.py` — Bloch sphere and statevector plotting utilities

### 01-hardware/

**Purpose:** Understand what real quantum hardware offers and how devices differ.

**GUIDE.md covers:**
- Quantum hardware technologies: trapped ions, superconducting qubits, neutral atoms
- IonQ (Aria, Forte): all-to-all connectivity, high gate fidelity, slower clock speed
- IQM (Garnet): superconducting, nearest-neighbor connectivity, fast gates
- QuEra (Aquila): neutral atom arrays, analog Hamiltonian simulation
- Managed simulators: SV1 (state vector, up to 34 qubits), DM1 (density matrix, noise), TN1 (tensor network, large circuits)
- Local simulator: rapid prototyping without AWS costs
- Device properties: native gates, connectivity graphs, qubit counts, availability windows
- Cost model: per-task + per-shot pricing varies by device

**Notebooks:**
1. `01-device-discovery.ipynb` — Querying available devices, properties, status
2. `02-ionq-exploration.ipynb` — Native gates, running circuits on IonQ
3. `03-iqm-exploration.ipynb` — Topology constraints, transpilation for nearest-neighbor
4. `04-quera-analog.ipynb` — Analog Hamiltonian simulation (AHS) basics
5. `05-simulator-comparison.ipynb` — SV1 vs DM1 vs TN1: when to use which
6. `06-noise-and-errors.ipynb` — Real device noise, error rates, mitigation intro

**Scripts:**
- `device_status.py` — CLI tool to check device availability and queue depth
- `cost_estimator.py` — Estimate cost for a given circuit on each device

### 02-algorithms/

**Purpose:** Implement core quantum algorithms to build algorithmic intuition.

**GUIDE.md covers:**
- Oracle-based algorithms: Deutsch-Jozsa, Bernstein-Vazirani, Simon's
- Grover's search: amplitude amplification, oracle construction, optimal iterations
- Quantum Phase Estimation (QPE): eigenvalue extraction, connection to chemistry
- Quantum Fourier Transform (QFT): comparison to classical FFT
- Variational algorithms intro: ansatz, cost function, parameter optimization
- QAOA: combinatorial optimization, MaxCut as a case study
- VQE overview (detailed treatment in 04-quantum-chemistry/)
- Amplitude estimation: quadratic speedup for Monte Carlo methods

**Notebooks:**
1. `01-deutsch-jozsa.ipynb` — First oracle algorithm, quantum advantage proof
2. `02-grovers-search.ipynb` — Unstructured search, optimal iteration count
3. `03-qft.ipynb` — Quantum Fourier Transform circuit and applications
4. `04-qpe.ipynb` — Phase estimation for eigenvalue problems
5. `05-qaoa-maxcut.ipynb` — QAOA for graph optimization
6. `06-amplitude-estimation.ipynb` — Quadratic speedup for estimation tasks

**Scripts:**
- `oracles.py` — Reusable oracle construction utilities
- `variational_utils.py` — Parameter optimization wrappers (COBYLA, SPSA, Adam)

### 03-quantum-ml/

**Purpose:** Apply quantum computing to machine learning problems.

**GUIDE.md covers:**
- Quantum data encoding: basis encoding, amplitude encoding, angle encoding, IQP encoding
- Parameterized Quantum Circuits (PQCs) as ML models
- Quantum kernels: kernel trick with quantum feature maps, SVM with quantum kernels
- Variational Quantum Classifiers (VQC): training, barren plateaus, expressibility
- Quantum Neural Networks (QNNs): architecture design, trainability
- Hybrid quantum-classical training loops
- PennyLane integration with Braket: QNodes, optimizers, device switching
- Barren plateaus: diagnosis and mitigation strategies
- Practical considerations: when quantum ML might offer advantage

**Notebooks:**
1. `01-data-encoding.ipynb` — Encoding classical data into quantum states
2. `02-quantum-kernels.ipynb` — Quantum kernel estimation and SVM classification
3. `03-variational-classifier.ipynb` — Training a VQC on a toy dataset
4. `04-pennylane-braket.ipynb` — Using PennyLane with Braket devices
5. `05-qnn-architecture.ipynb` — Designing and training quantum neural networks
6. `06-barren-plateaus.ipynb` — Diagnosing and avoiding trainability issues
7. `07-hybrid-ml-job.ipynb` — Running QML training as a Braket Hybrid Job

**Scripts:**
- `feature_maps.py` — Library of data encoding circuits
- `classifiers.py` — VQC and QNN implementations
- `training.py` — Hybrid training loops with classical optimizers

### 04-quantum-chemistry/

**Purpose:** Apply quantum computing to molecular simulation and biochemistry.

**GUIDE.md covers:**
- Second quantization: fermions, creation/annihilation operators
- Molecular Hamiltonians: electronic structure problem
- Fermion-to-qubit mappings: Jordan-Wigner, Bravyi-Kitaev, parity
- Variational Quantum Eigensolver (VQE): ansatz design, classical optimizer loop
- Unitary Coupled Cluster (UCC) ansatz: UCCSD, hardware-efficient alternatives
- Basis sets and active space selection
- Ground state energy estimation workflow
- Excited states: SSVQE, quantum subspace expansion
- Applications: drug discovery, protein folding (conceptual), materials science
- Integration with OpenFermion and PySCF

**Notebooks:**
1. `01-molecular-hamiltonians.ipynb` — Building H2, LiH Hamiltonians
2. `02-fermion-qubit-mapping.ipynb` — Jordan-Wigner, Bravyi-Kitaev comparison
3. `03-vqe-h2.ipynb` — Full VQE workflow for hydrogen molecule
4. `04-vqe-lih.ipynb` — Scaling to lithium hydride
5. `05-ansatz-design.ipynb` — UCCSD vs hardware-efficient ansatze
6. `06-active-space.ipynb` — Reducing qubit requirements for larger molecules
7. `07-excited-states.ipynb` — Going beyond ground state
8. `08-hybrid-chemistry-job.ipynb` — Production VQE as a Braket Hybrid Job

**Scripts:**
- `hamiltonians.py` — Molecular Hamiltonian construction utilities
- `ansatz.py` — Parameterized ansatz circuit builders
- `vqe_runner.py` — End-to-end VQE execution pipeline

### 05-hybrid-jobs/

**Purpose:** Run production quantum-classical workloads using Braket Hybrid Jobs.

**GUIDE.md covers:**
- When to use Hybrid Jobs vs standalone quantum tasks
- Priority QPU access and parametric compilation benefits
- Job lifecycle: creation, execution, monitoring, results retrieval
- Algorithm scripts: structure, entry points, input/output handling
- Hyperparameters, checkpoints, and metrics (CloudWatch integration)
- Custom containers: when and how to use them
- Cost management: instance types, spot instances, timeout configuration
- PennyLane with Hybrid Jobs
- CUDA-Q integration for GPU-accelerated quantum simulation
- Debugging and monitoring: logs, metrics, cancellation

**Notebooks:**
1. `01-first-hybrid-job.ipynb` — Creating and running a simple hybrid job
2. `02-parametric-compilation.ipynb` — Speed up iterative algorithms
3. `03-monitoring-metrics.ipynb` — Real-time monitoring with CloudWatch
4. `04-checkpointing.ipynb` — Resume long-running jobs from checkpoints
5. `05-custom-containers.ipynb` — Building and using custom Docker images
6. `06-pennylane-jobs.ipynb` — PennyLane variational workflows as jobs
7. `07-production-patterns.ipynb` — Error handling, retries, cost controls

**Algorithms:**
- `qaoa_maxcut_job.py` — Production QAOA script
- `vqe_chemistry_job.py` — Production VQE script
- `qml_training_job.py` — Production QML training script

**Containers:**
- `Dockerfile` — Base custom container with extra dependencies
- `build_and_push.sh` — Script to build and push to ECR

### infra/

**CloudFormation templates:**
- `braket-iam.yaml` — Least-privilege IAM role for Braket, S3, CloudWatch
- `braket-s3.yaml` — Results bucket with lifecycle rules (auto-cleanup of old results)
- `braket-budget.yaml` — AWS Budget alarm with configurable threshold + SNS notification
- `braket-notebook.yaml` — Managed Braket notebook instance (optional)
- `main.yaml` — Nested stack deploying all of the above

**Scripts:**
- `validate-setup.sh` — Checks AWS CLI, Braket service enabled, correct region
- `deploy-infra.sh` — Deploys the CloudFormation stack
- `teardown-infra.sh` — Destroys the stack (with confirmation prompt)
- `cost-report.py` — Queries Cost Explorer for Braket-specific spend

### lib/

Shared Python library importable from any notebook or script:

- `lib/circuits/` — Reusable circuit patterns (bell pair, GHZ, QFT subcircuit)
- `lib/utils/` — Result parsing, histogram plotting, statevector visualization, cost tracking
- `lib/hardware/` — Device abstraction layer (run same circuit on any backend with one-line switch)

### tests/

Pytest test suite for lib/ modules. Ensures circuit utilities, parsing, and hardware abstraction work correctly. Tests run on local simulator only (no AWS costs).

## Dependencies (pyproject.toml)

```toml
[project]
name = "quantum-braket-workspace"
version = "0.1.0"
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
```

## Makefile Targets

- `make setup` — Install dependencies via uv/pip, validate AWS credentials
- `make lab` — Launch JupyterLab in the workspace
- `make test` — Run pytest on lib/ and tests/
- `make devices` — Print current Braket device availability and queue status
- `make cost` — Show current month Braket spend
- `make lint` — Run ruff on all Python files
- `make deploy-infra` — Deploy CloudFormation stack
- `make teardown-infra` — Destroy CloudFormation stack

## GUIDE.md Format

Each section's GUIDE.md follows this structure:

```markdown
# [Section Title]

## Learning Objectives
[What you'll be able to do after completing this section]

## Prerequisites
[What sections/concepts you should have completed first]

## Concepts

### [Concept 1]
[Detailed pedagogical explanation — not surface-level. Includes mathematical
notation where relevant, diagrams described in text, and connections to
prior sections]

### [Concept 2]
...

## Hands-On Exercises
[Ordered list of notebooks/scripts with descriptions of what each teaches]

## References

### AWS Documentation
- [Link title](url) — brief description

### Video Resources
- [Video title](youtube-url) — speaker, event, duration, what it covers

### Papers & Further Reading
- [Paper/book title](url) — why it's relevant
```

## CLAUDE.md (Project Instructions)

Project-level CLAUDE.md will instruct future sessions that:
- This is a quantum computing learning workspace using Amazon Braket
- Prefer local simulator for testing/development to avoid costs
- Use PennyLane for variational/hybrid algorithms
- Follow the numbered progression when suggesting next steps
- Include cost warnings before any suggestion that would run on real QPU hardware
- Reference the AWS Braket documentation for device-specific details

## .env.example

```
AWS_DEFAULT_REGION=us-east-1
BRAKET_S3_BUCKET=amazon-braket-results-{account-id}
BRAKET_S3_PREFIX=quantum-workspace
AWS_PROFILE=default
BRAKET_MONTHLY_BUDGET=50
```
