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

$$\ket{\psi} = \alpha\ket{0} + \beta\ket{1}$$

where $\alpha$ and $\beta$ are complex amplitudes satisfying $|\alpha|^2 + |\beta|^2 = 1$.

**State vector representation:** A qubit state is a unit vector in a 2D complex vector space ($\mathbb{C}^2$):

$$\ket{0} = \begin{bmatrix} 1 \\ 0 \end{bmatrix} \text{ (basis "zero")}, \qquad \ket{1} = \begin{bmatrix} 0 \\ 1 \end{bmatrix} \text{ (basis "one")}$$

The probability of measuring $\ket{0}$ is $|\alpha|^2$ and $\ket{1}$ is $|\beta|^2$.

**Bloch sphere:** Any single-qubit pure state can be visualized as a point on the unit sphere:

$$\ket{\psi} = \cos\tfrac{\theta}{2}\ket{0} + e^{i\phi}\sin\tfrac{\theta}{2}\ket{1}$$

- North pole ($\theta=0$): $\ket{0}$
- South pole ($\theta=\pi$): $\ket{1}$
- Equator: equal superposition states (e.g., $\ket{+}$ at $\phi=0$, $\ket{-}$ at $\phi=\pi$)

**Global phase:** States that differ only by a global phase ($e^{i\gamma}\ket{\psi}$) are physically indistinguishable. Only relative phase between $\ket{0}$ and $\ket{1}$ components matters.

### Single-Qubit Gates

Quantum gates are unitary matrices that transform qubit states. Key single-qubit gates:

**Pauli Gates:**
- X gate (NOT): Flips $\ket{0} \leftrightarrow \ket{1}$. Matrix: $\begin{bmatrix} 0 & 1 \\ 1 & 0 \end{bmatrix}$
- Y gate: Rotation about Y-axis. Matrix: $\begin{bmatrix} 0 & -i \\ i & 0 \end{bmatrix}$
- Z gate: Phase flip on $\ket{1}$. Matrix: $\begin{bmatrix} 1 & 0 \\ 0 & -1 \end{bmatrix}$

**Hadamard Gate (H):**
Creates superposition from basis states:
- $H\ket{0} = \tfrac{1}{\sqrt{2}}(\ket{0} + \ket{1}) = \ket{+}$
- $H\ket{1} = \tfrac{1}{\sqrt{2}}(\ket{0} - \ket{1}) = \ket{-}$
- Matrix: $\tfrac{1}{\sqrt{2}}\begin{bmatrix} 1 & 1 \\ 1 & -1 \end{bmatrix}$

Try it live — apply a Hadamard to $\ket{0}$ and watch the amplitudes split into an equal superposition (the Bloch vector swings from the north pole to the $+x$ equator):

```qsim
qubits 1
H 0
```

Now sweep a continuous rotation. Drag $\theta$ and watch $R_y(\theta)\ket{0}$ trace a path between $\ket{0}$ and $\ket{1}$:

```qsim
qubits 1
RY 0 theta
```

**Phase Gates:**
- S gate: $\pi/2$ phase on $\ket{1}$. Matrix: $\begin{bmatrix} 1 & 0 \\ 0 & i \end{bmatrix}$
- T gate: $\pi/4$ phase on $\ket{1}$. Matrix: $\begin{bmatrix} 1 & 0 \\ 0 & e^{i\pi/4} \end{bmatrix}$

**Rotation Gates:**
- $R_x(\theta)$: Rotation about X-axis by angle $\theta$
- $R_y(\theta)$: Rotation about Y-axis by angle $\theta$
- $R_z(\theta)$: Rotation about Z-axis by angle $\theta$

Any single-qubit unitary can be decomposed as $U = R_z(\alpha)\,R_y(\beta)\,R_z(\gamma)$ (up to global phase).

### Multi-Qubit Gates

**CNOT (Controlled-NOT):** The fundamental two-qubit gate. Flips the target qubit if and only if the control qubit is $\ket{1}$.

- $\text{CNOT}\ket{00} = \ket{00}$
- $\text{CNOT}\ket{01} = \ket{01}$
- $\text{CNOT}\ket{10} = \ket{11}$
- $\text{CNOT}\ket{11} = \ket{10}$

CNOT + single-qubit gates form a universal gate set (can approximate any unitary).

**CZ (Controlled-Z):** Applies Z to target when control is $\ket{1}$. Symmetric — either qubit can be "control."

**SWAP:** Exchanges the states of two qubits. Can be decomposed into three CNOTs.

**Toffoli (CCNOT):** Three-qubit gate — flips target only when both controls are $\ket{1}$. Universal for classical reversible computation.

### Entanglement

Entanglement is a correlation between qubits that has no classical analogue. An entangled state cannot be written as a product of individual qubit states.

**Bell States (maximally entangled two-qubit states):**
- $\ket{\Phi^+} = \tfrac{1}{\sqrt{2}}(\ket{00} + \ket{11})$ — created by H on qubit 0, then CNOT(0,1)
- $\ket{\Phi^-} = \tfrac{1}{\sqrt{2}}(\ket{00} - \ket{11})$
- $\ket{\Psi^+} = \tfrac{1}{\sqrt{2}}(\ket{01} + \ket{10})$
- $\ket{\Psi^-} = \tfrac{1}{\sqrt{2}}(\ket{01} - \ket{10})$

Measuring one qubit of a Bell pair instantly determines the other's outcome, regardless of distance. This is the basis for quantum teleportation and superdense coding.

**GHZ State:** The n-qubit generalization: $\tfrac{1}{\sqrt{2}}(\ket{00\dots0} + \ket{11\dots1})$. Maximally entangled — measuring any one qubit collapses all others.

### Measurement

Quantum measurement is probabilistic and irreversible. In the computational basis:

- Probability of outcome $\ket{x}$: $|\langle x|\psi\rangle|^2$
- Post-measurement state: collapses to $\ket{x}$ (Born rule)

**Shot-based measurement:** On real hardware, you run the circuit many times ("shots") and collect statistics. More shots = better probability estimates, but each shot has a cost on real QPUs.

**Partial measurement:** Measuring only some qubits collapses those qubits while leaving unmeasured qubits in a (potentially) updated state.

### The Circuit Model

Quantum computation in the circuit model:
1. Initialize qubits in $\ket{0}$ state
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
