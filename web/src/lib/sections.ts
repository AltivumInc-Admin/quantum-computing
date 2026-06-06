import { getManifestSections } from "./manifest";

export interface Section {
  slug: string;
  title: string;
  index: number;
  dirName: string;
  notebookCount: number;
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
}));

export function getSections(): Section[] {
  return sections;
}

export function getSectionBySlug(slug: string): Section | undefined {
  return sections.find((s) => s.slug === slug);
}
