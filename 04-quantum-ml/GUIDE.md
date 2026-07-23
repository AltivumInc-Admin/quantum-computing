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

```qcard
{"id":"qml-encoding-determines-feature-space-1","prompt":"In QML, what does the choice of data encoding fix before any training happens?","answer":"It fixes the feature space (the quantum feature map / geometry) the model ever gets to see, so a model can only separate what the encoding makes separable. Encoding is a modeling choice, not a formality."}
```

- **Basis encoding** — map an integer to `|x⟩`. Simple, but one qubit per bit and no continuous
  features.
- **Angle encoding** — map each feature to a rotation: `|φ(x)⟩ = ⊗ᵢ RY(xᵢ)|0⟩`. One qubit per
  feature, hardware-efficient; the feature space is the surface of `n` Bloch spheres.
- **Amplitude encoding** — pack `N` features into the `log₂N` amplitudes of `⌈log₂N⌉` qubits.
  Exponentially compact, but `O(N)` gates to prepare. Note the workspace's Möttönen routine
  (`lib.ml.feature_maps.amplitude_encoding`) is the Ry-only case: it needs **non-negative**
  features and an **exact power-of-2** length, and raises otherwise. The explorer below shows the
  general signed construction, so it will happily render inputs the Python rejects — for signed
  data in a notebook, reach for angle encoding.
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

The widget just laid that point out for you — now build the same angle encoding yourself, in real
Braket Python (graded by running your code in the browser):

```qchallenge
{
  "id": "qml-angle-encode-py-1",
  "prompt": "Angle-encode the 2-feature point x = (0.6, 0.9) in real Braket Python: apply RY(0.6) to qubit 0 and RY(0.9) to qubit 1. Assign your circuit to `circuit`.",
  "qubits": 2,
  "target": { "program": "RY 0 0.6\nRY 1 0.9" },
  "starter": "from braket.circuits import Circuit\ncircuit = Circuit()",
  "hint": "Angle encoding maps each feature to a Y-rotation: one RY per qubit, carrying the feature value in radians. Enter the full features 0.6 and 0.9 — Braket's ry takes the angle directly, so do not halve them into 0.3 and 0.45 yourself.",
  "tier": "py"
}
```

The distribution view of that same encoding is worth committing to memory — angle-encode the
point exactly as the widget just did, and predict what a measurement most often returns:

```qpredict
{
  "id": "qml-predict-encoded-point-1",
  "prompt": "Angle encoding loads the point x = (0.6, 0.9) as RY(0.6) on qubit 0 and RY(0.9) on qubit 1. Which basis state is the most likely measurement outcome?",
  "program": "RY 0 0.6\nRY 1 0.9",
  "mode": "top-outcome",
  "hint": "RY(x) leaves P(1) = sin²(x/2) — the half-angle is the trap. sin²(0.3) ≈ 0.09 and sin²(0.45) ≈ 0.19, so both qubits stay heavily biased toward |0⟩ and 00 dominates at about 74%. Small features barely leave the north pole — which is exactly why the scale you encode at changes the model."
}
```

A subtlety the widget makes visible: over-scaling the features wraps them around the Bloch sphere
and aliases distinct inputs together. Encoding is a modeling choice, not a formality.

A second subtlety: IQP's feature rotations are all diagonal (RZ and ZZ), so within a single
H-then-diagonal block they write the data into *phases* while every basis state keeps the
magnitude the Hadamards gave it. (The widget's full map runs that block twice — the second H
layer turns the first block's phases into the uneven bars you saw.) Predict which outcomes stay
live after one block:

```qpredict
{
  "id": "qml-predict-iqp-phases-1",
  "prompt": "An IQP-style feature map encodes x = (0.6, 0.9): H on both qubits, then RZ(0.6) on qubit 0, RZ(0.9) on qubit 1, and a ZZ interaction carrying the product feature 0.54. Which basis states have nonzero probability?",
  "program": "H 0\nH 1\nRZ 0 0.6\nRZ 1 0.9\nCNOT 0 1\nRZ 1 0.54\nCNOT 0 1",
  "mode": "nonzero-states",
  "hint": "After the Hadamards every remaining operation is a phase write (the CNOT–RZ–CNOT sandwich is a ZZ rotation): phases change, magnitudes never do. All four states stay at 25% — after a single block the features are invisible to a plain Z-basis readout. IQP maps earn their keep through interference: extra H layers (the widget map runs two blocks) or a kernel inverse map turn those phases into measurable differences."
}
```

## The model: a PQC is a neural network

A parameterized quantum circuit (PQC) with parameters $\theta$ defines a function
$f(x;\theta)$: encode $x$, apply trainable unitary layers $U(\theta)$, measure an observable. The
analogy to a neural net is exact —

- data encoding ↔ input layer,
- parameterized unitaries ↔ hidden layers,
- measurement (e.g. $\langle Z_0\rangle$) ↔ output.

```qcard
{"id":"qml-pqc-is-neural-net-1","prompt":"In the PQC-as-neural-network analogy, what plays the role of the hidden layers?","answer":"The parameterized (trainable) unitary layers `U(theta)`. Data encoding maps to the input layer and the measurement (e.g. expectation of `Z_0`) maps to the output."}
```

The first two layers of that network are something you can already build by hand — an input
layer that encodes one feature, and a single entangling gate that shares it with a second qubit:

```qchallenge
{
  "id": "qml-challenge-encoded-point-1",
  "prompt": "Build the network's first two layers: encode the feature x = 2π/3 with RY(2.0944) on qubit 0, then entangle it onto qubit 1 with a CNOT (control 0). Target: 0.5|00⟩ + 0.866|11⟩.",
  "qubits": 2,
  "target": { "program": "RY 0 2.0944\nCNOT 0 1" },
  "allowedGates": ["RY", "CNOT"],
  "hint": "RY(θ) puts cos(θ/2) on |0⟩ and sin(θ/2) on |1⟩, so the full feature 2.0944 goes into the gate — the trap is entering the half-angle 1.0472 yourself, which lands the wrong amplitudes. Then a CNOT with control 0 copies the excitation: the |1⟩ branch flips qubit 1, stacking the weight on |00⟩ and |11⟩."
}
```

The design knobs are the same kind you know: depth (number of layers), the entangling pattern
(linear / circular / all-to-all), the rotation gates, and the measurement. And just like a neural
net, you get gradients — exactly, via the **parameter-shift rule**: for a gate
$R(\theta)=e^{-i\theta P/2}$,
$$
\frac{\partial f}{\partial \theta} = \tfrac{1}{2}\big[f(\theta+\tfrac{\pi}{2}) - f(\theta-\tfrac{\pi}{2})\big],
$$
an exact derivative from two circuit evaluations — no finite differences.

```qcard
{"id":"qml-parameter-shift-rule-1","prompt":"How many circuit evaluations does the parameter-shift rule need to get the exact gradient of a gate angle?","answer":"Two: it evaluates `f(theta + pi/2)` and `f(theta - pi/2)`, takes half their difference, and gets an exact derivative with no finite-difference error."}
```

The output layer of this "network" is nothing more than an expectation value — so read one
yourself. The model below has encoded an input as a concrete rotation; commit to what its
$\langle Z_0\rangle$ output reads before the reveal:

```qexpect
{
  "id": "qml-expect-encoded-readout-1",
  "prompt": "A one-qubit model encodes an input as RY(π/3) applied to |0⟩. The model's output is the expectation ⟨Z₀⟩. What is its value?",
  "program": "RY 0 1.0472",
  "observable": "Z 0",
  "hint": "RY(θ) tilts the Bloch vector θ away from +Z, so ⟨Z⟩ = cos θ — and cos(π/3) = 1/2. The 0.75 trap is P(measuring +1) = (1 + ⟨Z⟩)/2, not the expectation itself."
}
```

And the readout is a design knob in its own right. Keep the state exactly as it is and swap the
measured observable — the model reports a *different feature* of the same encoding:

```qexpect
{
  "id": "qml-expect-x-readout-1",
  "prompt": "Same encoded state — RY(π/3) applied to |0⟩ — but the model now reads out ⟨X₀⟩ instead of ⟨Z₀⟩. What is the value?",
  "program": "RY 0 1.0472",
  "observable": "X 0",
  "hint": "After RY(θ) the Bloch vector is (sin θ, 0, cos θ): the Z readout gave cos(π/3) = 0.5, but X reads the horizontal component sin(π/3) = √3/2 ≈ 0.87. Same state, different observable, different output — the measurement basis is a modeling decision, not an afterthought."
}
```

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

The boundary you just watched is drawn by a sign: the trainer labels a point $+1$ or $-1$
according to the sign of $\langle Z_0\rangle$. Push an encoded feature past the equator and the
readout flips negative — verify the $-1$ side by hand:

```qexpect
{
  "id": "qml-expect-negative-class-1",
  "prompt": "A variational classifier labels points by the sign of ⟨Z₀⟩. An input is encoded as RY(2π/3) applied to |0⟩. What does ⟨Z₀⟩ read for this point?",
  "program": "RY 0 2.0944",
  "observable": "Z 0",
  "hint": "⟨Z⟩ = cos θ, and 2π/3 sits past the equator: cos(2π/3) = −1/2. Probabilities can never go negative but expectations can — the 0.75 trap is P(measuring 1) = (1 − ⟨Z⟩)/2, not the readout. A signed output is exactly what lets one number act as a class label."
}
```

That trainer reads its prediction from $\langle Z_0\rangle$ on an *entangled* two-qubit state —
and entanglement does something counterintuitive to a single-qubit readout. Commit before you
reveal:

```qexpect
{
  "id": "qml-expect-entangled-readout-1",
  "prompt": "An entangling layer prepares the Bell state (H then CNOT). Your model takes its output from the single-qubit expectation ⟨Z₀⟩. What is that value?",
  "program": "H 0\nCNOT 0 1",
  "observable": "Z 0",
  "hint": "Alone, an entangled qubit is a coin flip: the Bell state's single-qubit marginal is maximally mixed, so ⟨Z₀⟩ = 0. The correlation lives in joint readouts like ⟨Z₀Z₁⟩ — a readout design lesson: entangle too hard right before measuring one qubit and your model outputs noise."
}
```

That hint's fix is worth doing, not just reading: move the readout to the joint observable and
the signal the single qubit lost comes back —

```qexpect
{
  "id": "qml-expect-zz-correlation-1",
  "prompt": "Same Bell-state model (H then CNOT), but the readout is now the correlation feature ⟨Z₀Z₁⟩. What is its value?",
  "program": "H 0\nCNOT 0 1",
  "observable": "Z 0 Z 1",
  "hint": "Each qubit alone is a coin flip (⟨Z₀⟩ = ⟨Z₁⟩ = 0), but the pair always agrees: the only outcomes are 00 and 11, and both are +1 eigenstates of Z₀Z₁, so the expectation is exactly +1. Entanglement moves the signal from the marginals into the correlations — a joint observable is how a model reads it back out."
}
```

## QNN architectures

The ansatz $U(\theta)$ is where the art lives. Common families:

- **Hardware-efficient** — alternate single-qubit rotations with nearest-neighbor CNOTs. Shallow
  and device-friendly, but prone to the barren plateaus below.
- **Strongly-entangling** — all-to-all entanglement between layers. More expressive, deeper.
- **Convolutional QNN** — local gates in a translationally-invariant pattern, à la CNNs; good for
  data with spatial structure.

Wiring these entangling patterns is where real circuits quietly go wrong. The layer below was
meant to run a linear CNOT chain, but as wired no two-qubit gate ever touches the readout qubit —
it stays in a product state, and nothing a later layer does can route the other features into
$\langle Z_0\rangle$:

```qdebug
{
  "id": "qml-debug-decoupled-readout-1",
  "prompt": "This hardware-efficient layer should entangle the register as a linear chain — CNOT(0,1) then CNOT(1,2) — so readout qubit 0 becomes entangled with the rest and later layers can steer every feature into ⟨Z₀⟩. As wired, the entanglers only touch qubits 1 and 2, leaving qubit 0 decoupled. Rewire the entangling layer.",
  "qubits": 3,
  "broken": { "program": "RY 0 0.7854\nRY 1 0.7854\nRY 2 0.7854\nCNOT 1 2\nCNOT 2 1" },
  "target": { "program": "RY 0 0.7854\nRY 1 0.7854\nRY 2 0.7854\nCNOT 0 1\nCNOT 1 2" },
  "allowedGates": ["RY", "CNOT"],
  "hint": "Trace which qubits each CNOT touches: neither one involves qubit 0, so the readout qubit stays in a product state and ⟨Z₀⟩ is pinned at cos(π/4) ≈ 0.71 no matter what the other features do. Keep the three RY rotations and rebuild the chain from the readout qubit down: CNOT(0,1), then CNOT(1,2)."
}
```

More expressive is not automatically better — which the next section makes painfully clear.

## The catch: barren plateaus

Here is the wall. For sufficiently random, expressive PQCs, the gradient of the cost function
**vanishes exponentially with qubit count**: $\mathrm{Var}(\partial C/\partial\theta) \sim 2^{-n}$.
The optimizer sees a flat, featureless landscape and makes no progress — and no amount of training
steps helps, because there is no slope to follow.

See it happen. The plot below samples random circuits and tracks the gradient variance versus
qubit count. The **global** cost (measuring all qubits) collapses exponentially; the **local** cost
(measuring one qubit) stays in a band at shallow depth — the single most important mitigation.
Then raise the depth slider and watch the local band start to tilt too — locality buys trainability,
not immunity, and Cerezo et al. show the local cost collapses as well once depth grows well past the
range this slider offers:

```qcard
{"id":"qml-barren-plateau-1","prompt":"In a barren plateau, how does the variance of the cost gradient scale with qubit count, and what is the single most important mitigation?","answer":"For random, expressive PQCs the gradient variance vanishes exponentially, roughly as `2^-n`, leaving a flat landscape. The single most important mitigation is using a local cost function (measuring one qubit instead of all)."}
```

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

On the local simulator those gradients are free; a managed simulator (SV1) meters them by the minute. On a QPU, every parameter-shift evaluation is a billed
task — and a training loop multiplies that meter fast. Price a single gradient step before you
believe hardware training is casual:

```qcostestimate
{
  "id": "qml-cost-param-shift-step-1",
  "prompt": "One parameter-shift gradient step for a 6-parameter model runs 2 evaluations per parameter — 12 tasks — at 100 shots each on IonQ. What does the single step cost?",
  "provider": "IonQ",
  "shots": 100,
  "tasks": 12,
  "hint": "Every one of the 12 evaluations is its own task: a flat {perTask} plus {shots} × {perShot} in shots. The trap is pricing one task and forgetting that parameter-shift pays the meter 2 × P times per step — and a training run repeats this every iteration."
}
```

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
      "id": "qml-encoding-matters",
      "q": "Why does the choice of data encoding matter so much in QML?",
      "hint": "Think about what the encoding determines before any training happens.",
      "a": "The encoding defines the quantum feature map — the geometry of the space the model operates in. A model can only separate what the encoding makes separable, so the encoding is a modeling decision, not a formality. (And over-scaling features aliases distinct inputs together, hurting accuracy.)"
    },
    {
      "id": "qml-kernel-vs-vqc-tradeoff",
      "q": "What is the trade-off between quantum kernels and variational training?",
      "hint": "One uses a fixed feature map + a classical convex solver; the other trains the circuit itself.",
      "a": "Quantum kernels compute a fixed feature-map similarity K and hand it to a classical SVM — convex, no barren plateaus, but `O(n^2)` kernel evaluations in the dataset size. Variational training tunes the circuit end-to-end — flexible and compact, but the optimization is non-convex and can hit barren plateaus."
    },
    {
      "id": "qml-barren-plateau",
      "q": "What is a barren plateau, and name one mitigation?",
      "hint": "It is about how the gradient behaves as you add qubits.",
      "a": "For random/expressive PQCs the variance of the cost gradient vanishes exponentially in qubit count (about `2^-n`), so the landscape is flat and the optimizer can't progress. Mitigations: use a LOCAL cost, keep the ansatz shallow/structured/problem-inspired, initialize near the identity, or train layer-by-layer."
    },
    {
      "id": "qml-parameter-shift",
      "q": "What does the parameter-shift rule compute, and how many circuit runs does it need?",
      "hint": "It is an exact gradient, not an approximation.",
      "a": "The exact gradient of an expectation value with respect to a gate angle: `df/dtheta = (1/2)[f(theta + pi/2) - f(theta - pi/2)]` — just two circuit evaluations, with no finite-difference error."
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
- `scripts/feature_maps.py` — Reusable data encoding circuits (angle, amplitude, IQP). Re-uploading
  is not shipped as an encoder — you build it yourself in `04-pennylane-braket.ipynb` Exercise 1.
- `scripts/classifiers.py` — VQC and quantum kernel classifier implementations
- `scripts/training.py` — `train_vqc`: PennyLane analytic-gradient descent returning the optimal
  params plus per-epoch loss and accuracy history, with a progress line every ten epochs

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
