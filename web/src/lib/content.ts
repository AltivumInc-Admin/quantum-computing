import fs from "fs/promises";
import path from "path";
import { getSectionBySlug } from "./sections";
import { isNotebookRunnable } from "./manifest";
import { stripLinksAndEmphasis } from "./strip-inline";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export type GuideLocale = "en" | "es";

export interface NotebookEntry {
  filename: string;
  browserRunnable: boolean;
}

export interface ContentData {
  markdown: string;
  /** Spanish GUIDE when GUIDE.es.md exists; otherwise same as markdown (en). */
  markdownEs: string;
  notebooks: NotebookEntry[];
}

// Read the section GUIDE for a locale. English: GUIDE.md. Spanish: GUIDE.es.md
// with fallback to English so a missing translation never 404s the lesson.
async function readGuide(
  slug: string,
  locale: GuideLocale = "en",
): Promise<string | null> {
  const section = getSectionBySlug(slug);
  if (!section) return null;
  const fileName = locale === "es" ? "GUIDE.es.md" : "GUIDE.md";
  const guidePath = path.join(REPO_ROOT, section.dirName, fileName);
  try {
    return await fs.readFile(guidePath, "utf-8");
  } catch {
    if (locale === "es") {
      // Fall back to English when Spanish guide is absent.
      return readGuide(slug, "en");
    }
    return null;
  }
}

export async function getContent(slug: string): Promise<ContentData | null> {
  const section = getSectionBySlug(slug);
  if (!section) return null;

  const markdown = await readGuide(slug, "en");
  if (markdown === null) return null;
  const markdownEs = (await readGuide(slug, "es")) ?? markdown;

  // No title field: the rendered lesson title comes from the GUIDE's own h1
  // via MarkdownRenderer, and metadata titles come from sections.ts.
  const notebooks = await listNotebooks(section.dirName);
  return { markdown, markdownEs, notebooks };
}

export async function getContentSummary(slug: string): Promise<string | null> {
  const markdown = await readGuide(slug, "en");
  if (markdown === null) return null;

  const lines = markdown.split("\n");
  let summary = "";
  let foundHeading = false;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      foundHeading = true;
      continue;
    }
    if (foundHeading && line.trim() === "") continue;
    if (foundHeading && line.startsWith("## ")) break;
    if (foundHeading && line.trim()) {
      summary += line.trim() + " ";
    }
  }

  // If no intro paragraph before first ##, extract from first subsection
  if (!summary.trim()) {
    let inFirstSection = false;
    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (inFirstSection) break;
        inFirstSection = true;
        continue;
      }
      if (inFirstSection && line.trim() === "") continue;
      if (inFirstSection && line.startsWith("- ")) {
        summary += line.replace(/^- /, "").trim() + ". ";
      } else if (inFirstSection && line.trim()) {
        summary += line.trim() + " ";
      }
    }
  }

  return stripInlineMarkdown(summary.trim()).slice(0, 300).trim() || null;
}

// Section cards show plain-text teasers, so strip inline Markdown that would
// otherwise render literally (e.g. `**describe**` or `[text](url)`) on the
// landing page. The link/code/asterisk core is shared with extract-headings'
// TOC-label stripper; only the underscore emphasis is teaser-specific.
function stripInlineMarkdown(text: string): string {
  return stripLinksAndEmphasis(text)
    .replace(/__([^_]+)__/g, "$1") // __bold__ -> bold
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2"); // _italic_ -> italic
}

async function listNotebooks(dirName: string): Promise<NotebookEntry[]> {
  const notebooksDir = path.join(REPO_ROOT, dirName, "notebooks");
  try {
    const files = await fs.readdir(notebooksDir);
    const ipynbs = files.filter((f) => f.endsWith(".ipynb")).sort();
    // Runnable status comes from the generated manifest, so the green "Run in
    // browser" button matches exactly what CI validated (marked AND passing the
    // qcsim contract) rather than the weaker marker-only check this used to do.
    return ipynbs.map((filename) => ({
      filename,
      browserRunnable: isNotebookRunnable(dirName, filename),
    }));
  } catch {
    return [];
  }
}
