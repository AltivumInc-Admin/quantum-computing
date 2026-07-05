# Quantum Computing Foundations

In the prerequisites you learned to **describe** a qubit — to spin the coin, write down where
it leans, and read off the odds of heads or tails. That is a noun. This module is about the
**verbs**: how to *act* on a qubit, *combine* two of them into something with no classical
shadow, and *read* the answer back out.

By the end you will have built, by hand, the single most important two-qubit state in all of
quantum computing — and you will have watched, on screen, the thing Einstein called
"spooky." Everything here runs live in your browser; no install, no AWS account, no cost.

> **You'll come away able to** place any single-qubit state on the Bloch sphere, drive it
> with gates, reason about measurement as sampling, and prepare and verify entanglement on
> the Amazon Braket SDK. **You'll want first:** the prerequisites module (Dirac notation,
> unit vectors in $\mathbb{C}^2$, the Born rule, basic NumPy). If $\ket{\psi} = \alpha\ket{0} + \beta\ket{1}$
> reads cleanly, you're ready.

---

## The qubit, in one breath

A classical bit sits at 0 or 1. A qubit lives in a superposition of both:

$$
\ket{\psi} = \alpha\ket{0} + \beta\ket{1}, \qquad |\alpha|^2 + |\beta|^2 = 1
$$

The two complex numbers $\alpha$ and $\beta$ are **amplitudes** — the precise version of "which
way the spun coin leans." As a vector, $\ket{0} = \begin{bmatrix} 1 \\ 0 \end{bmatrix}$ and
$\ket{1} = \begin{bmatrix} 0 \\ 1 \end{bmatrix}$, so a qubit is just a unit vector in
$\mathbb{C}^2$.

Here is the spun coin made literal. Qubit 0 starts flat at $\ket{0}$; a Hadamard ($H$) sets
it spinning into the perfectly balanced superposition $\ket{+}$. Read the amplitude bars and
the Dirac state below — this is the whole noun in one gate:

```qsim
qubits 1
H 0
```

One subtlety you will lean on constantly: an overall **global phase** $e^{i\gamma}\ket{\psi}$
changes nothing you can measure. Only the *relative* phase between the $\ket{0}$ and $\ket{1}$
parts is physical. Hold that thought — it is why the Bloch sphere works.

```qcard
{"id":"found-global-phase-1","prompt":"Do a state and the same state multiplied by an overall phase factor (a global phase) produce any difference you can measure?","answer":"No. A global phase like `e^(iγ)` is physically invisible; only the relative phase between the `|0>` and `|1>` parts is observable."}
```

## Measurement — what "looking" costs

Before we act on a qubit, we have to be honest about what happens when we *look* at one,
because looking is destructive. Measurement in the computational basis is **probabilistic and
irreversible**:

- The probability of outcome $\ket{x}$ is $|\braket{x}{\psi}|^2$ — the **Born rule**.
- The act of measuring **collapses** the state onto the outcome you got. Measure $\ket{+}$,
  see "0," and the qubit is now $\ket{0}$ — the rest of the superposition is gone for good.

So a single measurement tells you almost nothing. To see the *distribution* a state encodes,
you prepare it, measure, and repeat — each run is a **shot**. The empirical histogram creeps
toward the true Born-rule probabilities as the shot count grows, and never quite arrives.
That convergence is the entire reason real quantum hardware is billed per shot.

```qcard
{"id":"found-shots-1","prompt":"Why does the empirical measurement histogram of a state never exactly match the Born-rule probabilities for any finite number of shots?","answer":"Each shot is a random sample, so the histogram only creeps toward the true probabilities as the shot count grows and never quite arrives; you'd reach them only in the limit of infinitely many shots."}
```

Run it yourself. This is $\ket{+}$ again; fire 1 shot, then 10, 100, 1,000, 10,000 and watch
the bars settle onto the 50/50 line the Born rule predicts:

```qshots
qubits 1
H 0
```

That gap between "what one shot shows" and "what the state actually is" is the texture of all
quantum experiments. Keep it in mind: every claim we make about a state is really a claim
about a histogram.

## Gates as rotations

Now the verbs. A quantum **gate** is a unitary matrix — a transformation that preserves length
(so a unit vector stays a unit vector). On a single qubit there is a far friendlier picture
than matrices: **every gate is a rotation of the Bloch sphere.** The north pole is $\ket{0}$,
the south pole is $\ket{1}$, the equator is maximal superposition, and a gate just turns the
arrow.

Scroll through one rotation and watch it happen — the arrow leaves the north pole, sweeps
through the equator, and lands on the south pole:

```qscrolly
{"beats":[{"caption":"Start at the north pole: the ground state, |0>. All of the amplitude sits on |0>.","theta":0},{"caption":"A rotation tips the arrow toward the equator — the qubit is now an equal superposition of |0> and |1>.","theta":1.5707963267948966},{"caption":"Push the rotation further and the arrow swings past the equator: |1> grows as |0> fades.","theta":2.0943951023931953},{"caption":"At the south pole the half-turn is complete — a single gate has carried |0> all the way to |1>.","theta":3.141592653589793}]}
```

```qcard
{"id":"found-gate-rotation-1","prompt":"What is the geometric picture for any single-qubit quantum gate acting on the Bloch sphere?","answer":"Every single-qubit gate is a rotation of the Bloch sphere; it just turns the arrow (a unitary preserves length, so a unit vector stays a unit vector)."}
```

Build a state by hand and feel it. Drag $\theta$ (how far from the north pole) and $\phi$ (how
far around) and watch the amplitudes, the probabilities, and the gate sequence that produces
your state:

```qbloch
```

The parameterization you just drove is exactly

$$
\ket{\psi} = \cos\tfrac{\theta}{2}\ket{0} + e^{i\phi}\sin\tfrac{\theta}{2}\ket{1},
$$

and the rotation gates are how you reach any point on the sphere:

- $R_x(\theta)$, $R_y(\theta)$, $R_z(\theta)$ rotate by angle $\theta$ about the X, Y, Z axes.

Watch one continuous rotation gate-by-gate. $R_y(\theta)$ tips the arrow off the north pole;
drag the sphere to look around, or press play to sweep $\theta$ and watch $R_y(\theta)\ket{0}$
trace the meridian from $\ket{0}$ to $\ket{1}$:

```qscrub
qubits 1
RY 0 theta
```

You have watched rotations sweep the arrow; now place a state yourself. Drive $\theta$ and
$\phi$ until your vector sits on the target marker, then press Check — your placement is graded
by how many degrees of arc separate you from it, and a clean hit schedules this skill for
spaced review:

```qblochtarget
{
  "id": "found-bloch-plus-1",
  "prompt": "Drive the Bloch vector to |+⟩ = (|0⟩ + |1⟩)/√2 — the state H prepares from |0⟩.",
  "target": { "program": "H 0" },
  "toleranceDeg": 5,
  "hint": "θ tilts the arrow away from |0⟩ at the north pole; φ swings it around the equator. |+⟩ sits on the equator (θ = π/2) at φ = 0, pointing along +X."
}
```

With the geometry in hand, the named gates are just memorable special rotations. Here is the
reference card — but you now know what each one *does* before you read its matrix:

| Gate | Effect | Matrix |
|---|---|---|
| $X$ (NOT) | $\ket{0}\leftrightarrow\ket{1}$ — a half-turn about X | $\begin{bmatrix} 0 & 1 \\ 1 & 0 \end{bmatrix}$ |
| $Y$ | half-turn about Y | $\begin{bmatrix} 0 & -i \\ i & 0 \end{bmatrix}$ |
| $Z$ | phase flip on $\ket{1}$ — half-turn about Z | $\begin{bmatrix} 1 & 0 \\ 0 & -1 \end{bmatrix}$ |
| $H$ | swaps the Z and X axes; makes $\ket{0}\to\ket{+}$ | $\tfrac{1}{\sqrt{2}}\begin{bmatrix} 1 & 1 \\ 1 & -1 \end{bmatrix}$ |
| $S$ | quarter-turn about Z ($\pi/2$ phase on $\ket{1}$) | $\begin{bmatrix} 1 & 0 \\ 0 & i \end{bmatrix}$ |
| $T$ | eighth-turn about Z ($\pi/4$ phase on $\ket{1}$) | $\begin{bmatrix} 1 & 0 \\ 0 & e^{i\pi/4} \end{bmatrix}$ |

The deep fact hiding here: every single-qubit gate factors as
$U = R_z(\alpha)\,R_y(\beta)\,R_z(\gamma)$ up to global phase. Three rotations reach anywhere
on the sphere — which is why those few gates are enough.

The phase gates $S$ and $Z$ in that table look inert — apply one and neither probability bar
moves. On the sphere they are anything but: each swings the arrow around the vertical axis.
Prove it twice. First, reach $\ket{i} = (\ket{0} + i\ket{1})/\sqrt{2}$ — the state $S$ makes
from $\ket{+}$, a quarter of the way around the equator:

```qblochtarget
{
  "id": "found-bloch-i-1",
  "prompt": "Drive the Bloch vector to |i⟩ = (|0⟩ + i|1⟩)/√2 — the state S makes from |+⟩.",
  "target": { "program": "H 0\nS 0" },
  "toleranceDeg": 5,
  "hint": "Probabilities pin only θ: |i⟩ still splits 50/50, so θ = π/2. The i is a relative phase — swing φ to π/2, a quarter turn around the equator."
}
```

Now from memory — no marker to chase. $\ket{-} = (\ket{0} - \ket{1})/\sqrt{2}$ is what $Z$
makes of $\ket{+}$: the same 50/50 split, the opposite relative phase. Place it:

```qblochtarget
{
  "id": "found-bloch-minus-1",
  "prompt": "From memory: place |−⟩ = (|0⟩ − |1⟩)/√2 — the state Z makes from |+⟩.",
  "target": { "program": "H 0\nZ 0" },
  "toleranceDeg": 5,
  "blind": true,
  "hint": "A minus sign on |1⟩ is a relative phase of e^{iπ}: the equator again (θ = π/2), but half-way around — φ = π."
}
```

## The circuit model

Strung together, gates form a **circuit**, and the rules of the game are simple enough to state
in three lines:

1. Start every qubit in $\ket{0}$.
2. Apply a sequence of gates.
3. Measure some or all of the qubits.

Circuits read left to right in time. Gates acting on different qubits at the same step run in
parallel, which gives two independent sizes: **depth** (how many steps, i.e. time) and
**width** (how many qubits). The whole craft of quantum programming is doing more with less of
both.

In code, this is the Amazon Braket SDK, and it reads almost exactly like the three rules:

```python
from braket.circuits import Circuit
from braket.devices import LocalSimulator

# Build a circuit: a Hadamard on q0, then a CNOT controlled by q0.
circuit = Circuit().h(0).cnot(0, 1)

# Run it on the free local simulator.
device = LocalSimulator()
result = device.run(circuit, shots=1000).result()

# Collect measurement statistics.
counts = result.measurement_counts
```

Run that exact circuit in your browser — no install required. The printed vector is the four
amplitudes of $\ket{00}, \ket{01}, \ket{10}, \ket{11}$; you should see weight only on
$\ket{00}$ and $\ket{11}$:

```runnable
from braket.circuits import Circuit

# Entangle two qubits: a Hadamard on q0, then a CNOT controlled by q0.
circuit = Circuit().h(0).cnot(0, 1)

# Inspect the resulting state vector (amplitudes of |00>, |01>, |10>, |11>).
print(circuit.state_vector())
```

That two-line circuit is the climax of this whole module. Let's earn it.

## Two qubits, and the gates that bind them

Two qubits live in a four-dimensional space with basis $\ket{00}, \ket{01}, \ket{10},
\ket{11}$. Single-qubit gates still act on one wire at a time — but the interesting gates
**condition one qubit on another.**

The workhorse is **CNOT** (controlled-NOT): it flips the target qubit if and only if the
control is $\ket{1}$.

$$
\text{CNOT}\ket{00}=\ket{00},\quad \text{CNOT}\ket{01}=\ket{01},\quad \text{CNOT}\ket{10}=\ket{11},\quad \text{CNOT}\ket{11}=\ket{10}
$$

CNOT together with the single-qubit gates is **universal** — that pair can approximate any
quantum computation at all. A few cousins round out the toolkit:

- **CZ** applies a $Z$ to the target when the control is $\ket{1}$; it is symmetric, so either
  qubit can be called the control.
- **SWAP** exchanges two qubits, and decomposes into three CNOTs.
- **Toffoli (CCNOT)** flips its target only when *both* controls are $\ket{1}$ — enough to do
  any classical logic reversibly.

Watch CNOT do something a classical wire cannot. On its own, CNOT just copies a definite bit —
but feed it a control that is already in superposition and the two qubits fuse. Here is the
control after a Hadamard, the moment before the CNOT:

```qsim
qubits 2
H 0
```

The control is half $\ket{0}$ and half $\ket{1}$ at once. So when CNOT "flips the target if the
control is 1," it does both at once — and that is where entanglement comes from.

## Entanglement

Apply that CNOT. The result is the **Bell state**:

$$
\ket{\Phi^+} = \tfrac{1}{\sqrt{2}}\big(\ket{00} + \ket{11}\big).
$$

Step through the construction one gate at a time — $H$ on qubit 0, then CNOT(0,1) — and watch
the two-qubit amplitudes go from a single spike to two:

```qscrub
qubits 2
H 0
CNOT 0 1
```

Look hard at $\ket{\Phi^+}$: there is **no way** to write it as (something for qubit 0) $\otimes$
(something for qubit 1). The qubits no longer have individual states — only the pair does. That
is the definition of **entanglement**: a correlation with no classical analogue.

```qcard
{"id":"found-entanglement-1","prompt":"What makes the Bell state `|Φ+⟩ = (|00⟩ + |11⟩)/√2` entangled rather than a product of two single-qubit states?","answer":"There is no way to write it as (something for qubit 0) tensor (something for qubit 1); the qubits have no individual states, only the pair does. That correlation with no classical analogue is entanglement."}
```

Here is the spooky part, made undeniable. Measure qubit 0 of a Bell pair and you instantly know
qubit 1, every time, no matter how far apart they are. Measure the two panels below many times:
the entangled circuit yields only `00` and `11` (perfect correlation), while a mere product of
two superpositions — the same gates, no CNOT — scatters across all four outcomes (total
independence):

```qcorr
{
  "prompt": "Measure both qubits many times. In which circuit does qubit 1's outcome track qubit 0's, and in which is it independent?",
  "entangled": "H 0\nCNOT 0 1",
  "product": "H 0\nH 1"
}
```

Predict before you run. You have seen the recipe and the correlation — now commit to an answer *before* the simulator reveals it: which measurement outcomes can the entangling circuit actually produce?

```qpredict
{
  "id": "found-bell-reachable-1",
  "prompt": "Which basis states can the Bell circuit (H 0; CNOT 0 1) produce on measurement? Commit your prediction, then reveal the simulation.",
  "program": "H 0\nCNOT 0 1",
  "mode": "nonzero-states",
  "hint": "The Hadamard superposes qubit 0; the CNOT ties qubit 1 to it — the two qubits always agree, so the odd-parity outcomes never appear."
}
```

The four maximally-entangled two-qubit states — the **Bell basis** — are
$\ket{\Phi^\pm} = \tfrac{1}{\sqrt{2}}(\ket{00}\pm\ket{11})$ and
$\ket{\Psi^\pm} = \tfrac{1}{\sqrt{2}}(\ket{01}\pm\ket{10})$. They are the raw fuel of quantum
teleportation and superdense coding. The pattern scales: the $n$-qubit **GHZ state**
$\tfrac{1}{\sqrt{2}}(\ket{0\dots0} + \ket{1\dots1})$ is entangled so totally that measuring any
one qubit collapses them all.

Now you build it. Write the circuit, press Check, and your state is graded in your browser
against $\ket{\Phi^+}$ (up to global phase). You already saw the recipe — superpose, then
control a flip:

```qchallenge
{
  "prompt": "Prepare the Bell state |Φ+⟩ = (|00⟩ + |11⟩)/√2 on two qubits.",
  "qubits": 2,
  "target": { "program": "H 0\nCNOT 0 1" },
  "starter": "H 0",
  "allowedGates": ["H", "X", "CNOT"],
  "hint": "Put qubit 0 into superposition with H, then let it control a flip of qubit 1 with CNOT."
}
```

## Check yourself

Five questions that tie the module together. Try each before revealing the hint or answer.

```quiz
{
  "questions": [
    {
      "q": "You prepare `|+>` and take 1,000 shots. Roughly how many `0` outcomes do you expect, and why is it never exactly 500?",
      "hint": "The Born rule fixes the true probability at 0.5; a finite sample fluctuates around the mean by an amount that grows like the square root of the shot count, not the count itself.",
      "a": "About 500, give or take ~16 (shot noise scales like √(Npq) ≈ √250). You only hit the exact 50/50 in the limit of infinitely many shots."
    },
    {
      "q": "Which axis does `RY(θ)` rotate the Bloch vector about, and what state is `RY(π)|0>`?",
      "hint": "The name says the axis. A π rotation is a half-turn, which sends the north pole to the opposite pole.",
      "a": "About the Y-axis. `RY(π)|0> = |1>` (up to global phase) — a half-turn from north pole to south pole."
    },
    {
      "q": "Do `|+>` and `e^{iπ/4}|+>` produce different measurement statistics?",
      "hint": "One of these differs from the other only by an overall (global) phase. Does the Born rule's squared magnitude remember a global phase?",
      "a": "No. A global phase is physically invisible — `|e^{iπ/4}|² = 1`, so every outcome probability is identical. Only relative phase between `|0>` and `|1>` is observable."
    },
    {
      "q": "Starting from `|00>`, you apply `H` to qubit 0 then `CNOT(0,1)`. What state results, and is it entangled?",
      "hint": "H makes qubit 0 a 50/50 superposition; CNOT then flips qubit 1 in the half of the superposition where qubit 0 is 1. Try to factor the result into (qubit 0 part) ⊗ (qubit 1 part).",
      "a": "`(|00> + |11>)/√2`, the Bell state `|Φ+⟩`. It is entangled — there is no way to write it as a product of two single-qubit states."
    },
    {
      "q": "You share a Bell pair `|Φ+⟩` with a friend across the galaxy, measure your qubit, and get `1`. What will your friend's qubit give?",
      "hint": "`|Φ+⟩` has weight only on `|00>` and `|11>`. Given your outcome, which joint outcomes are still possible?",
      "a": "`1`, with certainty. The outcomes are perfectly correlated — though note this transmits no usable message faster than light, since your own result was random."
    }
  ]
}
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

## Where this goes next

You can now describe a qubit, drive it with gates, measure it honestly, and entangle a pair —
the full vocabulary of the circuit model. So far every circuit has run on a perfect simulator.
The next module, **`02-hardware`**, leaves the ideal world: real QPUs on Amazon Braket, the
noise that corrupts them, the managed simulators that stand in for them, and the cost of every
shot. The Bell pair you just built is exactly the circuit hardware engineers run first to ask a
real machine: *are you entangling at all?*

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
