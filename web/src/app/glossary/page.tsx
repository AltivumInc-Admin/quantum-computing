// web/src/app/glossary/page.tsx
import type { Metadata } from "next";
import { Glossary } from "@/components/glossary/glossary";
import { GlossaryEntry } from "@/components/glossary/glossary-entry";
import { GlossaryPageHeader } from "@/components/glossary/glossary-page-header";
import { GLOSSARY } from "@/lib/glossary";
import { GLOSSARY_ES, GLOSSARY_TERM_ES } from "@/lib/glossary-es";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Glossary — ${SITE_NAME}`,
  robots: { index: false, follow: false },
  description:
    "An A-Z reference of quantum computing terms, from qubits and gates to VQE and QAOA, each linked to the lesson that teaches it.",
};

export default function GlossaryPage() {
  // Every entry (markdown + KaTeX) is rendered HERE, on the server, at build —
  // once in English and once in Spanish. The client <Glossary> only picks which
  // set to show from the learner's locale, so the pipeline never ships to the
  // browser and a search keystroke re-renders nothing but visibility.
  const entriesEn = Object.fromEntries(
    GLOSSARY.map((term) => [
      term.term,
      <GlossaryEntry
        key={`en-${term.term}`}
        term={term}
        seeAlsoLabels={Object.fromEntries(
          (term.seeAlso ?? []).map((r) => [r, r]),
        )}
      />,
    ]),
  );
  const entriesEs = Object.fromEntries(
    GLOSSARY.map((term) => [
      term.term,
      <GlossaryEntry
        key={`es-${term.term}`}
        term={term}
        displayTerm={GLOSSARY_TERM_ES[term.term] ?? term.term}
        definition={GLOSSARY_ES[term.term] ?? term.definition}
        seeAlsoLabels={Object.fromEntries(
          (term.seeAlso ?? []).map((r) => [r, GLOSSARY_TERM_ES[r] ?? r]),
        )}
      />,
    ]),
  );
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <GlossaryPageHeader />
        <Glossary entriesEn={entriesEn} entriesEs={entriesEs} />
      </div>
    </div>
  );
}
