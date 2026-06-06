# Quantum Chemistry & Biochemistry

## Learning Objectives

After completing this section, you will be able to:
- Construct molecular Hamiltonians using second quantization
- Map fermionic operators to qubit operators (Jordan-Wigner, Bravyi-Kitaev)
- Implement the Variational Quantum Eigensolver (VQE) for ground state estimation
- Design and compare ansatz circuits (UCCSD, hardware-efficient)
- Select active spaces to reduce qubit requirements for larger molecules
- Understand applications to drug discovery and materials science

## Prerequisites

- Completed: 00-foundations, 01-hardware, 02-algorithms (especially QPE and variational sections)
- Basic chemistry: atomic orbitals, molecular bonds, electron configuration
- Linear algebra: eigenvalue problems, Hermitian operators

---

## Concepts

### The Electronic Structure Problem

The central problem in computational chemistry: given a molecular geometry (nuclear positions), find the ground state energy and wavefunction of the electrons.

**Why it's hard classically:**
- The exact wavefunction lives in an exponentially large space (2^n for n spin-orbitals)
- Classical methods (DFT, CCSD(T)) use approximations that break down for strongly correlated systems
- Catalysis, drug binding, materials properties often involve strong correlation

**Why quantum computers help:**
- Quantum systems naturally represent exponential spaces
- A quantum state of n qubits can encode a wavefunction of n spin-orbitals
- Polynomial quantum resources for problems requiring exponential classical resources

### Second Quantization

Instead of tracking each electron's position, second quantization uses creation ($a_p^\dagger$) and annihilation ($a_p$) operators for each spin-orbital $p$:

- $a_p^\dagger\ket{0} = \ket{1_p}$ (create an electron in orbital p)
- $a_p\ket{1_p} = \ket{0}$ (remove an electron from orbital p)
- Anticommutation: $\{a_p, a_q^\dagger\} = \delta_{pq}$

The molecular Hamiltonian in second quantization:

$$
H = \sum_{pq} h_{pq}\, a_p^\dagger a_q + \frac{1}{2} \sum_{pqrs} h_{pqrs}\, a_p^\dagger a_q^\dagger a_s a_r
$$

where $h_{pq}$ (one-electron integrals) and $h_{pqrs}$ (two-electron integrals) are computed classically from the basis set and molecular geometry.

### Fermion-to-Qubit Mappings

Quantum computers use qubits, not fermions. We need a mapping that preserves the fermionic anticommutation relations.

**Jordan-Wigner Transformation:**
- Maps occupation of orbital $p$ to qubit $p$: $\ket{0}$ = unoccupied, $\ket{1}$ = occupied
- a_p^dagger -> (X_p - iY_p)/2 * Z_{p-1} * Z_{p-2} * ... * Z_0
- The Z-string encodes fermionic antisymmetry (parity of all lower orbitals)
- Pro: Intuitive mapping. Con: Non-local — operators on orbital p involve all lower qubits.

**Bravyi-Kitaev Transformation:**
- Encodes both occupation and parity information in each qubit
- Results in O(log n) weight operators instead of O(n)
- More efficient for certain circuits but less intuitive

**Parity Mapping:**
- Qubit p stores the parity of orbitals 0 through p
- Can reduce qubit count by 2 using symmetry (total electron number, spin)

**Practical choice:** Jordan-Wigner is standard for small molecules. Bravyi-Kitaev can reduce circuit depth for larger systems.

### Variational Quantum Eigensolver (VQE)

VQE is the primary algorithm for quantum chemistry on NISQ devices:

1. **Prepare trial state:** Apply parameterized ansatz U(theta)|0>
2. **Measure energy:** Compute <H> = sum_i c_i * <P_i> where P_i are Pauli terms in the qubit Hamiltonian
3. **Optimize:** Use a classical optimizer to minimize <H> by adjusting theta
4. **Converge:** The minimum of <H> approximates the ground state energy (variational principle guarantees E_VQE >= E_exact)

**The variational principle:** For any trial state |psi(theta)>:
<psi(theta)|H|psi(theta)> >= E_ground

This means VQE always gives an upper bound — we can only improve by finding better parameters.

**Measuring the Hamiltonian:**
The qubit Hamiltonian is a sum of Pauli strings (e.g., ZZII, XYZI, IIXX). Each term requires separate measurement in its eigenbasis. Grouping commuting terms reduces the number of distinct measurements needed.

### Ansatz Design

The ansatz (trial wavefunction circuit) determines VQE's quality:

**Unitary Coupled Cluster (UCC):**
- Inspired by classical coupled cluster theory
- UCCSD includes single and double excitations:
  U(theta) = exp(T - T^dagger) where T = T_1 + T_2
  T_1 = sum_{ia} t_ia * a_a^dagger * a_i (singles)
  T_2 = sum_{ijab} t_ijab * a_a^dagger * a_b^dagger * a_j * a_i (doubles)
- Chemically motivated — captures the right physics
- Con: Deep circuits (many CNOT gates), expensive on noisy hardware

**Hardware-Efficient Ansatz (HEA):**
- Layers of single-qubit rotations + entangling gates (CNOTs)
- Not chemically motivated — just explores the Hilbert space
- Pro: Short circuits, works on any hardware topology
- Con: Barren plateaus, may not converge to the right answer

A single hardware-efficient layer is just a rotation followed by an entangler. Drag $\theta$ to sweep the variational parameter and scrub to watch the two-qubit state evolve — VQE's classical optimizer searches exactly this landscape for the energy minimum:

```qscrub
qubits 2
RY 0 theta
CNOT 0 1
```

**ADAPT-VQE:**
- Grows the ansatz adaptively by selecting operators with the largest gradient
- Starts with empty circuit, adds one operator at a time
- Finds compact, problem-specific ansatze
- More circuit evaluations during optimization but shorter final circuits

### Basis Sets and Active Space

**Basis sets:** Approximate atomic orbitals with Gaussian functions
- STO-3G: Minimal basis (1 function per orbital). Quick but inaccurate.
- 6-31G: Split-valence. Better for properties.
- cc-pVDZ, cc-pVTZ: Correlation-consistent. Systematic improvement.

Larger basis = more orbitals = more qubits needed.

**Active space selection:**
For a molecule with many electrons, we can't put all orbitals on the quantum computer. Active space methods:
1. Run a classical calculation (Hartree-Fock) to get molecular orbitals
2. Select a subset of orbitals near the Fermi level (the "active space")
3. Treat active space with VQE, frozen core with classical approximation

Example: For a molecule with 20 electrons in 40 orbitals:
- Full: 80 qubits (40 spatial orbitals x 2 spin)
- Active space (4 electrons, 4 orbitals): 8 qubits — tractable on current hardware

### Applications to Drug Discovery and Biochemistry

**Molecular binding energies:** Calculate how strongly a drug candidate binds to a protein pocket. Requires accurate treatment of electron correlation at the binding interface.

**Reaction mechanisms:** Map energy along a reaction coordinate. Transition states often have strong multireference character — exactly where quantum computers can help.

**Materials design:** Predict properties of novel catalysts, battery materials, superconductors from first principles.

**Current limitations:** Today's quantum computers can handle molecules with ~10-20 qubits accurately. This covers small molecules (H2, LiH, BeH2, H2O) but not drug-sized molecules. The value is in developing methods that will scale to useful size as hardware improves.

---

## Hands-On Exercises

1. **`notebooks/01-molecular-hamiltonians.ipynb`** — Use OpenFermion + PySCF to compute the Hamiltonian for H2 and LiH. Examine the one- and two-electron integrals. Convert to qubit operators and count terms.

2. **`notebooks/02-fermion-qubit-mapping.ipynb`** — Apply Jordan-Wigner and Bravyi-Kitaev to the same Hamiltonian. Compare qubit operator weight (number of Pauli terms, max locality). Discuss trade-offs.

3. **`notebooks/03-vqe-h2.ipynb`** — Full VQE workflow for H2: build UCCSD ansatz, measure Hamiltonian terms, optimize with COBYLA. Plot energy vs. bond length (potential energy surface). Compare to exact diagonalization.

4. **`notebooks/04-vqe-lih.ipynb`** — Scale to LiH (more qubits). Use active space selection. Compare hardware-efficient vs. UCCSD ansatz. Analyze convergence and accuracy.

5. **`notebooks/05-ansatz-design.ipynb`** — Compare UCCSD, hardware-efficient, and ADAPT-VQE approaches on H2O (in active space). Measure circuit depth, CNOT count, and energy accuracy for each.

6. **`notebooks/06-active-space.ipynb`** — Demonstrate active space selection: full-space H2O would need 14 qubits, active space reduces to 4-8. Use PySCF CASCI to validate active space choice.

7. **`notebooks/07-excited-states.ipynb`** — Implement SSVQE (Subspace-Search VQE) to find the first excited state of H2. Compare to exact excited state energy.

8. **`notebooks/08-hybrid-chemistry-job.ipynb`** — Package VQE as a Braket Hybrid Job. Scan bond lengths in parallel. Use checkpointing for large parameter sweeps. Production chemistry workflow.

**Scripts:**
- `scripts/hamiltonians.py` — Molecular Hamiltonian construction pipeline (geometry -> integrals -> qubit operator)
- `scripts/ansatz.py` — Parameterized ansatz circuit builders (UCCSD, HEA, custom)
- `scripts/vqe_runner.py` — End-to-end VQE runner with energy vs. geometry scanning

---

## References

### AWS Documentation
- [VQE Chemistry example on Braket](https://github.com/amazon-braket/amazon-braket-examples/blob/main/examples/hybrid_quantum_algorithms/VQE_Chemistry/VQE_chemistry_braket.ipynb) — Official VQE notebook
- [Hybrid Jobs for chemistry](https://docs.aws.amazon.com/braket/latest/developerguide/braket-jobs.html) — Running VQE as a managed job with QPU priority
- [PennyLane quantum chemistry](https://pennylane.ai/qml/demos/tutorial_quantum_chemistry/) — PennyLane's chemistry module documentation

### Video Resources
- [Quantum Chemistry with VQE — IBM Qiskit](https://www.youtube.com/watch?v=Z-A6G0WVI9w) — Antonio Mezzacapo, 60 min, full VQE theory and implementation for chemistry
- [Simulating Molecules using Quantum Computers — Google AI](https://www.youtube.com/watch?v=w7398u8G588) — Ryan Babbush, 45 min, frontier of quantum chemistry simulation
- [Electronic Structure Problem — Qiskit Summer School](https://www.youtube.com/watch?v=fACEhn55XRA) — 90 min, from Schrodinger equation to qubit Hamiltonians
- [OpenFermion Tutorial](https://www.youtube.com/watch?v=fHBZ6JVoP7M) — Google Quantum AI, 40 min, using OpenFermion for molecular simulation
- [Active Space Methods — Quantum Computing for Chemistry](https://www.youtube.com/watch?v=Rf8h3pKXgio) — 35 min, how to select which orbitals to put on the quantum computer
- [Drug Discovery and Quantum Computing](https://www.youtube.com/watch?v=jTjz9PReryo) — Zapata Computing, 30 min, industry perspective on quantum chemistry for pharma

### Papers & Further Reading
- [Quantum computational chemistry (McArdle et al., 2020)](https://arxiv.org/abs/1808.10402) — Comprehensive review of quantum algorithms for chemistry
- [Hardware-efficient VQE (Kandala et al., 2017)](https://arxiv.org/abs/1704.05018) — First VQE on real hardware (IBM)
- [ADAPT-VQE (Grimsley et al., 2019)](https://arxiv.org/abs/1812.11173) — Adaptive ansatz construction
- [Quantum chemistry in the age of quantum computing (Cao et al., 2019)](https://arxiv.org/abs/1812.09976) — Broad review connecting chemistry to quantum algorithms
- [OpenFermion: The Electronic Structure Package for Quantum Computers](https://arxiv.org/abs/1710.07629) — OpenFermion paper and tutorial
- [Molecular Simulations with Quantum Computers: A book by Szabo and Ostlund](https://store.doverpublications.com/0486691861.html) — Classical reference for the quantum chemistry background
