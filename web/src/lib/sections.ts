import { getManifestSections } from "./manifest";

export interface Section {
  slug: string;
  title: string;
  index: number;
  dirName: string;
  notebookCount: number;
  /** How many of the section's notebooks are browser-runnable (manifest-verified). */
  runnableCount: number;
}

// Derived from the generated content manifest (the single source of truth).
// Titles, ordering, and notebook counts come from scripts/validate_runnable.py
// so this file can never drift from the actual curriculum on disk.
const sections: Section[] = getManifestSections().map((s) => ({
  slug: s.slug,
  title: s.title,
  index: s.index,
  dirName: s.dirName,
  notebookCount: s.notebookCount,
  runnableCount: s.notebooks.filter((n) => n.runnable).length,
}));

// One hue per section (oklch hue angle). Single source of truth shared by the
// home cards (SectionCard) and the lesson chrome (sidebar active pill, TOC rail,
// dividers, completion toggle), so a section keeps one color identity end to end.
// One hue per section, no wrap: eight entries for eight sections, so no two
// sections share a color. 330 was PREPENDED when 00-linear-algebra became the
// first module, which keeps the six that follow on the exact hues they shipped
// with. 06-hybrid-jobs gains 120 of its own; it previously reached 192 only by
// wrapping onto 00-prereqs' hue, so it was never unique to begin with.
// Contrast is computed, not assumed — see __tests__/token-contrast.test.ts.
export const sectionHue = [330, 192, 290, 75, 160, 15, 230, 120];

export function hueFor(index: number): number {
  return sectionHue[index % sectionHue.length];
}

export function getSections(): Section[] {
  return sections;
}

export function getSectionBySlug(slug: string): Section | undefined {
  return sections.find((s) => s.slug === slug);
}
