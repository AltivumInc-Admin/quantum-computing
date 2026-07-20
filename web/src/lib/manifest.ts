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
 * The JupyterLite lab landing route (web/public/lab/lab/index.html).
 *
 * This module is where the manifest-derived link helpers live (getRepoUrl,
 * isNotebookRunnable), so the lab route and the notebook label rule live here
 * too — ONE definition each. They used to exist twice: workspace.ts held a copy
 * whose docstring claimed NotebookLink was the source, while NotebookLink
 * re-derived both inline and imported neither, so changing the lab URL shape
 * meant finding both sites.
 */
export const LAB_INDEX_HREF = "/lab/lab/index.html";

/**
 * Humanise a notebook filename into its zero-padded index and display label:
 * "03-multi-qubit-gates.ipynb" -> { index: "03", label: "multi qubit gates" }.
 *
 * The extension is stripped with an ANCHORED pattern. NotebookLink's old inline
 * copy used `.replace(".ipynb", "")`, which removes the first occurrence
 * anywhere in the name — harmless for today's filenames, wrong for any future
 * one that repeats the token.
 */
export function humanizeNotebook(filename: string): { index: string; label: string } {
  const stem = filename.replace(/\.ipynb$/, "");
  const index = stem.match(/^(\d+)-/)?.[1] ?? "";
  const label = stem.replace(/^\d+-/, "").replace(/-/g, " ");
  return { index, label };
}

/** Deep link that opens one notebook in the in-browser lab. */
export function notebookHref(dirName: string, filename: string): string {
  return `${LAB_INDEX_HREF}?path=${encodeURIComponent(`${dirName}/notebooks/${filename}`)}`;
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
