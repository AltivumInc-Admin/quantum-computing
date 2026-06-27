import { slugify } from "@/lib/slug";

export type SectionSlug =
  | "00-prereqs"
  | "01-foundations"
  | "02-hardware"
  | "03-algorithms"
  | "04-quantum-ml"
  | "05-quantum-chemistry"
  | "06-hybrid-jobs";

export interface GlossaryTerm {
  term: string;
  definition: string; // inline markdown: `code` and $math$ permitted
  section: SectionSlug;
  aliases?: string[];
  seeAlso?: string[]; // exact `term` values of related entries
}

// Short, chip-sized labels for each curriculum section. Abbreviates the long
// manifest titles ("Prerequisites: From Zero to..." -> "Prerequisites"). The
// glossary.test asserts these keys are exactly the 7 manifest slugs.
export const SECTION_SHORT_LABEL: Record<SectionSlug, string> = {
  "00-prereqs": "Prerequisites",
  "01-foundations": "Foundations",
  "02-hardware": "Hardware",
  "03-algorithms": "Algorithms",
  "04-quantum-ml": "Quantum ML",
  "05-quantum-chemistry": "Chemistry",
  "06-hybrid-jobs": "Hybrid Jobs",
};

export function sectionShortLabel(slug: SectionSlug): string {
  return SECTION_SHORT_LABEL[slug];
}

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function termSlug(term: string): string {
  return slugify(term);
}

export function firstLetter(term: string): string {
  return term.trim().charAt(0).toUpperCase();
}

export function sortedTerms(terms: GlossaryTerm[] = GLOSSARY): GlossaryTerm[] {
  return [...terms].sort((a, b) =>
    a.term.localeCompare(b.term, "en", { sensitivity: "base" })
  );
}

export interface LetterGroup {
  letter: string;
  terms: GlossaryTerm[];
}

export function groupByLetter(terms: GlossaryTerm[]): LetterGroup[] {
  const groups: LetterGroup[] = [];
  for (const t of sortedTerms(terms)) {
    const letter = firstLetter(t.term);
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.terms.push(t);
    else groups.push({ letter, terms: [t] });
  }
  return groups;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function matchesQuery(term: GlossaryTerm, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const haystack = [term.term, ...(term.aliases ?? []), term.definition].map(normalize);
  return haystack.some((h) => h.includes(q));
}

// Seed set (expanded to the full inventory in Task 8). Real, reviewed entries
// spanning several letters/sections so the page and its tests exercise grouping,
// multiple hues, aliases, seeAlso, and inline math from the start.
export const GLOSSARY: GlossaryTerm[] = [
  { term: "Amplitude", section: "00-prereqs", aliases: ["probability amplitude", "complex amplitude"],
    definition: "A complex number attached to a basis state in a superposition; its squared magnitude gives the probability of measuring that state.",
    seeAlso: ["Born rule"] },
  { term: "Ansatz", section: "04-quantum-ml", aliases: ["trial state"],
    definition: "A parameterized quantum circuit whose rotation angles a classical optimizer tunes; the trial form a variational algorithm searches over.",
    seeAlso: ["Variational quantum eigensolver"] },
  { term: "Bell pair", section: "01-foundations", aliases: ["Bell state"],
    definition: "Two qubits in a maximally entangled state such as $\\ket{\\Phi^+} = (\\ket{00}+\\ket{11})/\\sqrt2$; measuring one fixes the other's outcome.",
    seeAlso: ["Entanglement"] },
  { term: "Bloch sphere", section: "01-foundations",
    definition: "A geometric picture of one qubit as a point on a unit sphere: $\\ket{0}$ at the north pole, $\\ket{1}$ at the south, superpositions around the equator.",
    seeAlso: ["Qubit"] },
  { term: "Born rule", section: "01-foundations",
    definition: "The rule that a measurement outcome's probability equals the squared magnitude of its amplitude, $|\\alpha|^2$.",
    seeAlso: ["Measurement", "Amplitude"] },
  { term: "CNOT gate", section: "01-foundations", aliases: ["CX", "controlled-NOT"],
    definition: "A two-qubit gate that flips the target qubit when the control is $\\ket{1}$; the standard entangling gate.",
    seeAlso: ["Entanglement"] },
  { term: "Entanglement", section: "01-foundations",
    definition: "A correlation between qubits with no classical analogue: the joint state cannot be factored into independent single-qubit states.",
    seeAlso: ["Bell pair"] },
  { term: "Hadamard gate", section: "01-foundations", aliases: ["H gate"],
    definition: "The gate that maps $\\ket{0}$ to $(\\ket{0}+\\ket{1})/\\sqrt{2}$ and $\\ket{1}$ to $(\\ket{0}-\\ket{1})/\\sqrt{2}$; the primary tool for entering superposition.",
    seeAlso: ["Superposition"] },
  { term: "Hamiltonian", section: "05-quantum-chemistry",
    definition: "The operator representing a system's total energy; its lowest eigenvalue is the ground-state energy that algorithms like VQE estimate.",
    seeAlso: ["Variational quantum eigensolver"] },
  { term: "Measurement", section: "01-foundations",
    definition: "Reading a qubit, which collapses its superposition to a basis state with a probability set by the Born rule.",
    seeAlso: ["Born rule"] },
  { term: "Qubit", section: "01-foundations",
    definition: "The basic unit of quantum information: a two-level system whose state is a unit vector $\\alpha\\ket{0}+\\beta\\ket{1}$ in $\\mathbb{C}^2$.",
    seeAlso: ["Superposition", "Bloch sphere"] },
  { term: "Superposition", section: "01-foundations",
    definition: "A qubit state that is a linear combination of basis states, holding $\\ket{0}$ and $\\ket{1}$ at once until measured.",
    seeAlso: ["Qubit", "Measurement"] },
  { term: "Unitary matrix", section: "00-prereqs", aliases: ["unitary operator"],
    definition: "A matrix $U$ with $U^\\dagger U = I$; every quantum gate is unitary because such matrices preserve a state's norm.",
    seeAlso: ["Qubit"] },
  { term: "Variational quantum eigensolver", section: "05-quantum-chemistry", aliases: ["VQE"],
    definition: "A hybrid algorithm that measures a Hamiltonian's energy on a quantum device while a classical optimizer minimizes it to estimate the ground state.",
    seeAlso: ["Hamiltonian", "Ansatz"] },

  // ----- 00-prereqs (Prerequisites) -----
  { term: "Hilbert space", section: "00-prereqs", aliases: ["state space"],
    definition: "The complex vector space a quantum state lives in; a single qubit's is $\\mathbb{C}^2$ and $n$ qubits share a $2^n$-dimensional space.",
    seeAlso: ["Qubit", "Tensor product"] },
  { term: "Inner product", section: "00-prereqs", aliases: ["overlap"],
    definition: "A complex number $\\braket{a}{b}$ measuring the overlap between two states; it is zero when they are orthogonal and is written `a.conj() @ b` in NumPy.",
    seeAlso: ["Dirac notation", "Norm"] },
  { term: "Norm", section: "00-prereqs", aliases: ["normalization", "normalize"],
    definition: "The length of a state vector, $\\sqrt{\\braket{\\psi}{\\psi}}$; quantum states are normalized to norm 1 so their measurement probabilities sum to one.",
    seeAlso: ["Inner product", "Born rule"] },
  { term: "Computational basis", section: "00-prereqs", aliases: ["Z basis", "standard basis"],
    definition: "The default measurement basis $\\{\\ket{0}, \\ket{1}\\}$ for a qubit (and $\\ket{00}, \\ket{01}, \\dots$ for several); the states a measurement reports its outcomes in.",
    seeAlso: ["Measurement", "Statevector"] },
  { term: "Tensor product", section: "00-prereqs", aliases: ["Kronecker product", "kron"],
    definition: "The operation $\\otimes$ that combines single-qubit states into a multi-qubit state, written `np.kron` in NumPy; $n$ qubits give a $2^n$-dimensional space.",
    seeAlso: ["Hilbert space", "Qubit"] },
  { term: "Hermitian operator", section: "00-prereqs", aliases: ["self-adjoint", "observable"],
    definition: "An operator equal to its own conjugate transpose, $A = A^\\dagger$; its eigenvalues are real, which is why physical observables like the Hamiltonian are Hermitian.",
    seeAlso: ["Eigenvalue", "Hamiltonian", "Expectation value"] },
  { term: "Eigenvalue", section: "00-prereqs",
    definition: "A scalar $\\lambda$ for which $A\\ket{v} = \\lambda\\ket{v}$; for a Hamiltonian the eigenvalues are the allowed energies, the smallest being the ground-state energy.",
    seeAlso: ["Eigenvector", "Hamiltonian"] },
  { term: "Eigenvector", section: "00-prereqs", aliases: ["eigenstate"],
    definition: "A nonzero vector $\\ket{v}$ that an operator only rescales, $A\\ket{v} = \\lambda\\ket{v}$, leaving its direction unchanged.",
    seeAlso: ["Eigenvalue", "Hermitian operator"] },
  { term: "Dirac notation", section: "00-prereqs", aliases: ["bra-ket", "braket", "bra", "ket"],
    definition: "The standard quantum shorthand: a ket $\\ket{\\psi}$ is a column vector (a state), a bra $\\bra{\\psi}$ its conjugate-transpose row, and $\\braket{a}{b}$ their inner product.",
    seeAlso: ["Inner product", "Qubit"] },
  { term: "Expectation value", section: "00-prereqs", aliases: ["expected value", "mean"],
    definition: "The probability-weighted average of an observable's outcomes, $\\expval{A} = \\bra{\\psi} A \\ket{\\psi}$; VQE works by minimizing the expectation value of a Hamiltonian.",
    seeAlso: ["Hermitian operator", "Born rule", "Variational quantum eigensolver"] },

  // ----- 01-foundations (Foundations) -----
  { term: "Quantum gate", section: "01-foundations", aliases: ["gate"],
    definition: "A unitary operation that transforms qubit states; on a single qubit every gate is a rotation of the Bloch sphere, and gates are the verbs of a circuit.",
    seeAlso: ["Unitary matrix", "Bloch sphere", "Quantum circuit"] },
  { term: "Pauli gates", section: "01-foundations", aliases: ["X gate", "Y gate", "Z gate", "Pauli matrices"],
    definition: "The three single-qubit gates $X$, $Y$, and $Z$ — half-turns about the Bloch axes; $X$ flips $\\ket{0}\\leftrightarrow\\ket{1}$ and $Z$ flips the sign of $\\ket{1}$.",
    seeAlso: ["Quantum gate", "Bloch sphere"] },
  { term: "Phase gate", section: "01-foundations", aliases: ["S gate", "T gate"],
    definition: "A gate that adds a phase to $\\ket{1}$ while leaving $\\ket{0}$ fixed; the $S$ gate is a quarter-turn about Z ($\\pi/2$) and the $T$ gate an eighth-turn ($\\pi/4$).",
    seeAlso: ["Pauli gates", "Relative phase"] },
  { term: "Rotation gate", section: "01-foundations", aliases: ["RX", "RY", "RZ"],
    definition: "A parameterized single-qubit gate $R_x(\\theta)$, $R_y(\\theta)$, or $R_z(\\theta)$ that rotates the Bloch vector by angle $\\theta$ about an axis; the tunable knob of variational circuits.",
    seeAlso: ["Bloch sphere", "Ansatz"] },
  { term: "Controlled gate", section: "01-foundations", aliases: ["controlled-Z", "CZ"],
    definition: "A two-qubit gate that applies an operation to a target qubit only when the control qubit is $\\ket{1}$; CNOT and CZ are the common examples.",
    seeAlso: ["CNOT gate", "Entanglement"] },
  { term: "Quantum circuit", section: "01-foundations", aliases: ["circuit"],
    definition: "A sequence of gates applied to qubits initialized in $\\ket{0}$ and read out by measurement; its two sizes are depth (time steps) and width (qubit count).",
    seeAlso: ["Quantum gate", "Measurement"] },
  { term: "Global phase", section: "01-foundations",
    definition: "An overall factor $e^{i\\gamma}$ multiplying an entire state; it is physically unobservable because the Born rule depends only on squared magnitudes.",
    seeAlso: ["Relative phase", "Born rule"] },
  { term: "Relative phase", section: "01-foundations",
    definition: "The phase difference between the $\\ket{0}$ and $\\ket{1}$ parts of a superposition; unlike a global phase it is physical and reveals itself through interference.",
    seeAlso: ["Global phase", "Interference"] },
  { term: "Interference", section: "01-foundations",
    definition: "The reinforcing and cancelling of amplitudes; quantum algorithms arrange it so wrong answers cancel and the right ones add up before measurement.",
    seeAlso: ["Amplitude", "Quantum algorithm"] },
  { term: "No-cloning theorem", section: "01-foundations",
    definition: "The result that no operation can copy an arbitrary unknown quantum state; it underlies quantum teleportation and quantum cryptography.",
    seeAlso: ["Quantum teleportation", "Measurement"] },
  { term: "Statevector", section: "01-foundations", aliases: ["state vector", "wavefunction"],
    definition: "The list of $2^n$ complex amplitudes that fully describes an $n$-qubit pure state; the local simulator computes it exactly.",
    seeAlso: ["Amplitude", "Quantum simulator"] },
  { term: "Shots", section: "01-foundations", aliases: ["shot count"],
    definition: "Repetitions of preparing and measuring a circuit; the histogram over many shots approaches the Born-rule probabilities, and QPUs bill per shot.",
    seeAlso: ["Measurement", "Born rule"] },

  // ----- 02-hardware (Hardware) -----
  { term: "Amazon Braket", section: "02-hardware", aliases: ["Braket"],
    definition: "AWS's managed quantum computing service that exposes a single SDK and API to run circuits on simulators and on QPUs from several hardware providers.",
    seeAlso: ["QPU", "Quantum simulator"] },
  { term: "QPU", section: "02-hardware", aliases: ["quantum processing unit"],
    definition: "A Quantum Processing Unit — real quantum hardware; on Braket these are the IonQ, IQM, and QuEra devices, billed per task plus per shot.",
    seeAlso: ["Amazon Braket", "Quantum simulator", "Braket task"] },
  { term: "Quantum simulator", section: "02-hardware", aliases: ["SV1", "DM1", "TN1", "simulator"],
    definition: "Classical software that computes a circuit's result; Braket offers SV1 (exact state vector), DM1 (density matrix, models noise), and TN1 (tensor network).",
    seeAlso: ["LocalSimulator", "Statevector", "Noise model"] },
  { term: "LocalSimulator", section: "02-hardware", aliases: ["local simulator"],
    definition: "Braket's free, instant simulator that runs on your own machine; the recommended default for developing and debugging circuits up to roughly 25 qubits.",
    seeAlso: ["Quantum simulator", "Amazon Braket"] },
  { term: "Qubit connectivity", section: "02-hardware", aliases: ["topology", "coupling map"],
    definition: "Which qubits on a device can directly interact; all-to-all connectivity entangles any pair, while a lattice forces SWAPs to bring distant qubits together.",
    seeAlso: ["Transpilation", "Trapped-ion qubit", "Superconducting qubit"] },
  { term: "Native gate set", section: "02-hardware", aliases: ["native gates"],
    definition: "The specific gates a device runs in hardware; every circuit is transpiled into this set first, e.g. GPi/GPi2/MS on IonQ or CZ/PRx on IQM.",
    seeAlso: ["Transpilation", "Quantum gate"] },
  { term: "Transpilation", section: "02-hardware", aliases: ["compilation", "routing"],
    definition: "Rewriting a circuit into a device's native gates and connectivity, inserting SWAPs to bring distant qubits together; this can grow circuit depth and add noise.",
    seeAlso: ["Native gate set", "Qubit connectivity"] },
  { term: "Coherence time", section: "02-hardware", aliases: ["T1", "T2", "relaxation time", "dephasing time"],
    definition: "How long a qubit holds its quantum state before decaying; $T_1$ measures energy relaxation and $T_2$ dephasing, and a circuit must finish well inside it.",
    seeAlso: ["Decoherence", "Gate fidelity"] },
  { term: "Decoherence", section: "02-hardware",
    definition: "The gradual loss of a qubit's quantum information to its environment, smearing a circuit's ideal probability peaks toward random noise; the defining problem of the NISQ era.",
    seeAlso: ["Coherence time", "Noise model"] },
  { term: "Noise model", section: "02-hardware", aliases: ["noise channel"],
    definition: "A description of how a device corrupts a circuit, such as depolarizing or amplitude-damping channels; Braket's DM1 simulator applies these to study errors before paying for hardware.",
    seeAlso: ["Decoherence", "Gate fidelity", "Quantum simulator"] },
  { term: "Gate fidelity", section: "02-hardware", aliases: ["fidelity"],
    definition: "How accurately a gate performs its intended operation, often above 99% per single-qubit gate; because errors compound, low two-qubit fidelity limits how deep a circuit can run.",
    seeAlso: ["Decoherence", "Readout error"] },
  { term: "Readout error", section: "02-hardware", aliases: ["measurement error", "SPAM error"],
    definition: "The chance that measuring a qubit reports the wrong value, e.g. reading a $\\ket{0}$ as $\\ket{1}$; a distinct error source from gate noise.",
    seeAlso: ["Measurement", "Gate fidelity"] },
  { term: "Trapped-ion qubit", section: "02-hardware", aliases: ["trapped ion"],
    definition: "A qubit encoded in the energy levels of an individual charged atom held by electromagnetic fields; IonQ's approach, prized for all-to-all connectivity and long coherence.",
    seeAlso: ["QPU", "Qubit connectivity"] },
  { term: "Superconducting qubit", section: "02-hardware", aliases: ["transmon"],
    definition: "A qubit built from a tiny superconducting (transmon) circuit cooled near absolute zero and driven by microwaves; IQM's approach, with fast nanosecond gates but lattice connectivity.",
    seeAlso: ["QPU", "Qubit connectivity"] },
  { term: "Neutral-atom qubit", section: "02-hardware", aliases: ["neutral atom", "Rydberg atom"],
    definition: "A qubit encoded in a neutral atom held in an optical tweezer; QuEra's Aquila uses arrays of them for analog Hamiltonian simulation rather than a gate circuit.",
    seeAlso: ["QPU", "Hamiltonian"] },
  { term: "Braket task", section: "02-hardware", aliases: ["quantum task"],
    definition: "A single circuit-execution request submitted to a Braket device with a chosen shot count; QPUs charge a flat per-task fee plus a per-shot fee.",
    seeAlso: ["Amazon Braket", "Shots", "QPU"] },

  // ----- 03-algorithms (Algorithms) -----
  { term: "Quantum algorithm", section: "03-algorithms",
    definition: "A procedure that uses superposition, entanglement, and interference to solve a problem faster than the best classical method for the same task.",
    seeAlso: ["Interference", "Quantum speedup"] },
  { term: "Oracle", section: "03-algorithms", aliases: ["black box"],
    definition: "A black-box reversible gate $U_f$ that encodes a problem's function; a phase oracle marks solutions by flipping their sign, $\\ket{x} \\mapsto (-1)^{f(x)}\\ket{x}$.",
    seeAlso: ["Grover's algorithm", "Deutsch–Jozsa algorithm"] },
  { term: "Deutsch–Jozsa algorithm", section: "03-algorithms", aliases: ["Deutsch-Jozsa"],
    definition: "An oracle algorithm that decides whether a function is constant or balanced in a single query, where classical methods may need exponentially many; the cleanest demonstration of speedup from interference.",
    seeAlso: ["Oracle", "Bernstein–Vazirani algorithm", "Interference"] },
  { term: "Bernstein–Vazirani algorithm", section: "03-algorithms", aliases: ["Bernstein-Vazirani"],
    definition: "An oracle algorithm that recovers a hidden bit-string $s$ from $f(x) = s\\cdot x$ in one query, versus the $n$ queries a classical method needs.",
    seeAlso: ["Oracle", "Deutsch–Jozsa algorithm"] },
  { term: "Grover's algorithm", section: "03-algorithms", aliases: ["Grover search", "Grover's search"],
    definition: "A search algorithm that finds a marked item among $N$ in $O(\\sqrt{N})$ queries — a quadratic speedup — by repeatedly amplifying the marked amplitude.",
    seeAlso: ["Amplitude amplification", "Oracle"] },
  { term: "Amplitude amplification", section: "03-algorithms",
    definition: "The generalization of Grover's trick: each iteration reflects the state about the marked items and then about the mean, rotating amplitude onto the answer.",
    seeAlso: ["Grover's algorithm", "Interference"] },
  { term: "Quantum Fourier transform", section: "03-algorithms", aliases: ["QFT"],
    definition: "The quantum analogue of the discrete Fourier transform, built from Hadamards and controlled phase rotations in $O(n^2)$ gates; it exposes periodicity in a state.",
    seeAlso: ["Quantum phase estimation", "Hadamard gate"] },
  { term: "Quantum phase estimation", section: "03-algorithms", aliases: ["QPE", "phase estimation"],
    definition: "An algorithm that estimates the eigenphase $\\phi$ of a unitary with $U\\ket{u} = e^{2\\pi i\\phi}\\ket{u}$ using an inverse QFT; the engine of Shor's algorithm and energy estimation.",
    seeAlso: ["Quantum Fourier transform", "Eigenvalue"] },
  { term: "Quantum teleportation", section: "03-algorithms", aliases: ["teleportation"],
    definition: "A protocol that transfers an unknown qubit state using a shared Bell pair and two classical bits, consuming the entanglement; it moves no matter and sends no information faster than light.",
    seeAlso: ["Bell pair", "No-cloning theorem"] },
  { term: "Superdense coding", section: "03-algorithms", aliases: ["dense coding"],
    definition: "A protocol that sends two classical bits by transmitting a single qubit, using a pre-shared Bell pair; the conceptual dual of teleportation.",
    seeAlso: ["Bell pair", "Quantum teleportation"] },
  { term: "Quantum speedup", section: "03-algorithms", aliases: ["quantum advantage"],
    definition: "The advantage a quantum algorithm holds over the best classical one for a task, ranging from quadratic (Grover) to exponential (Shor) — and only for problems with the right structure.",
    seeAlso: ["Quantum algorithm", "Grover's algorithm"] },

  // ----- 04-quantum-ml (Quantum ML) -----
  { term: "Quantum machine learning", section: "04-quantum-ml", aliases: ["QML"],
    definition: "Machine learning where the model is a quantum circuit: classical data is encoded into a state, a parameterized circuit transforms it, and a measurement reads out the prediction.",
    seeAlso: ["Parameterized quantum circuit", "Data encoding", "Variational quantum circuit"] },
  { term: "Parameterized quantum circuit", section: "04-quantum-ml", aliases: ["PQC"],
    definition: "A circuit whose gate angles $\\theta$ are tunable parameters defining a function $f(x;\\theta)$; the quantum analogue of a neural network with trainable weights.",
    seeAlso: ["Ansatz", "Variational quantum circuit", "Parameter-shift rule"] },
  { term: "Variational quantum circuit", section: "04-quantum-ml", aliases: ["VQC", "variational classifier"],
    definition: "A parameterized circuit trained by a classical optimizer to minimize a cost, used as a quantum classifier or regressor; quantum proposes, classical disposes, repeat.",
    seeAlso: ["Parameterized quantum circuit", "Cost function", "Classical optimizer"] },
  { term: "PennyLane", section: "04-quantum-ml",
    definition: "An open-source framework for differentiable quantum programming that supplies parameter-shift gradients, optimizers, and one-line device switching; it runs on Braket via a plugin.",
    seeAlso: ["Parameter-shift rule", "Amazon Braket"] },
  { term: "Data encoding", section: "04-quantum-ml", aliases: ["feature map", "angle encoding", "amplitude encoding", "embedding"],
    definition: "How classical data is loaded into a quantum state; the choice (angle, amplitude, IQP) fixes the feature space the model can ever see, making it a modeling decision rather than a formality.",
    seeAlso: ["Quantum machine learning", "Statevector"] },
  { term: "Parameter-shift rule", section: "04-quantum-ml",
    definition: "A way to get the exact gradient of a circuit's expectation value with respect to a gate angle from two evaluations, $\\tfrac{1}{2}[f(\\theta+\\tfrac{\\pi}{2}) - f(\\theta-\\tfrac{\\pi}{2})]$ — no finite differences.",
    seeAlso: ["Variational quantum circuit", "Expectation value"] },
  { term: "Cost function", section: "04-quantum-ml", aliases: ["loss function", "objective function"],
    definition: "The scalar a variational algorithm minimizes, computed from circuit measurements; using a local cost (one qubit) instead of a global one is the key mitigation for barren plateaus.",
    seeAlso: ["Classical optimizer", "Barren plateau"] },
  { term: "Barren plateau", section: "04-quantum-ml",
    definition: "A training landscape where the cost gradient vanishes exponentially with qubit count ($\\mathrm{Var} \\sim 2^{-n}$), so the optimizer sees a flat surface; mitigated by local costs and structured ansätze.",
    seeAlso: ["Cost function", "Parameterized quantum circuit"] },

  // ----- 05-quantum-chemistry (Chemistry) -----
  { term: "Ground-state energy", section: "05-quantum-chemistry", aliases: ["ground state"],
    definition: "The lowest eigenvalue of a molecule's Hamiltonian — the energy of its most stable electron configuration; computing it predicts stability, bonds, and reactions.",
    seeAlso: ["Hamiltonian", "Eigenvalue", "Variational quantum eigensolver"] },
  { term: "Jordan–Wigner transformation", section: "05-quantum-chemistry", aliases: ["Jordan-Wigner", "JW transform"],
    definition: "A mapping from fermionic creation and annihilation operators to qubit (Pauli) operators; it attaches a trailing $Z$-string to encode the antisymmetry of electrons.",
    seeAlso: ["Fermionic operator", "Second quantization", "Pauli string"] },
  { term: "Second quantization", section: "05-quantum-chemistry",
    definition: "A formulation that tracks orbital occupation rather than electron positions, using creation and annihilation operators; it folds a molecule's whole Hamiltonian into one compact operator.",
    seeAlso: ["Fermionic operator", "Hamiltonian"] },
  { term: "Fermionic operator", section: "05-quantum-chemistry", aliases: ["creation operator", "annihilation operator", "ladder operator"],
    definition: "A creation operator $a_p^\\dagger$ that adds an electron to orbital $p$ or an annihilation operator $a_p$ that removes one; their anticommutation encodes the Pauli exclusion principle.",
    seeAlso: ["Second quantization", "Jordan–Wigner transformation"] },
  { term: "Pauli string", section: "05-quantum-chemistry", aliases: ["Pauli term", "Pauli word"],
    definition: "A tensor product of Pauli operators such as $Z_0 X_1 I_2$ acting on several qubits; a qubit Hamiltonian is a weighted sum of Pauli strings, each measured to estimate energy.",
    seeAlso: ["Hamiltonian", "Jordan–Wigner transformation", "Expectation value"] },
  { term: "Trotterization", section: "05-quantum-chemistry", aliases: ["Trotter–Suzuki", "Trotter decomposition"],
    definition: "Approximating the time evolution $e^{-iHt}$ of a sum of non-commuting terms by a product of small single-term evolutions; the basis of digital Hamiltonian simulation.",
    seeAlso: ["Hamiltonian", "Pauli string"] },
  { term: "Potential energy surface", section: "05-quantum-chemistry", aliases: ["PES"],
    definition: "The curve of a molecule's ground-state energy as a function of its geometry; its minimum gives the equilibrium bond length and its depth the bond strength.",
    seeAlso: ["Ground-state energy", "Variational quantum eigensolver"] },
  { term: "OpenFermion", section: "05-quantum-chemistry",
    definition: "An open-source library for quantum chemistry that builds molecular Hamiltonians and maps fermionic operators to qubit operators; paired with PySCF for the classical integrals.",
    seeAlso: ["Second quantization", "Jordan–Wigner transformation"] },
  { term: "Hartree–Fock", section: "05-quantum-chemistry", aliases: ["Hartree-Fock", "HF", "mean field"],
    definition: "A classical mean-field method that treats each electron as moving in the average field of the others; accurate near equilibrium but it misses correlation energy as bonds stretch.",
    seeAlso: ["Electronic structure", "Ground-state energy"] },
  { term: "Electronic structure", section: "05-quantum-chemistry",
    definition: "The arrangement and energies of a molecule's electrons; solving it — finding the ground state of the electronic Hamiltonian — is the central problem of quantum chemistry.",
    seeAlso: ["Hamiltonian", "Ground-state energy"] },

  // ----- 06-hybrid-jobs (Hybrid Jobs) -----
  { term: "Hybrid quantum-classical algorithm", section: "06-hybrid-jobs", aliases: ["hybrid algorithm"],
    definition: "An algorithm that alternates between a quantum device and a classical computer — the quantum part prepares and measures states, the classical part optimizes parameters; VQE and QAOA are the archetypes.",
    seeAlso: ["Variational quantum eigensolver", "QAOA", "Classical optimizer"] },
  { term: "Amazon Braket Hybrid Jobs", section: "06-hybrid-jobs", aliases: ["Hybrid Jobs", "Braket Hybrid Jobs"],
    definition: "A managed Braket service that runs your variational loop on a classical instance with priority QPU access, compiling once, checkpointing, and streaming metrics, then tearing down when done.",
    seeAlso: ["Amazon Braket", "Checkpointing", "Classical optimizer"] },
  { term: "Classical optimizer", section: "06-hybrid-jobs", aliases: ["optimizer", "COBYLA", "SPSA"],
    definition: "The classical routine that updates a variational circuit's parameters to minimize the cost; common choices are COBYLA, Nelder–Mead, SPSA, and Adam.",
    seeAlso: ["Cost function", "Optimization loop"] },
  { term: "QAOA", section: "06-hybrid-jobs", aliases: ["Quantum Approximate Optimization Algorithm"],
    definition: "A variational algorithm for combinatorial optimization that alternates a cost-Hamiltonian unitary with a mixer, tuning the angles $(\\gamma, \\beta)$ with a classical optimizer; MaxCut is the canonical example.",
    seeAlso: ["Cost Hamiltonian", "Mixer Hamiltonian", "Classical optimizer"] },
  { term: "Cost Hamiltonian", section: "06-hybrid-jobs", aliases: ["problem Hamiltonian"],
    definition: "In QAOA, the operator $C$ encoding the optimization problem; its unitary $e^{-i\\gamma C}$ imprints each candidate solution's value as a phase.",
    seeAlso: ["QAOA", "Mixer Hamiltonian"] },
  { term: "Mixer Hamiltonian", section: "06-hybrid-jobs", aliases: ["mixer"],
    definition: "In QAOA, the operator (typically $\\sum_q X_q$) whose unitary $e^{-i\\beta B}$ spreads amplitude between candidate solutions so that good assignments can grow.",
    seeAlso: ["QAOA", "Cost Hamiltonian"] },
  { term: "Optimization loop", section: "06-hybrid-jobs", aliases: ["variational loop", "training loop"],
    definition: "The repeating cycle of a variational algorithm: prepare a parameterized state, measure the cost, let the classical optimizer pick new parameters, and repeat until convergence.",
    seeAlso: ["Classical optimizer", "Hybrid quantum-classical algorithm"] },
  { term: "Checkpointing", section: "06-hybrid-jobs",
    definition: "Periodically saving a job's optimizer state so a long run that fails can resume from the last save instead of restarting; `save_job_checkpoint()` and `load_job_checkpoint()` in Braket.",
    seeAlso: ["Amazon Braket Hybrid Jobs", "Optimization loop"] },
];
