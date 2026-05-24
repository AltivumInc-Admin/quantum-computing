import fs from "fs/promises";
import path from "path";
import { getSectionBySlug } from "./sections";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export interface ContentData {
  markdown: string;
  title: string;
  notebooks: string[];
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

async function listNotebooks(dirName: string): Promise<string[]> {
  const notebooksDir = path.join(REPO_ROOT, dirName, "notebooks");
  try {
    const files = await fs.readdir(notebooksDir);
    return files.filter((f) => f.endsWith(".ipynb")).sort();
  } catch {
    return [];
  }
}
