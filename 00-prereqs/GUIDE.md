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

### 4. What is a qubit, in words

Most introductions jump straight to `|psi> = alpha|0> + beta|1>` and lose people. We will
not. The progression is:

1. A classical bit is a coin lying flat: heads or tails.
2. A qubit is a coin that has been **spun**: it has a direction it is leaning, but you
   only ever see heads or tails when you stop it (measure).
3. The "direction it is leaning" is captured by two complex numbers `(alpha, beta)`.
4. The probability of seeing heads when you stop the spin is `|alpha|^2`.

That is it. The rest of the module builds the math machinery to make this precise. The
intuition stays the same all the way to the end of the curriculum.

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

By the end of this notebook you will read `<0|H|+>` and immediately reach for
`zero.conj() @ H @ plus` without thinking.

### 6. Bloch-sphere playground

The Bloch sphere is the standard mental model for a single qubit. We will make it
interactive: drag `theta` and `phi` sliders, watch the state update, watch the predicted
measurement probabilities update, and run a virtual experiment to confirm.

This notebook is where intuition consolidates. If you walk away believing that

- the north pole is `|0>`
- the south pole is `|1>`
- the equator is "maximum superposition"
- rotations on the sphere are exactly what gates do

Drag $\theta$ below and watch the Bloch vector swing from the north pole ($\ket{0}$) toward the equator — this is exactly what $R_y(\theta)$ does. Drag the sphere itself to rotate your view, or press play to sweep the rotation:

```qscrub
qubits 1
RY 0 theta
```

…then you are ready for `01-foundations`.

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
