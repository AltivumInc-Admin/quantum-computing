import type { CSSProperties } from "react";
import { TransitionLink } from "@/components/transition-link";
import { hueFor, getSectionBySlug } from "@/lib/sections";
import { sectionShortLabel, type SectionSlug } from "@/lib/glossary";

// The hue chip linking a glossary term to the lesson that teaches it. Self-contained:
// it sets its own --hue so it renders correctly in any context (list or term page).
export function CategoryChip({ section }: { section: SectionSlug }) {
  const s = getSectionBySlug(section);
  const hue = s ? hueFor(s.index) : 192;
  return (
    <TransitionLink
      href={`/learn/${section}`}
      style={{ "--hue": hue } as CSSProperties}
      className="hue-soft-bg hue-text rounded-chip px-2 py-0.5 text-xs font-medium interactive focus-ring"
    >
      {sectionShortLabel(section)}
    </TransitionLink>
  );
}
