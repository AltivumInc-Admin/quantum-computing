// Single import point for the generated content manifest
// (web/src/lib/content-manifest.json), the curriculum's source of truth.
//
// The manifest is produced by `scripts/validate_runnable.py --write-manifest`
// from the repo's GUIDE.md headings, real notebook counts, and the qcsim
// contract scan. Both sections.ts and content.ts derive from it so the catalog
// can never drift, and the "Run in browser" gate matches exactly what CI
// validated (a notebook is runnable iff it is marked AND clears the contract).

import manifest from "./content-manifest.json";

export interface ManifestNotebook {
  filename: string;
  runnable: boolean;
}

export interface ManifestSection {
  slug: string;
  dirName: string;
  title: string;
  index: number;
  notebookCount: number;
  notebooks: ManifestNotebook[];
}

export function getManifestSections(): ManifestSection[] {
  return manifest.sections;
}

export function getManifestSection(slug: string): ManifestSection | undefined {
  return manifest.sections.find((s) => s.slug === slug);
}

/** The qcsim wheel filename the in-browser lab installs (e.g. for graders). */
export function getWheelName(): string {
  return manifest.wheel;
}

/** Canonical GitHub repo URL for "View on GitHub" links. */
export function getRepoUrl(): string {
  return manifest.repoUrl;
}

/**
 * Whether a notebook ships a green "Run in browser" action. True iff the
 * notebook is present in the manifest with runnable=true — i.e. it is marked
 * browser-runnable AND passed the static qcsim contract scan.
 */
export function isNotebookRunnable(dirName: string, filename: string): boolean {
  const section = manifest.sections.find((s) => s.dirName === dirName);
  if (!section) return false;
  const nb = section.notebooks.find((n) => n.filename === filename);
  return nb?.runnable ?? false;
}
