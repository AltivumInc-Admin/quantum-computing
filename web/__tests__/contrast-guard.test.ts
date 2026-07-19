import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Repo-wide guard for the WCAG fix in Rec 1 (accessible filled accent). White
 * text on a solid `bg-accent` fill computes sub-AA (2.25:1 on the original
 * palette). The sanctioned primary CTA is `.surface-accent`, which since the
 * Instrument rebuild (#169) is a NEUTRAL high-contrast button — background
 * var(--btn-fill) with color var(--btn-ink), a near-white fill with near-black
 * text on the dark theme and the inverse on light, clearing AAA (16:1) on its
 * own fill in both themes. Olive is signal, never a button fill. The deepened
 * `bg-accent-dark` / `bg-accent-light` variants carry their own legible text
 * colors, and the translucent `bg-accent/<n>` tints are not solid fills.
 * (Token values themselves are computed and pinned by token-contrast.test.ts.)
 *
 * The single-constant test in widget-ui.test.tsx only protects primaryActionClass;
 * most CTAs carry an inline `surface-accent` string, so this scans every source
 * file and fails if a solid `bg-accent` fill is ever paired with white text again.
 */

const SRC = join(__dirname, "..", "src");

// Solid accent fill: `bg-accent` / `dark:bg-accent`, plus the gradient stops
// `from-accent` / `via-accent` / `to-accent` — a gradient built from the raw
// accent is the same sub-AA fill this guard exists to block (the mobile-nav
// FAB shipped through exactly that loophole). Still NOT `bg-accent-dark`,
// `bg-accent-light` (hyphen) or `bg-accent/40` (slash opacity = translucent).
const SOLID_ACCENT_FILL = /\b(?:bg|from|via|to)-accent\b(?![-/])/;
const WHITE_TEXT = /\btext-white\b/;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("contrast guard: no solid bg-accent + white text", () => {
  it("never pairs the sub-AA flat accent fill with white text in any source file", () => {
    const violations: string[] = [];
    for (const file of collectSourceFiles(SRC)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (SOLID_ACCENT_FILL.test(line) && WHITE_TEXT.test(line)) {
          violations.push(`${file.replace(SRC, "src")}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
