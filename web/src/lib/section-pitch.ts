/**
 * One hand-written pitch per curriculum section, shown in the sign-up gate
 * dialog on the welcome page. These are deliberately richer than the card
 * summaries (which come from each section's own content): the card answers
 * "what is this?", the pitch answers "why should I make an account for it?".
 *
 * Keyed by manifest slug. A section added to the curriculum without a pitch
 * falls back to its content summary, so the manifest stays the single source
 * of truth for what exists.
 */
const PITCHES: Record<string, string> = {
  "00-prereqs":
    "Every piece of math the curriculum uses, built from zero: complex numbers, vectors and matrices, probability, and the Python you need to drive it all. No physics degree assumed — finish this section and nothing later will feel like a leap.",
  "01-foundations":
    "Qubits, superposition, entanglement, and measurement — taught by running circuits, not by staring at equations. You will build your first Bell state in the browser and understand exactly why it cannot be explained classically.",
  "02-hardware":
    "What a qubit physically is: superconducting circuits, trapped ions, and neutral atoms, and how each trades speed against fidelity. You will explore Braket's real device catalog, see how noise shapes what each machine can run, and learn what QPU time actually costs before you ever spend a cent.",
  "03-algorithms":
    "The canon, hands-on: Deutsch-Jozsa, Grover search, the quantum Fourier transform, and phase estimation. Each notebook builds the algorithm gate by gate so you see where the quantum advantage comes from — and where it does not.",
  "04-quantum-ml":
    "Variational circuits as machine-learning models: encode data into quantum states, train parameterized gates with PennyLane, and judge honestly when a quantum model earns its keep against a classical baseline.",
  "05-quantum-chemistry":
    "The application quantum computers were invented for. Map molecular Hamiltonians onto qubits, run VQE to find ground-state energies, and simulate real molecules with OpenFermion — the largest section in the curriculum.",
  "06-hybrid-jobs":
    "From notebook to production: package quantum-classical workloads as Braket Hybrid Jobs with priority QPU access, checkpointing, and cost controls. This is how research code becomes something you can ship and re-run.",
};

export function pitchFor(slug: string, fallback: string): string {
  return PITCHES[slug] ?? fallback;
}
