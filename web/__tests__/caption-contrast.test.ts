import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Repo-wide guard for the muted text tier. The de-emphasized caption color must
 * be the shared, WCAG-AA `.text-caption` utility (gray-500 on light ~4.6:1,
 * gray-400 on the dark surface ~7.5:1), never one of the two sub-AA shapes that
 * used to be copy-pasted around:
 *
 *   1. INVERTED PAIR — `text-gray-400` with an equal-or-darker `dark:` variant
 *      (`dark:text-gray-400/500/600/700`). gray-400 on the light surface is
 *      2.49:1 and gray-500/600 on the dark surface are 4.05:1 / 2.59:1 — the
 *      pair fails at least one theme, usually both.
 *   2. THEME-BLIND MUTED — a bare `text-gray-400` or `text-gray-500` with no
 *      resting `dark:text-*` companion. gray-400 fails light mode (2.49:1);
 *      gray-500 fails dark mode (4.05:1). (A `dark:hover:text-*` does not
 *      count — the RESTING color still fails.)
 *
 * This supersedes the old quantum/-scoped, 18-file-allowlisted scan: it sweeps
 * ALL of src/components and src/app.
 *
 * Deliberate non-violations the rules already skip:
 *   - Variant-prefixed colors (`dark:`, `hover:`, `placeholder:` ...) as the
 *     matched token — only the resting light-theme color is rule input.
 *   - Opacity-modified colors (`text-gray-400/70`) — translucent SVG chart
 *     furniture, not the muted text tier (mirrors contrast-guard's treatment
 *     of `bg-accent/40` as non-solid).
 *   - Lines that pin a dark surface in both themes (unprefixed `bg-gray-800`/
 *     `bg-gray-900`, e.g. code-block chrome): gray-400 measures >=5.6:1 there.
 *
 * EXCEPTIONS below carry the two known dashed SVG reference strokes (an
 * asymptote line and a convergence marker) — decorative chart furniture, each
 * counted EXACTLY so a new occurrence in those files still fails.
 */

const SRC = join(__dirname, "../src");
const ROOTS = [join(SRC, "components"), join(SRC, "app")];
const GLOBALS = join(SRC, "app/globals.css");

// file (relative to src/) -> number of tolerated INVERTED-pair occurrences.
const EXCEPTIONS: Record<string, number> = {
  "components/quantum/pes-explorer.tsx": 1, // dashed dissociation-asymptote stroke
  "components/quantum/vqe-explorer.tsx": 1, // dashed exact-energy reference stroke
};

// Resting (unprefixed) light-theme muted gray, ignoring opacity-modified tokens.
const BASE_GRAY_400 = /(?<![:\w-])text-gray-400\b(?!\/)/;
const BASE_MUTED = /(?<![:\w-])text-gray-(400|500)\b(?!\/)/;
// Resting dark-theme text color (dark:hover:text-* etc. deliberately excluded).
const RESTING_DARK_TEXT = /\bdark:text-/;
const DARK_EQUAL_OR_DARKER = /\bdark:text-gray-(400|500|600|700)\b/;
// Unprefixed pinned-dark surface on the same element.
const PINNED_DARK_BG = /(?<![:\w-])bg-gray-(800|900)\b/;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("globals.css defines .text-caption with the AA-passing muted token", () => {
  // Instrument migration: the muted caption tier is now the theme-aware --mut
  // token (6.4:1 on the dark smoke surface, 6.5:1 on the light surface —
  // computed and pinned by token-contrast.test.ts) rather than the old
  // gray-500/gray-400 pair. Still a single shared utility, still provably
  // WCAG-AA in both themes.
  const css = readFileSync(GLOBALS, "utf8");
  expect(css).toContain(".text-caption");
  expect(css).toMatch(/\.text-caption\s*\{[^}]*var\(--mut\)/);
});

test("no sub-AA muted gray anywhere in src/components or src/app", () => {
  const violations: string[] = [];
  const exceptionHits: Record<string, number> = {};

  for (const root of ROOTS) {
    for (const file of collectSourceFiles(root)) {
      const rel = file.slice(SRC.length + 1);
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const inverted = BASE_GRAY_400.test(line) && DARK_EQUAL_OR_DARKER.test(line);
          const themeBlind =
            !inverted &&
            BASE_MUTED.test(line) &&
            !RESTING_DARK_TEXT.test(line) &&
            !PINNED_DARK_BG.test(line);
          if (!inverted && !themeBlind) return;
          if (inverted && rel in EXCEPTIONS) {
            exceptionHits[rel] = (exceptionHits[rel] ?? 0) + 1;
            return;
          }
          violations.push(
            `${rel}:${i + 1} [${inverted ? "inverted pair" : "no dark: variant"}] ${line.trim()}`
          );
        });
    }
  }

  // Every tolerated SVG-stroke occurrence must still exist in its exact count —
  // one added or removed means this list is stale and must be re-audited.
  expect(exceptionHits).toEqual(EXCEPTIONS);
  expect(violations).toEqual([]);
});
