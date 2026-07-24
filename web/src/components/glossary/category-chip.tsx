"use client";

import type { CSSProperties } from "react";
import { TransitionLink } from "@/components/transition-link";
import { hueFor, getSectionBySlug } from "@/lib/sections";
import type { SectionSlug } from "@/lib/glossary";
import { useLocale } from "@/i18n";

// The hue chip linking a glossary term to the lesson that teaches it. Self-contained:
// it sets its own --hue so it renders correctly in any context (list or term page).
export function CategoryChip({ section }: { section: SectionSlug }) {
  const { t } = useLocale();
  const s = getSectionBySlug(section);
  const hue = s ? hueFor(s.index) : 192;
  const label = t(`glossaryUi.short.${section}`);
  return (
    <TransitionLink
      href={`/learn/${section}`}
      style={{ "--hue": hue } as CSSProperties}
      className="hue-soft-bg hue-text rounded-chip px-2 py-0.5 text-xs font-medium interactive focus-ring"
    >
      {label.startsWith("glossaryUi.") ? (s?.title ?? section) : label}
    </TransitionLink>
  );
}
