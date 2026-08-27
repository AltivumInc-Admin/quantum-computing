import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Repo-wide ban on synthetic bold over Geist Mono.
 *
 * layout.tsx loads Geist Mono at weights 400/500 ONLY (the type system's
 * "everything measured is mono, never bolder than medium" rule), so
 * font-semibold/font-bold on a font-mono element renders browser-synthesized
 * faux bold — visibly smeared at the 10-13px sizes the mono tier uses. The
 * re-theme swept every existing instance to font-medium; this guard keeps
 * the pattern from growing back. Line-based like contrast-guard: the two
 * classes virtually always share the className string.
 */

const SRC = join(__dirname, "../src");

const MONO = /\bfont-mono\b/;
const HEAVY = /\bfont-(?:semibold|bold)\b/;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("no font-semibold/font-bold shares a line with font-mono", () => {
  const violations: string[] = [];
  for (const file of collectSourceFiles(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (MONO.test(line) && HEAVY.test(line)) {
          violations.push(`${file.slice(SRC.length + 1)}:${i + 1}  ${line.trim()}`);
        }
      });
  }
  expect(violations).toEqual([]);
});
