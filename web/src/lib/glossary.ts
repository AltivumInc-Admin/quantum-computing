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
  { term: "Amplitude", section: "00-prereqs", aliases: ["probability amplitude"],
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
    definition: "A single-qubit gate that maps $\\ket{0}$ to the equal superposition $(\\ket{0}+\\ket{1})/\\sqrt2$.",
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
];
