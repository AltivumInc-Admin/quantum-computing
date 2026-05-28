import fs from "fs/promises";
import path from "path";
import { getSectionBySlug } from "./sections";

const REPO_ROOT = path.resolve(process.cwd(), "..");

const BROWSER_RUNNABLE_MARKER = "<!-- browser-runnable -->";

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

  return summary.trim().slice(0, 300) || null;
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
    return Promise.all(
      ipynbs.map(async (filename) => ({
        filename,
        browserRunnable: await detectBrowserRunnable(
          path.join(notebooksDir, filename)
        ),
      }))
    );
  } catch {
    return [];
  }
}

async function detectBrowserRunnable(notebookPath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(notebookPath, "utf-8");
    const nb = JSON.parse(raw) as {
      cells?: Array<{ cell_type?: string; source?: string | string[] }>;
    };
    const firstMarkdown = (nb.cells ?? []).find(
      (c) => c.cell_type === "markdown"
    );
    if (!firstMarkdown) return false;
    const source = Array.isArray(firstMarkdown.source)
      ? firstMarkdown.source.join("")
      : firstMarkdown.source ?? "";
    return source.includes(BROWSER_RUNNABLE_MARKER);
  } catch {
    return false;
  }
}
