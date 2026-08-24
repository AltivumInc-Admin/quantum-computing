// SectionCard — a numbered curriculum module card for the welcome-page grid.
// Hue identity (number badge, gradient bleed, hover glow) is derived from the
// section index, so each card carries its own color end to end.
import * as React from "react";
import { SectionCard } from "quantum-ds";
import { getSections } from "@/lib/sections";

const sections = getSections();
const bySlug = (slug: string) => sections.find((s) => s.slug === slug)!;

// The card summary answers "what is this?" in a line or two (the async
// content-derived summary isn't available at bundle time, so these mirror it).
const SUMMARIES: Record<string, string> = {
  "01-foundations":
    "Qubits, superposition, entanglement, and measurement — learned by running real circuits on a browser simulator, not by staring at equations.",
  "03-algorithms":
    "Build the canon gate by gate: Deutsch-Jozsa, Grover search, the quantum Fourier transform, and phase estimation — and see where the speedup comes from.",
  "05-quantum-chemistry":
    "Map molecular Hamiltonians onto qubits and run VQE to find ground-state energies with OpenFermion — the application quantum computers were built for.",
};

function Card({ slug }: { slug: string }) {
  const s = bySlug(slug);
  return (
    <div style={{ padding: 20, maxWidth: 380 }}>
      <SectionCard
        slug={s.slug}
        index={s.index}
        title={s.title}
        summary={SUMMARIES[slug]}
        notebookCount={s.notebookCount}
      />
    </div>
  );
}

// Three real sections with distinct hues (index 1 -> 290, 3 -> 160, 5 -> 230).
export function Foundations() {
  return <Card slug="01-foundations" />;
}

export function Algorithms() {
  return <Card slug="03-algorithms" />;
}

export function Chemistry() {
  return <Card slug="05-quantum-chemistry" />;
}
