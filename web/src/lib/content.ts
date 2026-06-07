import fs from "fs/promises";
import path from "path";
import { getSectionBySlug } from "./sections";
import { isNotebookRunnable } from "./manifest";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export interface NotebookEntry {
  filename: string;
  browserRunnable: boolean;
}

export interface ContentData {
  markdown: string;
  title: string;
  notebooks: NotebookEntry[];
}

export async function getContent(slug: string): Promise<ContentData | null> {
  const section = getSectionBySlug(slug);
  if (!section) return null;

  const guidePath = path.join(REPO_ROOT, section.dirName, "GUIDE.md");

  try {
    const markdown = await fs.readFile(guidePath, "utf-8");
    const title = extractTitle(markdown);
    const notebooks = await listNotebooks(section.dirName);
    return { markdown, title, notebooks };
  } catch {
    return null;
  }
}

export async function getContentSummary(slug: string): Promise<string | null> {
  const content = await getContent(slug);
  if (!content) return null;

  const lines = content.markdown.split("\n");
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
// landing page. Order matters: links and code first, then bold before italic.
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) / ![alt](url) -> text
    .replace(/`([^`]+)`/g, "$1") // `code` -> code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** -> bold
    .replace(/\*([^*]+)\*/g, "$1") // *italic* -> italic
    .replace(/__([^_]+)__/g, "$1") // __bold__ -> bold
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2"); // _italic_ -> italic
}

function extractTitle(markdown: string): string {
  const match = markdown.match(/^# (.+)$/m);
  return match ? match[1] : "Untitled";
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
