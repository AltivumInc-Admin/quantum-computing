import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * THE MARKDOWN PIPELINE MUST NEVER BE REACHABLE FROM A CLIENT COMPONENT.
 *
 * react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight
 * is the heaviest thing this app can import, and it only ever needs to run at
 * build time: a GUIDE and a glossary entry are both fixed strings. Two modules
 * wrap it — markdown-renderer.tsx (lesson bodies) and glossary/inline-markdown.tsx
 * (term definitions) — and both are Server Components whose output is passed
 * into client shells as props.
 *
 * A `"use client"` module that imports either one drags the whole pipeline into
 * the browser bundle. That is not hypothetical: it is what this repo shipped
 * until 2026-09-05. term-detail.tsx and lesson-body.tsx were both "use client"
 * and both imported a renderer directly, putting a 384 KB (112 KB gz) chunk on
 * 96 of 126 exported pages, plus a second 221 KB (63 KB gz) highlight.js chunk
 * on the seven lesson pages.
 *
 * inline-markdown.tsx had stated the rule in a comment since it was written —
 * "Keep it out of \"use client\" modules or the pipeline is dragged back onto
 * every glossary page" — and the rule was broken anyway, in two files, and
 * stayed broken until someone measured the bundle. A comment is not a guard.
 * This is the guard.
 *
 * If this fails on your change: render the markdown in the SERVER page
 * component and pass the resulting node into your client component as a prop.
 * learn/[section]/page.tsx and glossary/[term]/page.tsx both show the shape.
 * Do not add an exemption here.
 */

const REPO = join(__dirname, "..", "..");
const SRC = join(REPO, "src");

/** The two Server Components that own the pipeline, by import specifier. */
const SERVER_ONLY = [
  "@/components/markdown-renderer",
  "@/components/glossary/inline-markdown",
  // Relative spellings of the same two, as a sibling or a parent would write them.
  "./markdown-renderer",
  "../markdown-renderer",
  "./inline-markdown",
  "../glossary/inline-markdown",
];

/** The pipeline packages themselves — importing one directly is the same defect. */
const PIPELINE_PACKAGES = [
  "react-markdown",
  "remark-gfm",
  "remark-math",
  "rehype-katex",
  "rehype-highlight",
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(name)) acc.push(full);
  }
  return acc;
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** "use client" only counts as a directive when it is the file's first statement. */
const isClientModule = (src: string) =>
  /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*["']use client["']/.test(src);

const files = walk(SRC);

describe("the markdown pipeline stays out of the client bundle", () => {
  it("finds source files to scan", () => {
    // A broken walk would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(50);
  });

  it("has at least one client module to be wrong about", () => {
    // Same reason: if isClientModule stopped matching, the scan proves nothing.
    expect(files.filter((f) => isClientModule(readFileSync(f, "utf8"))).length).toBeGreaterThan(10);
  });

  it("no \"use client\" module imports a markdown renderer or the pipeline itself", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const raw = readFileSync(file, "utf8");
      if (!isClientModule(raw)) continue;
      const code = stripComments(raw);

      for (const spec of [...SERVER_ONLY, ...PIPELINE_PACKAGES]) {
        // Match the specifier only in an import/require position, so a mention
        // in a string of prose or a className cannot trip this.
        const quoted = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(
          `(?:from|import|require\\()\\s*["']${quoted}["']`,
        );
        if (pattern.test(code)) offenders.push(`${relative(REPO, file)} -> ${spec}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("the two renderer modules are not themselves client components", () => {
    for (const rel of ["src/components/markdown-renderer.tsx", "src/components/glossary/inline-markdown.tsx"]) {
      const src = readFileSync(join(REPO, rel), "utf8");
      expect({ file: rel, isClient: isClientModule(src) }).toEqual({ file: rel, isClient: false });
    }
  });
});
