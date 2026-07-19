// web/src/app/glossary/page.tsx
import type { Metadata } from "next";
import { Glossary } from "@/components/glossary/glossary";
import { GlossaryEntry } from "@/components/glossary/glossary-entry";
import { GLOSSARY } from "@/lib/glossary";

export const metadata: Metadata = {
  title: "Glossary — Quantum Computing Workspace",
  robots: { index: false, follow: false },
  description:
    "An A-Z reference of quantum computing terms, from qubits and gates to VQE and QAOA, each linked to the lesson that teaches it.",
};

export default function GlossaryPage() {
  // Every entry (markdown + KaTeX) is rendered HERE, on the server, at build —
  // the client <Glossary> only filters/shows these prerendered nodes, so the
  // react-markdown/rehype-katex pipeline never ships to the browser and a
  // search keystroke re-renders nothing but visibility.
  const entries = Object.fromEntries(
    GLOSSARY.map((term) => [term.term, <GlossaryEntry key={term.term} term={term} />])
  );
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-widest uppercase text-accent dark:text-accent-light mb-4">
            Reference
          </p>
          <h1 className="font-display text-display-2xl tracking-tight text-gray-900 dark:text-white">
            Glossary
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
            Look up any quantum computing term, A to Z. Each entry links to the lesson where it is taught.
          </p>
        </header>
        <Glossary entries={entries} />
      </div>
    </div>
  );
}
