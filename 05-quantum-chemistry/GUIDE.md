# Quantum Chemistry & Biochemistry

Every drug that works, every catalyst that speeds a reaction, every battery that holds a charge comes down to one calculation no classical computer can do exactly: where do the electrons go? Solve that and you can predict chemistry before you ever touch a beaker. This is the application people point to when they say quantum computers will change the world — and it is the one place where a real molecule, hydrogen, collapses neatly onto a single qubit you can watch find its own ground state.

## Learning Objectives

After completing this section, you will be able to:
- Construct molecular Hamiltonians using second quantization
- Map fermionic operators to qubit operators (Jordan-Wigner, Bravyi-Kitaev)
- Implement the Variational Quantum Eigensolver (VQE) for ground state estimation
- Design and compare ansatz circuits (UCCSD, hardware-efficient)
- Select active spaces to reduce qubit requirements for larger molecules
- Understand applications to drug discovery and materials science

## Prerequisites

- Completed: 01-foundations, 02-hardware, 03-algorithms (especially QPE and variational sections)
- Basic chemistry: atomic orbitals, molecular bonds, electron configuration
- Linear algebra: eigenvalue problems, Hermitian operators

---

## The Molecule Problem

Pin the nuclei of a molecule in place and one question decides everything that follows: what is the lowest energy the electrons can settle into, and what does that state look like? That ground-state energy is the molecule's stability. Track how it changes as you stretch a bond and you have a reaction. Compare it between a drug and its target and you have binding affinity. All of chemistry is, at bottom, a search for the bottom of an energy well.

The trouble is that the electrons refuse to be treated one at a time. They repel each other, so each electron's position depends on every other's — and the honest description of that dance is a wavefunction that lives in a space of dimension $2^n$ for $n$ spin-orbitals. Twenty orbitals is already a million-dimensional vector; a hundred is more numbers than there are atoms in the Earth.

Classical chemistry survives by approximating. Density functional theory and coupled cluster are extraordinary engineering, and for most molecules they are close enough. But they lean on the assumption that electrons are only weakly correlated — and that assumption shatters exactly where the interesting chemistry lives: bond-breaking transition states, transition-metal catalysts, the stretched bonds of an enzyme mid-reaction. These are *strongly correlated*, and there the approximations quietly fail.

A quantum computer offers a different bargain. A register of $n$ qubits *is* a $2^n$-dimensional state — the exponential space is not something it has to store, it is something it natively is. Encode a wavefunction of $n$ spin-orbitals into $n$ qubits and the representation cost stops being the problem. What remains is a much narrower question: how do we write a molecule down as something a quantum computer can hold, and how do we coax it toward its ground state?

```qcard
{"id":"chem-qubit-native-space","prompt":"Why is representing a molecular wavefunction cheaper on a quantum computer than on a classical one?","answer":"A register of `n` qubits *is* a `2^n`-dimensional state, so the exponentially large space is something the device natively is rather than something it has to store. Encoding `n` spin-orbitals into `n` qubits removes the representation-cost problem."}
```

## From Electrons to Operators

Tracking electrons by position is hopeless and, worse, redundant — electrons are identical, so labelling "electron 1 here, electron 2 there" double-counts reality. Second quantization throws the labels away and tracks *occupation* instead: for each spin-orbital, is there an electron in it or not?

```qcard
{"id":"chem-second-quantization-occupation","prompt":"What does second quantization track instead of electron positions, and why?","answer":"It tracks *occupation* — for each spin-orbital, whether an electron is in it or not. Positions are abandoned because electrons are identical, so labelling them double-counts reality."}
```

The bookkeeping is done by two operators per orbital $p$ — a creation operator $a_p^\dagger$ that drops an electron into orbital $p$, and an annihilation operator $a_p$ that removes one:

- $a_p^\dagger\ket{0} = \ket{1_p}$ — create an electron in orbital $p$
- $a_p\ket{1_p} = \ket{0}$ — remove it
- $\{a_p, a_q^\dagger\} = \delta_{pq}$ — the anticommutation relation that encodes the Pauli exclusion principle

In this language the entire molecular Hamiltonian — kinetic energy, electron-nucleus attraction, electron-electron repulsion — folds into one compact expression:

$$
H = \sum_{pq} h_{pq}\, a_p^\dagger a_q + \frac{1}{2} \sum_{pqrs} h_{pqrs}\, a_p^\dagger a_q^\dagger a_s a_r
$$

The numbers $h_{pq}$ (one-electron integrals) and $h_{pqrs}$ (two-electron integrals) are pure geometry and basis set — a classical computer grinds them out once from the nuclear positions. What is left is an operator built entirely from $a^\dagger$ and $a$. The only thing standing between this and a quantum circuit is that qubits do not speak fermion.

## Fermions Become Qubits

Qubits and fermions disagree on one crucial point. Swap two electrons and the wavefunction must flip sign — that antisymmetry is what keeps two electrons out of the same state. Qubits have no such rule; flipping qubit 3 is a purely local act that ignores qubits 0 through 2. A fermion-to-qubit mapping exists to smuggle the missing minus signs back in.

The **Jordan-Wigner transformation** is the most direct one. Occupation of orbital $p$ becomes the state of qubit $p$: $\ket{0}$ empty, $\ket{1}$ occupied. But a creation operator cannot be a bare local flip — it has to carry a *Z-string* trailing across every lower-index qubit:

$$
a_p^\dagger = \frac{X_p - i Y_p}{2}\; Z_{p-1} Z_{p-2} \cdots Z_0
$$

That chain of $Z$ operators is the antisymmetry made concrete: it reads the parity of every orbital below $p$ and stamps the right sign on the operation. Toggle the occupation below and watch the string light up:

```qcard
{"id":"chem-jw-z-string","prompt":"In the Jordan-Wigner transformation, what is the role of the trailing Z-string on a creation operator?","answer":"The chain of `Z` operators is fermionic antisymmetry made concrete: it reads the parity of every orbital below `p` and stamps the correct sign on the operation. Its cost is that an operator now touches every qubit beneath it, so Pauli weight grows with the system."}
```

```qjw
{ "modes": 4, "electrons": 2, "mode": 0, "dagger": true }
```

The other half of the dictionary is the states themselves — and it is simpler than the operators. A Hartree-Fock reference is a definite occupation pattern, so preparing it takes nothing but $X$ gates on the occupied orbitals (the Z-strings only contribute a global phase on a basis state). Build the smallest one:

```qchallenge
{
  "id": "chem-hf-reference-1",
  "prompt": "One electron in two spin-orbitals: prepare the Hartree-Fock reference |10⟩ — orbital 0 occupied, orbital 1 empty — using X gates only.",
  "qubits": 2,
  "target": { "program": "X 0" },
  "allowedGates": ["X"],
  "hint": "Under Jordan-Wigner, occupied means flipped: qubit p holds orbital p, so occupying orbital 0 is a single X on qubit 0. The trap is flipping qubit 1 because a little-endian habit puts qubit 0 on the right of |10⟩, handing the leftmost 1 to qubit 1 — read the string left to right, orbital 0 first."
}
```

The mapping is exact but it has a cost: an operator on orbital $p$ now touches every qubit beneath it, so its Pauli weight grows with the system. The **Bravyi-Kitaev transformation** is a cleverer ledger that stores occupation and parity together, trading the linear $Z$-string for operators of weight $O(\log n)$ — less intuitive, but cheaper for large molecules. **Parity mapping** stores cumulative parity directly and, because it makes two symmetries (total electron number and spin) explicit, lets you delete two qubits outright. For the small molecules in this section, Jordan-Wigner is the natural starting point; the others are optimizations you reach for when qubit count bites.

However the ledger is kept, reading it back out is a measurement. Under Jordan-Wigner the number operator is $n_p = (I - Z_p)/2$, which makes $Z_p$ the occupation meter itself: $+1$ on an empty orbital, $-1$ on an occupied one. Create an electron and take the reading:

```qexpect
{
  "id": "chem-jw-number-occupied-1",
  "prompt": "X on qubit 0 creates an electron in orbital 0 — the JW occupied state |1⟩. What is ⟨Z₀⟩, the expectation the number operator n₀ = (I − Z₀)/2 is built from?",
  "program": "X 0",
  "observable": "Z 0",
  "hint": "An occupied orbital is the |1⟩ eigenstate of Z with eigenvalue −1, so every shot reads −1 and the long-run average is exactly −1 — giving n₀ = (1 − (−1))/2 = 1 electron. The trap is +1, which is the empty orbital's reading, or 0, which would mean a half-occupied superposition rather than a definite occupation."
}
```

## The Molecule as a Matrix

Run hydrogen through this pipeline in the minimal STO-3G basis and something concrete falls out: two H atoms, four spin-orbitals, four qubits, and a Hamiltonian that is a weighted sum of fifteen Pauli strings. No approximation has been made — this is the exact electronic structure problem for H2, rewritten as something a four-qubit device could measure. The coefficients are physics: stretch the bond and they shift.

```qham
{ "R": 0.75, "tapered": false }
```

Every one of those fifteen strings is estimated the same way: prepare a state, measure the string, average over shots. The $ZZ$ terms are occupation-parity meters — they ask whether two orbitals agree. Put a single electron in a two-orbital pair and commit to the reading:

```qexpect
{
  "id": "chem-zz-parity-1",
  "prompt": "X 1 puts one electron in orbital 1, preparing the two-orbital configuration |01⟩. The Hamiltonian's ZZ terms read occupation parity: what is ⟨Z₀Z₁⟩ in this state?",
  "program": "X 1",
  "observable": "Z 0 Z 1",
  "hint": "Multiply the two occupation meters: orbital 0 is empty (Z₀ reads +1) and orbital 1 is occupied (Z₁ reads −1), so every shot of Z₀Z₁ reads (+1)(−1) = −1. Disagreeing occupations mean odd parity, −1; the trap is +1, which would say the orbitals agree — both empty or both occupied."
}
```

Now the payoff. Those four qubits carry redundancy — the symmetries that parity mapping exposes mean the real problem is far smaller than it looks. Tapering away the conserved quantities collapses the four-qubit, fifteen-term operator down to a **single qubit** with just three terms:

$$
H_{\text{H}_2} \approx -0.34\, I + 0.78\, Z + 0.18\, X
$$

That is the entire ground-state problem for a hydrogen molecule, living on one qubit. Flip the taper toggle above and watch fifteen terms fold into three. The lesson generalizes: the naive qubit count is almost never the real one, and choosing the right symmetries and active orbitals is the difference between a calculation that fits on today's hardware and one that does not.

None of those terms can be measured until the register holds the state they are meant to probe — and for H2 the reference is fixed by counting: two electrons fill the two lowest spin-orbitals, $\ket{1100}$. The circuit below was meant to prepare exactly that and flipped the wrong orbital. Diagnose it from the state it actually made:

```qdebug
{
  "id": "chem-hf-debug-1",
  "prompt": "This circuit was meant to prepare H2's Hartree-Fock reference |1100⟩ — electrons in the two lowest spin-orbitals — but it produced |1010⟩, a configuration with one electron promoted too high. Fix it.",
  "qubits": 4,
  "broken": { "program": "X 0\nX 2" },
  "target": { "program": "X 0\nX 1" },
  "allowedGates": ["X"],
  "hint": "Hartree-Fock fills from the bottom: orbitals 0 and 1 occupied, 2 and 3 empty. The stray X 2 creates its electron one orbital too high, producing a singly-excited configuration instead of the reference. Move that X down to qubit 1."
}
```

## Minimizing the Energy

We have the molecule as an operator. Finding its ground state means finding the lowest eigenvalue of $H$ — and for anything bigger than a toy, diagonalizing $H$ is exactly the exponential wall we were trying to avoid. The **Variational Quantum Eigensolver** sidesteps it with a single, deep idea from physics: the variational principle. For *any* trial state $\ket{\psi(\theta)}$,

$$
\expval{\psi(\theta)|H|\psi(\theta)} \ge E_{\text{ground}}
$$

The expected energy of any state you can prepare is an upper bound on the true ground energy. You can never measure below the floor — you can only get closer to it. So VQE turns ground-state finding into optimization: prepare a parameterized state on the quantum computer, measure $\expval{H}$, hand the number to a classical optimizer, adjust $\theta$, repeat. The quantum device does the part it is good at (holding and measuring an exponential state); the classical optimizer does the part it is good at (nudging a few knobs downhill).

```qcard
{"id":"chem-vqe-variational-bound","prompt":"What variational-principle fact lets VQE turn ground-state finding into a minimization problem?","answer":"For any trial state, the expected energy `<psi|H|psi>` is an upper bound on the true ground energy `E_ground` — you can never measure below the floor, only approach it. So VQE prepares a parameterized state, measures `<H>`, and lets a classical optimizer push that bound down."}
```

"Measure $\expval{H}$" hides a bill. A Hamiltonian is a sum of Pauli strings; the identity string is a classical constant that costs nothing, and the naive protocol measures each of the other 14 as its own hardware task (grouping commuting strings can shrink that to about five settings — but price the naive run first):

```qcostestimate
{
  "id": "chem-vqe-cost-1",
  "prompt": "One VQE energy evaluation for four-qubit H2 naively measures each of the Hamiltonian's 14 non-identity Pauli strings as its own IonQ task of 1,000 shots. What does that single evaluation of ⟨H⟩ cost?",
  "provider": "IonQ",
  "shots": 1000,
  "tasks": 14,
  "hint": "Fourteen meters run at once: 14 tasks at {perTask} each, plus {perShot} for every one of the {shots} shots inside each task. The classic slip is pricing one task and forgetting the ×14 — and remember, this buys a single point on the energy landscape; the optimizer will ask for hundreds."
}
```

For tapered H2 the whole landscape fits in one picture. The ansatz is a single rotation $R_Y(\theta)\ket{0}$, the energy is $E(\theta) = c_0 + c_z\cos\theta + c_x\sin\theta$, and the variational floor sits exactly at the minimum of that curve. Drag $\theta$ and try to push the energy below the line — you cannot. Then let the optimizer find the bottom:

```qvqe
{ "R": 0.74 }
```

There is something special about this case worth saying plainly: because a single qubit's ansatz can reach *every* state of that qubit, VQE here is not approximate — it lands exactly on the true ground energy, $-1.137$ Hartree. For larger molecules the ansatz can only cover part of the space, and the gap between the floor and what your circuit can reach becomes the central challenge of the field.

## Drawing a Chemical Bond

One geometry gives one energy. Sweep the geometry and you get chemistry. Move the two hydrogen atoms apart, re-solve at each separation, and the string of ground energies traces the molecule's **potential energy surface** — the curve whose minimum is the equilibrium bond length and whose depth is the energy that holds the molecule together.

```qpes
{ "mark": 0.74 }
```

The minimum sits near $0.74$ Angstrom at $-1.137$ Hartree, and the well is about $0.20$ Hartree deep — that is the bond. But the most instructive feature is the gap between the two curves. Hartree-Fock, the workhorse mean-field method, hugs the exact curve near equilibrium where electrons are weakly correlated. Pull the bond apart and it peels away, rising far above the truth: restricted Hartree-Fock simply cannot describe two atoms drifting toward independent radicals. That widening gap is the **correlation energy**, and it is the precise quantitative statement of why strongly correlated chemistry needs more than mean-field — the exact regime where quantum computers are meant to earn their keep.

There is a circuit-level picture of what those two stretched atoms are sharing. In occupation language, a covalent bond is one electron split across two orbitals — the superposition $(\ket{01} + \ket{10})/\sqrt{2}$ — and under Jordan-Wigner the hopping term $a_0^\dagger a_1 + a_1^\dagger a_0$ that stitches it together becomes $(X_0 X_1 + Y_0 Y_1)/2$. Measure its first half on the shared-electron state:

```qexpect
{
  "id": "chem-hopping-xx-1",
  "prompt": "H 0, CNOT 0 1, X 1 prepares (|01⟩ + |10⟩)/√2 — one electron shared between two orbitals. What is ⟨X₀X₁⟩, the hopping-term expectation, in this state?",
  "program": "H 0\nCNOT 0 1\nX 1",
  "observable": "X 0 X 1",
  "hint": "X₀X₁ swaps the two configurations, |01⟩ ↔ |10⟩, and this state is their symmetric combination — the swap returns it unchanged, so it is a +1 eigenstate and ⟨X₀X₁⟩ = +1. The trap is 0: each qubit alone reads like a coin flip, but the joint readout is perfectly definite — exactly the correlation a bond is made of."
}
```

## Designing the Ansatz

VQE is only as good as the states its ansatz can reach. The trial circuit $U(\theta)$ is the whole ballgame, and there are two philosophies for building it.

Both start from the same place: the Hartree-Fock reference, the mean-field occupation the ansatz then dresses with correlation. Build it once yourself, in real Braket Python — graded by running your code in the browser:

```qchallenge
{
  "id": "chem-hf-ref-py-1",
  "prompt": "Prepare the Hartree-Fock reference for H₂ in the minimal two-orbital picture, in real Braket Python: the occupation state |11⟩, both spin-orbitals filled. Assign your circuit to `circuit`.",
  "qubits": 2,
  "target": { "program": "X 0\nX 1" },
  "starter": "from braket.circuits import Circuit\ncircuit = Circuit()",
  "hint": "The Hartree-Fock reference is a single occupation state — no superposition, no entanglement. Occupied means |1⟩, so flip both qubits from |0⟩ with an X on each to land on |11⟩.",
  "tier": "py"
}
```

**Unitary Coupled Cluster (UCC)** borrows the structure of classical coupled cluster, the gold standard of quantum chemistry. UCCSD builds excitations on top of the Hartree-Fock state:

$$U(\theta) = e^{T - T^\dagger}, \quad T = T_1 + T_2$$

where $T_1$ promotes one electron at a time (singles) and $T_2$ promotes pairs (doubles). It is chemically motivated — every parameter corresponds to a physical excitation — so it converges to the right answer. The cost is depth: each excitation is a string of CNOTs, and on noisy hardware that depth is expensive.

What a double excitation actually does to the register is worth seeing once in basis states: acting on the H2 reference, $T_2$ moves the *pair* — both electrons leave orbitals 0, 1 and land in orbitals 2, 3 together, leaving a coherent superposition of the two configurations. Trace this doubles-style circuit and commit:

```qpredict
{
  "id": "chem-ucc-double-support-1",
  "prompt": "This circuit applies a doubles-style excitation to four spin-orbitals, superposing the H2 reference with the configuration where both electrons moved up together. Which basis states appear with nonzero probability?",
  "program": "H 0\nCNOT 0 1\nX 2\nCNOT 0 2\nX 3\nCNOT 0 3",
  "mode": "nonzero-states",
  "hint": "Follow qubit 0's two branches. In its 0-branch no CNOT fires, so the X gates fill orbitals 2 and 3: |0011⟩. In its 1-branch CNOT 0 1 fills orbital 1 and the later CNOTs undo both X fills: |1100⟩. The pair moves as one — no configuration with a split pair survives."
}
```

**Hardware-Efficient Ansatz (HEA)** abandons chemical meaning for shallowness: just layers of single-qubit rotations and the entangling gates your device happens to support. A single layer is one rotation followed by one entangler. Drag $\theta$ to sweep the parameter and scrub to watch the two-qubit state evolve — this is the elementary motif VQE's optimizer searches:

```qscrub
qubits 2
RY 0 theta
CNOT 0 1
```

HEA runs on any topology and stays shallow, but it pays for it: it can wander into regions with no chemical relevance, and stacking layers invites the barren plateaus from the previous module. **ADAPT-VQE** splits the difference — it grows the ansatz one operator at a time, each round adding whichever excitation has the steepest energy gradient. It spends more measurements during optimization but ends with a compact, problem-specific circuit. The choice among them is the recurring NISQ trade-off: accuracy against depth against trainability.

"No chemical relevance" has a concrete face. A molecule has a fixed electron count, but nothing in a hardware-efficient layer knows that — a bare Hadamard on an orbital qubit happily superposes *different numbers of electrons*. Predict where this HEA-style fragment puts its amplitude:

```qpredict
{
  "id": "chem-hea-number-leak-1",
  "prompt": "An HEA-style fragment: X occupies orbital 0, then H acts on orbital 1. Which two-orbital basis states appear with nonzero probability?",
  "program": "X 0\nH 1",
  "mode": "nonzero-states",
  "hint": "X pins orbital 0 at occupied; H splits orbital 1 evenly between empty and occupied. The support is |10⟩ and |11⟩ — one branch holds one electron, the other two. A molecule cannot superpose electron numbers, and this is exactly how an unconstrained ansatz wanders out of chemistry."
}
```

## Scaling Up: Basis Sets and Active Space

Two knobs decide how big the problem gets. The **basis set** is how finely you approximate each atomic orbital with Gaussian functions: STO-3G is minimal and fast but crude (it is what produced the H2 curve above, and why that curve is qualitatively right but quantitatively loose); 6-31G splits the valence shell; cc-pVDZ and cc-pVTZ climb a systematic ladder toward the basis-set limit. Richer basis means more orbitals — and more orbitals means more qubits.

The **active space** is how you cope when the full count is hopeless. You cannot put all eighty spin-orbitals of a medium molecule on a quantum computer, but you do not have to. Run a cheap classical Hartree-Fock to get the molecular orbitals, keep only the handful near the Fermi level where the action is, freeze the rest into an averaged background, and hand just that active window to VQE. A molecule with 20 electrons in 40 orbitals nominally needs 80 qubits; an active space of 4 electrons in 4 orbitals needs 8 — tractable today. It is the same move as the symmetry tapering that shrank H2 to one qubit, applied with chemical judgment: spend your scarce qubits only where correlation actually matters.

Freezing an orbital is safe precisely because its measurements are foregone conclusions: an orbital that never receives an electron reads the same value on every shot, so every Hamiltonian term that touches only frozen orbitals collapses to a constant you add classically. Confirm the ledger entry for a frozen virtual:

```qexpect
{
  "id": "chem-frozen-empty-z-1",
  "prompt": "A frozen virtual orbital never receives an electron — the circuit leaves it untouched (identity). What is ⟨Z₀⟩ for this permanently empty orbital?",
  "program": "I 0",
  "observable": "Z 0",
  "hint": "Empty means |0⟩, the +1 eigenstate of Z: every shot reads +1 and the average is exactly +1, so n₀ = (1 − ⟨Z₀⟩)/2 = 0 electrons. Because that reading can never change, a frozen orbital contributes only a classical constant — which is why freezing it costs nothing but an energy offset. The trap is −1, the occupied orbital's reading."
}
```

## Where This Matters

The molecules quantum computers can treat accurately today — H2, LiH, BeH2, water — are small. The value is not in those answers, which classical methods already nail, but in proving out methods that will scale as hardware grows:

- **Drug binding.** How tightly a candidate molecule grips a protein pocket is a difference of large energies, and the binding interface is often strongly correlated — exactly where mean-field errors of a few kcal/mol decide whether a drug works.
- **Reaction mechanisms.** Mapping energy along a reaction coordinate means resolving transition states, which carry strong multireference character. Get the barrier height wrong and you mispredict the rate by orders of magnitude.
- **Materials by design.** Catalysts, battery electrolytes, and candidate superconductors are correlated-electron problems where first-principles accuracy would replace decades of trial and error.

That last bullet has a two-qubit toy you can already build. Superconductivity runs on electron pairing — configurations where two orbitals empty *together* or fill *together*, superposed. A mean-field product state cannot hold that correlation; your register can:

```qchallenge
{
  "id": "chem-pairing-state-1",
  "prompt": "Prepare the toy pairing state (|00⟩ + |11⟩)/√2 — two orbitals that are always empty together or occupied together, in superposition.",
  "qubits": 2,
  "starter": "H 0\nH 1",
  "target": { "program": "H 0\nCNOT 0 1" },
  "allowedGates": ["H", "CNOT"],
  "hint": "Two independent Hadamards give every configuration equal weight — including the broken-pair states |01⟩ and |10⟩. Pairing is a correlation, so it needs a two-qubit gate: superpose orbital 0 with H, then let CNOT copy its occupation onto orbital 1 so the pair fills or empties as one."
}
```

The throughline of this entire module is the one move we made with hydrogen: a molecule is an operator, the operator is a matrix, and the matrix has a lowest eigenvalue you can chase by minimizing an expectation value. Everything else — better mappings, better ansatze, active spaces — is engineering in service of pushing that one idea up to molecules that matter.

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

---

The next module, **`06-hybrid-jobs`**, takes the VQE workflow you just built — prepare, measure, optimize, repeat — and packages it as a managed, production-grade hybrid quantum-classical job that scans geometries in parallel and checkpoints long sweeps.
