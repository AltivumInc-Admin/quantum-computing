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
// Six hues cycle across the seven sections — index 6 wraps back to the first hue.
export const sectionHue = [192, 290, 75, 160, 15, 230];

export function hueFor(index: number): number {
  return sectionHue[index % sectionHue.length];
}

export function getSections(): Section[] {
  return sections;
}

export function getSectionBySlug(slug: string): Section | undefined {
  return sections.find((s) => s.slug === slug);
}
