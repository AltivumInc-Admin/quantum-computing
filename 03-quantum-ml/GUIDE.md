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
