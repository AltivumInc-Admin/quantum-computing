# Quantum Machine Learning

Quantum machine learning is a simple idea wearing intimidating clothes: **the model is a quantum
circuit.** You feed in classical data, a parameterized circuit transforms it, and a measurement
reads out a prediction — and you train the parameters exactly like a neural network, using the
variational machinery from `03-algorithms`. This module walks that loop end to end: get data in,
build the model, learn (two ways), and confront the wall the whole field keeps hitting — barren
plateaus. Every idea below runs live in your browser.

> **You'll come away able to** encode classical data into quantum states, build and train a
> variational quantum classifier, use quantum kernels, and diagnose barren plateaus. **You'll want
> first:** `03-algorithms` (the variational loop, parameter-shift gradients) and classical ML
> basics (loss, gradient descent, SVMs). Everything on this page is a self-contained simulation —
> no AWS needed.

---

## Getting data in: encoding

A quantum computer can only learn from data you've loaded into a quantum state, and **how you load
it fixes the feature space the model ever gets to see.** The main strategies:

- **Basis encoding** — map an integer to `|x⟩`. Simple, but one qubit per bit and no continuous
  features.
- **Angle encoding** — map each feature to a rotation: `|φ(x)⟩ = ⊗ᵢ RY(xᵢ)|0⟩`. One qubit per
  feature, hardware-efficient; the feature space is the surface of `n` Bloch spheres.
- **Amplitude encoding** — pack `N` features into the `log₂N` amplitudes of `⌈log₂N⌉` qubits.
  Exponentially compact, but `O(N)` gates to prepare.
- **IQP / ZZ encoding** — Hadamards, then single-qubit and ZZ rotations driven by feature
  *products*. Builds an exponentially large, structured feature space — the basis of quantum
  kernels with potential advantage.
- **Re-uploading** — encode the data *again* in later layers, multiplying expressivity without
  adding qubits.

Encode a 2-feature point yourself and watch the state it produces — switch between angle, amplitude,
and IQP and see how differently each lays the data out:

```qencode
{"x": [0.6, 0.9], "encoding": "angle"}
```

A subtlety the widget makes visible: over-scaling the features wraps them around the Bloch sphere
and aliases distinct inputs together. Encoding is a modeling choice, not a formality.

## The model: a PQC is a neural network

A parameterized quantum circuit (PQC) with parameters $\theta$ defines a function
$f(x;\theta)$: encode $x$, apply trainable unitary layers $U(\theta)$, measure an observable. The
analogy to a neural net is exact —

- data encoding ↔ input layer,
- parameterized unitaries ↔ hidden layers,
- measurement (e.g. $\langle Z_0\rangle$) ↔ output.

The design knobs are the same kind you know: depth (number of layers), the entangling pattern
(linear / circular / all-to-all), the rotation gates, and the measurement. And just like a neural
net, you get gradients — exactly, via the **parameter-shift rule**: for a gate
$R(\theta)=e^{-i\theta P/2}$,
$$
\frac{\partial f}{\partial \theta} = \tfrac{1}{2}\big[f(\theta+\tfrac{\pi}{2}) - f(\theta-\tfrac{\pi}{2})\big],
$$
an exact derivative from two circuit evaluations — no finite differences.

## Two ways to learn

With data encoded and gradients in hand, there are two routes to a trained model.

**Quantum kernels.** Don't train the circuit at all — use it to *measure similarity*. Encode each
point with a feature map and compute the fidelity kernel
$$
K(x_i, x_j) = |\langle \phi(x_i)|\phi(x_j)\rangle|^2,
$$
then hand the kernel matrix to a classical SVM. The quantum feature map can carve a boundary in a
space that's hard to reach classically — turning a linearly-inseparable dataset separable. Try it:
switch the feature map and push the scale slider to watch over-encoding *hurt*.

```qkernel
{"dataset": "circles", "map": "iqp"}
```

**Variational training.** Or train the circuit end to end, like a neural net: encode $x$, apply the
ansatz $U(\theta)$, measure $\langle Z_0\rangle$, compute a loss, and descend the gradient
(parameter-shift). Press **Train** and watch a tiny 2-qubit classifier carve out its decision
boundary while the loss falls:

```qvqc
{"dataset": "blobs"}
```

## QNN architectures

The ansatz $U(\theta)$ is where the art lives. Common families:

- **Hardware-efficient** — alternate single-qubit rotations with nearest-neighbor CNOTs. Shallow
  and device-friendly, but prone to the barren plateaus below.
- **Strongly-entangling** — all-to-all entanglement between layers. More expressive, deeper.
- **Convolutional QNN** — local gates in a translationally-invariant pattern, à la CNNs; good for
  data with spatial structure.

More expressive is not automatically better — which the next section makes painfully clear.

## The catch: barren plateaus

Here is the wall. For sufficiently random, expressive PQCs, the gradient of the cost function
**vanishes exponentially with qubit count**: $\mathrm{Var}(\partial C/\partial\theta) \sim 2^{-n}$.
The optimizer sees a flat, featureless landscape and makes no progress — and no amount of training
steps helps, because there is no slope to follow.

See it happen. The plot below samples random circuits and tracks the gradient variance versus
qubit count. The **global** cost (measuring all qubits) collapses exponentially; the **local** cost
(measuring one qubit) stays in a band at shallow depth — the single most important mitigation.
Then raise the depth slider and watch even the local cost eventually flatten (Cerezo et al.):

```qbarren
{"depth": 2, "samples": 400}
```

The other mitigations follow the same logic: keep cost functions local, keep ansätze structured
(problem-inspired, not random), initialize near the identity, and train layer-by-layer. Barren
plateaus are *the* reason "just make it bigger" fails in QML.

## The tooling: PennyLane + Braket

PennyLane is the framework that makes all of this differentiable on Braket — it handles
parameter-shift gradients on hardware, backprop on simulators, an optimizer library, and one-line
device switching:

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

PennyLane handles automatic differentiation (parameter-shift on QPU, backprop on simulator), an
optimizer library (gradient descent, Adam, QNG), one-line device switching (local → SV1 → QPU), and
integration with PyTorch, TensorFlow, and JAX.

## Does it actually help? — and a check

The honest answer: **sometimes, and only for the right data.** A quantum model helps when the data
has structure that a quantum feature map captures and classical models cannot efficiently — and the
"power of data" results (Huang et al.) show that for many problems, classical ML with enough data
matches or beats it. QML is a sharp tool for specific structure, not a universal speedup. Check
yourself:

```quiz
{
  "questions": [
    {
      "q": "Why does the choice of data encoding matter so much in QML?",
      "hint": "Think about what the encoding determines before any training happens.",
      "a": "The encoding defines the quantum feature map — the geometry of the space the model operates in. A model can only separate what the encoding makes separable, so the encoding is a modeling decision, not a formality. (And over-scaling features aliases distinct inputs together, hurting accuracy.)"
    },
    {
      "q": "What is the trade-off between quantum kernels and variational training?",
      "hint": "One uses a fixed feature map + a classical convex solver; the other trains the circuit itself.",
      "a": "Quantum kernels compute a fixed feature-map similarity K and hand it to a classical SVM — convex, no barren plateaus, but O(n^2) kernel evaluations in the dataset size. Variational training tunes the circuit end-to-end — flexible and compact, but the optimization is non-convex and can hit barren plateaus."
    },
    {
      "q": "What is a barren plateau, and name one mitigation?",
      "hint": "It is about how the gradient behaves as you add qubits.",
      "a": "For random/expressive PQCs the variance of the cost gradient vanishes exponentially in qubit count (~2^-n), so the landscape is flat and the optimizer can't progress. Mitigations: use a LOCAL cost, keep the ansatz shallow/structured/problem-inspired, initialize near the identity, or train layer-by-layer."
    },
    {
      "q": "What does the parameter-shift rule compute, and how many circuit runs does it need?",
      "hint": "It is an exact gradient, not an approximation.",
      "a": "The exact gradient of an expectation value with respect to a gate angle: df/dtheta = (1/2)[f(theta+pi/2) - f(theta-pi/2)] — just two circuit evaluations, with no finite-difference error."
    }
  ]
}
```

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

## Where this goes next

You can now encode data, build and train quantum models, and recognize the barren-plateau wall. The
next module, **`05-quantum-chemistry`**, points the same variational machinery at molecules:
the Variational Quantum Eigensolver (VQE) finds ground-state energies of molecular Hamiltonians —
arguably the most promising near-term application of everything you've built so far.

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
