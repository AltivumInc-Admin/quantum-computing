// CategoryChip — the hue-tinted pill linking a glossary term to the lesson that
// teaches it. It sets its own --hue from the section, so each chip carries that
// section's color identity. Passing real SectionSlug values from lib/glossary.
import { CategoryChip } from "quantum-ds";

// A spread of real sections, each a distinct hue (Foundations 290, Hardware 75,
// Quantum ML 15, Chemistry 230).
export function AcrossSections() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 20 }}>
      <CategoryChip section="01-foundations" />
      <CategoryChip section="02-hardware" />
      <CategoryChip section="04-quantum-ml" />
      <CategoryChip section="05-quantum-chemistry" />
    </div>
  );
}

// A single chip, as it appears inline under a glossary term.
export function Single() {
  return (
    <div style={{ padding: 20 }}>
      <CategoryChip section="03-algorithms" />
    </div>
  );
}
