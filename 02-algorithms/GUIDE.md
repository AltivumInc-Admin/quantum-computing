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
