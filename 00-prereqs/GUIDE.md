# Prerequisites: From Zero to Ready-for-Quantum

This is the on-ramp module. If you have **no quantum background**, start here. By the end
of this module you will have the math, code, and intuition you need to start
[01-foundations](../01-foundations/GUIDE.md) without getting lost in notation.

If you already feel comfortable with complex numbers, vectors, matrices, NumPy, basic
probability, and the idea of a qubit as a unit vector in C^2, you can skip to
[01-foundations](../01-foundations/GUIDE.md). The placement quiz at the bottom of this
GUIDE will tell you for sure.

## Learning Objectives

After completing this section, you will be able to:

- Use Python and NumPy to manipulate vectors, matrices, and complex numbers fluently
- Read and write Dirac (bra-ket) notation and translate it to NumPy code on sight
- Explain in plain English what a qubit is, what superposition is, and what measurement does
- Compute inner products, tensor products, and decide whether a matrix is unitary
- Reason about probabilities, sampling, and the Born rule before any quantum machinery is introduced
- Visualize single-qubit states on the Bloch sphere and predict measurement outcomes

## Prerequisites for this prerequisites module

- High-school algebra
- Comfort running Python (you do not need to be an expert)
- A laptop that can run `pip install numpy matplotlib jupyterlab`

**You do NOT need:** AWS credentials, an AWS account, Docker, or any quantum SDK to
complete this module. Everything runs locally in NumPy.

## How this module is different from the rest of the curriculum

The rest of the repo assumes you can read `|psi> = alpha|0> + beta|1>` and know what
"unitary" means. This module assumes you cannot, and teaches both. Every formal symbol is
introduced in plain English first, then translated into NumPy code, and only then written
in mathematical notation.

Every notebook follows the same shape:

1. **Plain English** — the idea, no math
2. **Code first** — the idea in NumPy
3. **Notation** — the formal symbols, mapped one-to-one back to the code
4. **Self-check** — three short exercises with answers in the companion solution cells

---

## Setup (90 seconds, no AWS)

From the repo root:

```bash
python -m venv .venv
source .venv/bin/activate    # on Windows: .venv\Scripts\activate
pip install numpy matplotlib jupyterlab ipywidgets
jupyter lab 00-prereqs/notebooks
```

That is the whole setup. No `make setup`, no AWS credentials, no IAM roles. Those come
later in `02-hardware`.

---

## Concepts

This module covers six tightly scoped topics. Each maps to one notebook.

### 1. Python and NumPy warm-up

The whole quantum stack is built on linear algebra, and the whole linear algebra stack
in this repo is built on NumPy. Before we touch a single qubit you need to be able to:

- Create vectors and matrices with `np.array`
- Multiply them with `@`
- Take dot products, norms, conjugates, and transposes
- Build block matrices and tensor (Kronecker) products with `np.kron`
- Work with complex numbers using Python's built-in `1j`

If those names already feel routine, skim the first notebook and move on.

### 2. Linear algebra for quantum

You need a working memory of five things:

- **Vectors** — ordered lists of complex numbers. A qubit state is a 2-vector. An n-qubit
  state is a 2^n-vector.
- **Inner product** `<a|b>` — measures overlap between two states. Zero means orthogonal.
- **Norm** — the length of a vector. Quantum states always have norm 1.
- **Unitary matrix** — a matrix `U` such that `U† U = I`. Unitary matrices preserve norm,
  which is why every quantum gate is unitary.
- **Tensor product** `⊗` — how you build multi-qubit states out of single-qubit ones.

```qcard
{"id":"prereq-unitary-1","prompt":"What condition must a matrix `U` satisfy to be unitary, and why does every quantum gate have to be one?","answer":"It must satisfy `U† U = I` (the conjugate transpose times the matrix equals the identity). Unitary matrices preserve norm, and since quantum states always have norm 1, every gate must be unitary to keep that true."}
```

You do NOT need eigenvalues, determinants, or rank for this module. They show up later
in `03-algorithms` and we will introduce them there.

### 3. Probability and measurement (no quantum yet)

Quantum measurement is probabilistic. Before you can understand the Born rule you need to
be fluent in classical probability:

- A probability distribution assigns non-negative numbers summing to 1 across outcomes
- "Sampling" means drawing a random outcome according to that distribution
- The empirical distribution from N samples converges to the true distribution as N grows
- An **expectation value** is a weighted average over a distribution

We will simulate weighted coin flips in NumPy until this feels obvious. Then in the next
notebook we will reinterpret quantum measurement as nothing more than sampling from a
distribution computed from a state vector.

Here is that reinterpretation in miniature, one section early. The observable `Z` is just a
scoring rule: outcome `0` scores `+1`, outcome `1` scores `-1`, and the expectation value is
the weighted average of those scores. A qubit nobody has touched gives outcome `0` every
single time — so this average takes no computing at all. Commit to it:

```qexpect
{
  "id": "prereq-expect-certain-1",
  "prompt": "A fresh qubit starts in |0⟩ and nothing touches it (the circuit applies only the identity). The observable Z scores outcome 0 as +1 and outcome 1 as −1. What is the expectation value ⟨Z⟩?",
  "program": "I 0",
  "observable": "Z 0",
  "hint": "An expectation value is a weighted average: (+1)·P(0) + (−1)·P(1). Here the distribution is certain — P(0) = 1, P(1) = 0 — so the average equals the only score ever produced. Certainty is the one case where the long-run average and a single sample agree."
}
```

### 4. What is a qubit, in words

Most introductions jump straight to `|psi> = alpha|0> + beta|1>` and lose people. We will
not. The progression is:

1. A classical bit is a coin lying flat: heads or tails.
2. A qubit is a coin that has been **spun**: it has a direction it is leaning, but you
   only ever see heads or tails when you stop it (measure).
3. The "direction it is leaning" is captured by two complex numbers `(alpha, beta)`.
4. The probability of seeing heads when you stop the spin is `|alpha|^2`.

```qcard
{"id":"prereq-born-rule-1","prompt":"For a qubit state with amplitudes `(alpha, beta)`, what is the probability of measuring heads (the `|0>` outcome)?","answer":"It is `|alpha|^2`, the squared magnitude of the first amplitude."}
```

That is it. The rest of the module builds the math machinery to make this precise. The
intuition stays the same all the way to the end of the curriculum.

One move is available before any spinning, and classical intuition already covers it: the
gate `X` flips the coin over without spinning it — heads-up becomes tails-up, `|0>` becomes
`|1>`. Predict what stopping the coin reads:

```qpredict
{
  "id": "prereq-predict-flip-1",
  "prompt": "A qubit starts as the coin lying heads-up: |0⟩. The gate X flips it over without spinning it. Which outcome does measurement read?",
  "program": "X 0",
  "mode": "top-outcome",
  "hint": "X swaps the two amplitudes: (1, 0) becomes (0, 1). All the probability now sits on the |1⟩ outcome — no randomness involved, because a flipped coin is still a definite coin."
}
```

Reading someone else's flip is one thing; writing it is another. This is your first circuit
— one gate, one line:

```qchallenge
{
  "id": "prereq-challenge-flip-1",
  "prompt": "Prepare |1⟩ — the coin lying tails-up — starting from |0⟩.",
  "qubits": 1,
  "target": { "program": "X 0" },
  "allowedGates": ["X"],
  "hint": "You only have the flip. A single X turns the amplitudes (1, 0) into (0, 1), which is exactly |1⟩ — one line is enough."
}
```

Watch the spin happen. Below, qubit 0 starts as the coin lying flat — `|0>`, heads-up with
certainty. Apply a Hadamard (`H`) and it becomes the perfectly balanced spin `|+>`: stop it
now and the bars say heads or tails with equal odds. This is the whole story of section 4 in
one gate — read the probabilities for yourself.

```qsim
qubits 1
H 0
```

The simulator just handed you the bars. Now own the claim yourself — commit to a graded
prediction of which faces a spun coin can actually land on:

```qpredict
{
  "id": "prereq-predict-spun-coin-1",
  "prompt": "Spin the coin: apply H to a qubit starting in |0⟩. Which measurement outcomes have nonzero probability?",
  "program": "H 0",
  "mode": "nonzero-states",
  "hint": "H turns the amplitudes (1, 0) into (1/√2, 1/√2). Both amplitudes are nonzero, so both outcomes can happen — each with probability |1/√2|² = 1/2. A spun coin can land either way."
}
```

### 5. Dirac notation, decoded

Dirac notation is just compact NumPy. We will build a one-to-one translation table:

| Dirac | NumPy | Plain English |
|---|---|---|
| `|0>` | `np.array([1, 0])` | The "zero" state |
| `|1>` | `np.array([0, 1])` | The "one" state |
| `<psi|` | `psi.conj()` (as a row) | The "bra" — the conjugate-transpose of a ket |
| `<a|b>` | `a.conj() @ b` | Inner product (a complex number) |
| `|a><b|` | `np.outer(a, b.conj())` | Outer product (a matrix) |
| `|a> ⊗ |b>` | `np.kron(a, b)` | Tensor product (a longer vector) |
| `U|psi>` | `U @ psi` | Apply a gate |

```qcard
{"id":"prereq-inner-product-1","prompt":"In Dirac-to-NumPy translation, how do you write the inner product `<a|b>`, and what kind of object does it produce?","answer":"Write it as `a.conj() @ b`, which produces a single complex number."}
```

One sandwich built from that table deserves special billing: `<psi|Z|psi>` — bra, matrix,
ket — is how every expectation value in quantum mechanics is written, and it is nothing but
`psi.conj() @ Z @ psi`. Evaluate it for the flipped coin:

```qexpect
{
  "id": "prereq-expect-sandwich-1",
  "prompt": "Evaluate the sandwich ⟨ψ|Z|ψ⟩ for |ψ⟩ = |1⟩, prepared by applying X to |0⟩. Z scores outcome 0 as +1 and outcome 1 as −1. What is the expectation value?",
  "program": "X 0",
  "observable": "Z 0",
  "hint": "In NumPy this is psi.conj() @ Z @ psi with psi = [0, 1]. Z flips the sign of the |1⟩ amplitude, so Z|ψ⟩ = −|ψ⟩ and the inner product gives −1 — the mirror image of ⟨0|Z|0⟩ = +1. Both are certainties, sitting at opposite ends of the scale."
}
```

By the end of this notebook you will read `<0|H|+>` and immediately reach for
`zero.conj() @ H @ plus` without thinking.

That expression is worth a prediction of its own. `<0|H|+> = 1` says that applying `H` to
`|+>` lands exactly on `|0>` — overlap one, certainty. Run the two-gate sequence in your
head, then commit:

```qpredict
{
  "id": "prereq-predict-double-h-1",
  "prompt": "Apply H twice in a row to a qubit starting in |0⟩. Which single outcome does measurement read?",
  "program": "H 0\nH 0",
  "mode": "top-outcome",
  "hint": "The first H makes |+⟩ = (|0⟩ + |1⟩)/√2; the second sends |+⟩ straight back to |0⟩ — that is exactly what ⟨0|H|+⟩ = 1 says. H is its own inverse, so the result is outcome 0 with certainty, not a second 50/50 spin."
}
```

### 6. Bloch-sphere playground

The Bloch sphere is the standard mental model for a single qubit. We will make it
interactive: drag `theta` and `phi` sliders, watch the state update, watch the predicted
measurement probabilities update, and run a virtual experiment to confirm.

This notebook is where intuition consolidates. If you walk away believing that

- the north pole is `|0>`
- the south pole is `|1>`
- the equator is "maximum superposition"
- rotations on the sphere are exactly what gates do

```qcard
{"id":"prereq-bloch-poles-1","prompt":"On the Bloch sphere, which single-qubit states sit at the north pole, the south pole, and the equator?","answer":"The north pole is `|0>`, the south pole is `|1>`, and the equator represents maximum superposition."}
```

Prove the second of those poles to yourself. On the sphere, the flip gate `X` is a
half-turn that carries the north pole to the south pole. Drive the vector there and check
your placement:

```qblochtarget
{
  "id": "prereq-bloch-south-1",
  "prompt": "Drive the Bloch vector to the south pole — |1⟩, the state X prepares from |0⟩.",
  "target": { "program": "X 0" },
  "toleranceDeg": 5,
  "hint": "The polar angle θ measures how far the arrow has tilted away from |0⟩ at the north pole. The south pole is all the way down: θ = π — and φ does not matter, because every meridian meets at a pole."
}
```

Drag $\theta$ below and watch the Bloch vector swing from the north pole ($\ket{0}$) toward the equator — this is exactly what $R_y(\theta)$ does. Drag the sphere itself to rotate your view, or press play to sweep the rotation:

```qscrub
qubits 1
RY 0 theta
```

Stop that sweep at $\theta = \pi/2$ and the arrow rests on the equator — the exact state
the Hadamard produced back in section 4. Land on it precisely:

```qblochtarget
{
  "id": "prereq-bloch-equator-1",
  "prompt": "Drive the Bloch vector to |+⟩ = (|0⟩ + |1⟩)/√2 — the equator point where the spun coin from section 4 lives.",
  "target": { "program": "H 0" },
  "toleranceDeg": 5,
  "hint": "Maximum superposition means equal odds, which pins the arrow to the equator: θ = π/2. The plus sign picks the meridian: φ = 0, pointing along the +X axis."
}
```

Gates do not have to go all the way to a pole or the equator — any tilt of the arrow is a
legal state. Dial a partial rotation:

```qblochtarget
{
  "id": "prereq-bloch-angle-1",
  "prompt": "Place the state RY(π/3) prepares from |0⟩: one third of the way to the south pole, where P(0) = 3/4.",
  "target": { "program": "RY 0 1.0472" },
  "toleranceDeg": 5,
  "hint": "RY(θ) tilts the arrow θ radians away from the north pole in the φ = 0 plane, so set θ = π/3 and leave φ = 0. Mind the halving trap: P(0) = cos²(θ/2) = cos²(π/6) = 3/4, not cos²(π/3)."
}
```

…then you are ready for `01-foundations`.

Here is the handoff. Everything in this module taught you to **describe** a qubit: to write
its state, read off its probabilities, and find it on the sphere. `01-foundations` hands you
the **verbs** — how to *act* on that state with gates, *combine* two qubits into one
inseparable whole, and *read* the answer back out as a measurement. Same spun coin you met
here, now set in motion.

One capstone before you go. The Placement Quiz below asks why `|+>` and `|->` measure
identically; here you build the `|->` half of that pair. The starter spins the coin the
plain way and lands on `|+>` — your job is to work the minus sign in:

```qchallenge
{
  "id": "prereq-challenge-minus-1",
  "prompt": "Prepare |−⟩ = (|0⟩ − |1⟩)/√2 — the spun coin whose minus sign measurement alone cannot see. The starter lands on |+⟩; fix it.",
  "qubits": 1,
  "target": { "program": "X 0\nH 0" },
  "starter": "H 0",
  "allowedGates": ["X", "H"],
  "hint": "Order matters: adding X after H gets you nowhere, because X leaves |+⟩ unchanged. Flip first, then spin — H applied to |1⟩ puts the minus sign on the |1⟩ amplitude: (|0⟩ − |1⟩)/√2."
}
```

---

## Hands-On Exercises

Complete these notebooks in order. Each takes 20-40 minutes.

1. **`notebooks/01-python-numpy-warmup.ipynb`** — Vectors, matrices, complex numbers,
   `np.dot`, `np.kron`, `@`. All in NumPy, no quantum yet.

2. **`notebooks/02-linear-algebra-for-quantum.ipynb`** — Inner products, norms,
   conjugate transpose, unitarity check, tensor products. Verify properties numerically.

3. **`notebooks/03-probability-and-measurement.ipynb`** — Probability distributions,
   sampling, expectation values, law of large numbers. The Born rule is teased at the end.

4. **`notebooks/04-what-is-a-qubit.ipynb`** — The spinning-coin metaphor, then the
   formal definition. Build `|0>`, `|1>`, `|+>`, `|->` as NumPy arrays. Compute their
   measurement probabilities by hand.

5. **`notebooks/05-dirac-notation-decoded.ipynb`** — The full Dirac-to-NumPy translation
   table, with every line of notation cross-validated by code. Includes a "Rosetta stone"
   reference card at the end.

6. **`notebooks/06-bloch-sphere-playground.ipynb`** — Interactive Bloch sphere. Sliders
   for `theta` and `phi`, live probability bars, virtual-experiment simulator.

**Scripts:**

- `scripts/check_prereqs.py` — Run from terminal: `python 00-prereqs/scripts/check_prereqs.py`
  to verify your environment has NumPy, Matplotlib, JupyterLab, and ipywidgets installed,
  and that you are on Python 3.10 or newer.

---

## Self-Assessment

When you finish, you should be able to answer all ten questions in the
**Placement Quiz** at the end of this GUIDE without looking anything up. If three or
more give you trouble, replay the corresponding notebooks before starting
`01-foundations`.

A short list of what "ready" looks like:

- You can write a 2x2 unitary matrix in NumPy and verify `U† U = I` in two lines
- You can compute the probability of measuring `|0>` from a state vector in your head
  (it is `|alpha|^2` where `alpha` is the first amplitude)
- You can translate `<0|H|+>` into NumPy without pausing
- You can explain in one sentence why measurement is probabilistic
- You can draw `|+>` on a Bloch sphere

If those feel routine, move on to [01-foundations](../01-foundations/GUIDE.md).

---

## References

### Visual and intuition-first

- [Quantum Country](https://quantum.country/qcvc) — Andy Matuschak and Michael Nielsen's
  spaced-repetition essay. The single best zero-to-quantum web resource.
- [3Blue1Brown — Essence of Linear Algebra](https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab) — Visual linear algebra. Watch episodes 1-9 before notebook 02.
- [Bloch Sphere Visualization](https://www.youtube.com/watch?v=vUVkS1XZVCg) — Looking Glass Universe, 12 min, intuitive Bloch-sphere explanation.

### Math foundations

- [Khan Academy — Linear Algebra](https://www.khanacademy.org/math/linear-algebra) — Free, paced, with practice problems. Vectors and matrices sections are enough.
- [Khan Academy — Probability](https://www.khanacademy.org/math/statistics-probability/probability-library) — Distributions, expected value, sampling.

### Going further (after this module)

- [Qiskit Textbook: Linear Algebra](https://learning.quantum.ibm.com/course/basics-of-quantum-information/single-systems) — Interactive companion, covers the same material with quantum framing.
- [Nielsen & Chuang, Chapter 2](https://www.cambridge.org/highereducation/books/quantum-computation-and-quantum-information/01E10196D0A682A6AEFFEA52D53BE9AE) — The canonical reference. Read after this module, not before.

---

## Placement Quiz

Ten short questions. If you can answer at least seven without looking anything up, you
are ready for `01-foundations`. Stuck on one? Reveal a hint. Want to check yourself? Show
the answer under each question — but try first.

```quiz
{
  "questions": [
    {
      "q": "In NumPy, what is the difference between `M @ v` and `M * v`?",
      "hint": "Think about shapes. One of these follows the rows-times-columns rule of linear algebra and raises an error when the dimensions do not line up; the other just pairs entries position-by-position and broadcasts. Which is which?",
      "a": "`@` is matrix multiplication; `*` is elementwise multiplication."
    },
    {
      "q": "Write the NumPy expression for the conjugate transpose of a complex matrix `M`.",
      "hint": "It is two operations bolted together. One method flips the sign of the imaginary parts; one attribute swaps rows and columns. Chain them.",
      "a": "`M.conj().T`."
    },
    {
      "q": "What property must a matrix `U` satisfy to be called unitary?",
      "hint": "A quantum gate must never change the length of a state vector. Write the equation that says exactly that, using the conjugate transpose (the dagger) and the identity matrix.",
      "a": "`U.conj().T @ U == I`, i.e. `U†U = I`."
    },
    {
      "q": "Given `psi = [1/sqrt(2), 1j/sqrt(2)]`, what are `P(0)` and `P(1)`?",
      "hint": "Born rule: a probability is the squared magnitude of an amplitude. The magnitude of a complex number does not care whether it is real or imaginary — `|1j/sqrt(2)|` is just `1/sqrt(2)`. Square each amplitude's magnitude.",
      "a": "Both `0.5`. The imaginary unit in the second amplitude has magnitude 1, so `|1j/sqrt(2)|^2 = 1/2`."
    },
    {
      "q": "Translate `<0|H|+>` into a one-line NumPy expression.",
      "hint": "Walk the symbols left to right and substitute each using the Dirac-to-NumPy table in section 5: a bra becomes a conjugated row vector, a gate stays a matrix in the middle, a ket is its column vector, and adjacency becomes `@`. Recall that `|+>` is the equal superposition of `|0>` and `|1>`.",
      "a": "`np.array([1,0]).conj() @ H @ ((np.array([1,0]) + np.array([0,1]))/np.sqrt(2))` — and it equals `1`."
    },
    {
      "q": "What is `np.kron([1, 0], [0, 1])` numerically, and which two-qubit state does it represent?",
      "hint": "The Kronecker product of two single-qubit kets builds a four-entry vector for the two-qubit system. Write out the four amplitudes, find which position holds the lone `1`, then read off the basis label using the order `|q0 q1>`.",
      "a": "`[0, 1, 0, 0]` — the state `|01>`."
    },
    {
      "q": "On the Bloch sphere, where does `|+>` live? Where does `|->` live?",
      "hint": "Both are equal superpositions, so they sit on the equator, not at the poles (the poles are `|0>` and `|1>`). They are antipodal to each other along the horizontal axis that carries the plus/minus sign.",
      "a": "`|+>` is on the positive X-axis of the equator; `|->` is on the negative X-axis."
    },
    {
      "q": "If a qubit has Bloch polar angle `theta = pi/3`, what is `P(0)`?",
      "hint": "For a Bloch state, `P(0) = cos^2(theta/2)`. Halve the angle first, so `theta/2 = pi/6`, then evaluate the cosine you already know.",
      "a": "`cos^2(pi/6) = 3/4`."
    },
    {
      "q": "Why do `|+>` and `|->` give the same computational-basis measurement distribution?",
      "hint": "Write both as `(|0> ± |1>)/sqrt(2)`; the only difference is the sign on the `|1>` amplitude. Now apply the Born rule — does squaring a magnitude remember that minus sign?",
      "a": "The Born rule only sees `|alpha|^2` and `|beta|^2`. The sign of `beta` does not survive squaring. To distinguish them you have to apply a gate (e.g. `H`) before measuring."
    },
    {
      "q": "State the Born rule in one sentence.",
      "hint": "It is the rule that turns amplitudes into probabilities. For `|psi> = alpha|0> + beta|1>`, give the probability of each outcome — and say whether it depends on the amplitude itself or on its squared magnitude.",
      "a": "Measuring `|psi> = alpha|0> + beta|1>` in the computational basis yields outcome `0` with probability `|alpha|^2` and outcome `1` with probability `|beta|^2`."
    }
  ]
}
```
