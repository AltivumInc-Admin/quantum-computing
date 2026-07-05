# Quantum Algorithms

Three modules in, you can build circuits, you know what real hardware costs, and you can read a
measurement. Now the payoff: **where does quantum actually beat classical, and why?** The
answer, every time, is **interference**. A quantum algorithm is choreographed interference — you
arrange amplitudes so the wrong answers cancel and the right ones add up, then measure what's
left. This module walks that idea from its simplest demonstration to its most practical, running
each algorithm live in your browser.

```qcard
{"id":"algo-interference-core","prompt":"According to this module, what single mechanism explains every case where a quantum algorithm beats a classical one?","answer":"Interference: a quantum algorithm arranges amplitudes so the wrong answers cancel and the right ones add up, then measures what's left."}
```

> **You'll come away able to** explain the quantum speedup of oracle algorithms (Deutsch–Jozsa,
> Grover), build and read the Quantum Fourier Transform, understand phase estimation, and run
> QAOA for optimization. **You'll want first:** `01-foundations` (gates, entanglement,
> measurement) and a little linear algebra (eigenvalues, unitaries, tensor products). Everything
> here is a self-contained simulation — no AWS needed for the page.

---

## The shared trick: oracles and phase kickback

Most quantum algorithms query a black box — an **oracle** — that encodes the problem as a
reversible gate $U_f$. The trick that makes them fast: prepare a superposition over *all* inputs
with Hadamards, query the oracle *once* on that superposition, and let the answer ride home as a
**phase**. A phase oracle flips the sign of the amplitudes where $f(x)=1$:

$$
\ket{x} \;\longmapsto\; (-1)^{f(x)}\ket{x}.
$$

Signs are invisible to a single measurement — until you run the Hadamards again and the signs
**interfere**, concentrating probability onto the answer. That superpose → query → interfere
pattern is the whole game. Start it yourself: put both qubits into the equal superposition every
oracle algorithm opens with.

```qcard
{"id":"algo-phase-kickback-pattern","prompt":"What is the three-step pattern shared by oracle algorithms, and what does the phase oracle do to an input?","answer":"Superpose over all inputs with Hadamards, query the oracle once, then interfere by running the Hadamards again. A phase oracle maps `|x>` to `(-1)^f(x)|x>`, flipping the sign where `f(x)=1`."}
```

```qchallenge
{
  "prompt": "Put two qubits into an equal superposition over all four basis states (the H-on-all-qubits step that opens Deutsch–Jozsa).",
  "qubits": 2,
  "target": { "program": "H 0\nH 1" },
  "starter": "H 0",
  "allowedGates": ["H"],
  "hint": "A Hadamard on each qubit creates an equal superposition of |00⟩, |01⟩, |10⟩, and |11⟩."
}
```

The same opener, written by someone in a hurry — and it silently does *nothing*. The bug
hinges on the very fact Deutsch–Jozsa exploits below: $H$ is its own inverse, so the second
$H^{\otimes n}$ un-computes the first unless the oracle intervenes. Spot it and fix it:

```qdebug
{
  "id": "algo-debug-hh-1",
  "prompt": "This circuit was meant to spread two qubits over all four basis states, but every measurement returns 00 — as if no gate ran at all. Fix the circuit.",
  "qubits": 2,
  "broken": { "program": "H 0\nH 0" },
  "target": { "program": "H 0\nH 1" },
  "allowedGates": ["H"],
  "hint": "Count which qubit each H touches. Two Hadamards on the SAME qubit cancel (H² = I) — the second one un-computes the first, exactly the interference trick DJ uses on purpose."
}
```

## Deutsch–Jozsa: one query is enough

The cleanest proof that interference buys speedup. You're handed $f:\{0,1\}^n\to\{0,1\}$ promised
to be either **constant** (same output everywhere) or **balanced** (0 on half the inputs, 1 on
the other half). Classically, you might need $2^{n-1}+1$ queries to be sure. Quantum mechanically:
**exactly one.**

Apply $H^{\otimes n}$, the phase oracle, then $H^{\otimes n}$ again. The amplitude that lands back
on $\ket{0\dots0}$ is $\frac{1}{N}\sum_x (-1)^{f(x)}$ — which is $\pm 1$ for a constant function
(every term agrees) and exactly $0$ for a balanced one (the $+$ and $-$ terms cancel). So: measure
all-zeros ⇒ constant; measure anything else ⇒ balanced. Pick an oracle and watch the interference
decide:

```qdj
{"qubits": 3}
```

(Bernstein–Vazirani is the same trick aimed at a hidden bit-string $s$ where $f(x)=s\cdot x$: one
query recovers all $n$ bits of $s$ that a classical attacker would need $n$ queries to find.)

## Grover's search: amplitude amplification

Deutsch–Jozsa finishes in one shot. Grover's search shows what happens when you have to *repeat*
the interference. Given an oracle that marks one item out of $N=2^n$, classical search needs
$O(N)$ checks; Grover needs $O(\sqrt N)$ — a quadratic speedup that underlies countless other
algorithms.

Each **Grover iteration** is two reflections: the oracle flips the sign of the marked state, then
the **diffusion** operator reflects every amplitude about their mean. Geometrically that's a small
rotation of the whole state toward the marked item — so the marked amplitude climbs, step by step.
Step through it: the marked bar grows, success probability peaks near $\frac{\pi}{4}\sqrt N$
iterations, and — crucially — if you keep going, it **over-rotates** and falls back. Knowing when
to stop is part of the algorithm.

```qcard
{"id":"algo-grover-rotation","prompt":"Geometrically, what does one Grover iteration do, and what happens if you run too many iterations?","answer":"It composes two reflections (oracle then diffusion) into a small rotation of the state toward the marked item. Success probability peaks near `(pi/4)*sqrt(N)` iterations; past that it over-rotates and falls back, so knowing when to stop matters."}
```

```qgrover
{"qubits": 3, "marked": 5}
```

## The Quantum Fourier Transform: interference reads periodicity

The QFT is the quantum Discrete Fourier Transform, and it's how quantum computers *see structure*
in a state. It maps a basis state to an even spread of phases,

$$
\text{QFT}\ket{j} = \frac{1}{\sqrt{N}} \sum_{k=0}^{N-1} e^{2\pi i jk/N}\ket{k},
$$

built from Hadamards and controlled phase rotations in only $O(n^2)$ gates — exponentially fewer
than the classical FFT's $O(n\,2^n)$ on the amplitude vector. Its superpower is reading
**periodicity**: feed it a state that repeats with period $r$, and constructive interference
produces sharp spikes at multiples of $N/r$. The period falls right out. Watch a periodic comb
become a frequency comb:

```qft
{"qubits": 4, "input": "period:4"}
```

## Quantum Phase Estimation: reading an eigenphase

QPE is the QFT pointed at a different question: given a unitary $U$ with eigenvector $\ket{u}$ and
$U\ket{u}=e^{2\pi i\phi}\ket{u}$, estimate the phase $\phi$. You put $n$ ancilla qubits in
superposition, apply controlled-$U^{2^k}$ so each ancilla picks up a different power of the phase,
then run the **inverse QFT** to interfere those phases into a binary readout of $\phi$.

The classic check: estimate the phase of a $T$ gate (which adds a phase of $e^{i\pi/4}$, i.e.
$\phi=1/8$) and the ancillas read $0.001_2 = 1/8$. QPE is the engine of Shor's factoring algorithm
(find the period of modular exponentiation) and of quantum chemistry (measure molecular energy
eigenvalues) — exactly where `04-quantum-ml` and `05-quantum-chemistry` are headed.

## Variational algorithms and QAOA

Everything above assumes deep, exact circuits. On today's noisy hardware (recall `02-hardware`),
the practical workhorse is **variational**: a shallow parameterized circuit whose knobs a
*classical* optimizer tunes to minimize a cost. Quantum proposes; classical disposes; repeat.

**QAOA** (Quantum Approximate Optimization Algorithm) is the variational approach to combinatorial
optimization like **MaxCut** (split a graph's vertices into two sets to cut the most edges). One
layer alternates a **cost** unitary $e^{-i\gamma C}$ — which imprints the problem as phases — with a
**mixer** $e^{-i\beta\sum_q X_q}$ — which spreads amplitude so good assignments can grow. The two
angles $(\gamma,\beta)$ are what the classical optimizer searches. Drive them yourself over a
triangle and watch the expected cut move across the landscape toward the optimum:

```qcard
{"id":"algo-qaoa-angles","prompt":"In one QAOA layer, what do the cost unitary and the mixer each do, and which part is classical?","answer":"The cost unitary `e^(-i*gamma*C)` imprints the problem as phases; the mixer `e^(-i*beta*sum X_q)` spreads amplitude so good assignments can grow. A classical optimizer searches over the angles `(gamma, beta)`."}
```

```qoptim
{"edges": [[0, 1], [1, 2], [2, 0]]}
```

Common optimizers for that outer loop: **COBYLA** and **Nelder–Mead** (gradient-free, robust to
noise), **SPSA** (two evaluations per step), and **Adam** (gradient-based via the parameter-shift
rule).

## Amplitude estimation, and a check

**Amplitude estimation** generalizes Grover: instead of finding a marked item, it *estimates the
probability* of a "good" outcome, turning Grover's quadratic speedup into a quadratic speedup over
classical Monte Carlo ($O(1/\epsilon)$ queries vs $O(1/\epsilon^2)$ samples for precision
$\epsilon$). It's the basis of quantum approaches to option pricing and risk analysis.

```quiz
{
  "questions": [
    {
      "q": "Why does Deutsch–Jozsa need only ONE oracle query where a classical algorithm may need 2^(n-1)+1?",
      "hint": "Think about what the oracle is queried on, and what the final layer of Hadamards does to the resulting signs.",
      "a": "The oracle is queried once on a superposition of all 2^n inputs at once. The final Hadamards make the phase-kicked amplitudes interfere: the all-zeros amplitude is (1/N)·sum_x (-1)^f(x), which is ±1 for constant f and exactly 0 for balanced f. One query plus interference decides it."
    },
    {
      "q": "What does a single Grover iteration do to the state, geometrically?",
      "hint": "It is two reflections back to back. Two reflections compose into what kind of transformation?",
      "a": "It rotates the state vector by a fixed angle toward the marked state: the oracle reflects about the marked state, then diffusion reflects about the uniform superposition, and two reflections make a rotation. The marked amplitude grows until ~(π/4)√N iterations, then over-rotates."
    },
    {
      "q": "How does the QFT expose a hidden period r in a state?",
      "hint": "A periodic input has amplitude only on a comb of indices. Where do those terms interfere constructively in the output?",
      "a": "The QFT of a period-r comb interferes constructively only at output indices that are multiples of N/r, producing sharp spikes there and cancellation elsewhere. Reading the spike spacing recovers the period — the core of phase estimation and Shor's algorithm."
    },
    {
      "q": "In QAOA, what do the two angles γ and β control?",
      "hint": "One angle belongs to the cost unitary, the other to the mixer.",
      "a": "γ scales the cost unitary e^(-iγC), which imprints the optimization problem as phases; β scales the mixer RX(2β) on every qubit, which spreads amplitude between assignments. A classical optimizer tunes (γ, β) to maximize the expected cut."
    }
  ]
}
```

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

## Where this goes next

You now have the algorithmic toolkit: oracles and amplitude amplification, the Fourier transform
and phase estimation, and the variational loop. The next two modules specialize it. **`04-quantum-ml`**
builds variational circuits into machine-learning models — encodings, quantum kernels, and
variational classifiers — and **`05-quantum-chemistry`** turns phase estimation and the variational
method onto molecules, computing ground-state energies with VQE.

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
