import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Binds layout.tsx's viewport.themeColor to the token system. The themeColor
 * hexes are the one palette literal that ships straight to browser chrome
 * (mobile toolbar/status bar) with no CSS in between — during the olive era
 * they were hand-rendered from the surface tokens and nothing would have
 * flagged them if a retune left them behind. This suite re-derives them:
 * each entry must equal the --surface-base of its theme, byte-for-byte.
 */

const layout = readFileSync(join(__dirname, "../../src/app/layout.tsx"), "utf8");
const css = readFileSync(join(__dirname, "../../src/app/globals.css"), "utf8")
  // Strip comments so prose mentioning tokens can never confuse the parser.
  .replace(/\/\*[\s\S]*?\*\//g, "");

function surfaceBase(selector: string): string {
  const block = css.match(
    new RegExp(selector.replace(/\./g, "\\.") + String.raw`\s*\{([\s\S]*?)\n  \}`)
  );
  if (!block) throw new Error(`token block not found for ${selector}`);
  const m = block[1].match(/--surface-base:\s*([^;]+);/);
  if (!m) throw new Error(`--surface-base not found in ${selector}`);
  return m[1].trim().toLowerCase();
}

function themeColor(scheme: "light" | "dark"): string {
  const m = layout.match(
    new RegExp(
      String.raw`prefers-color-scheme:\s*${scheme}\)",\s*color:\s*"(#[0-9a-fA-F]{6})"`
    )
  );
  if (!m) throw new Error(`themeColor entry for ${scheme} not found`);
  return m[1].toLowerCase();
}

test("light themeColor is the light --surface-base", () => {
  expect(themeColor("light")).toBe(surfaceBase(":root"));
});

test("dark themeColor is the dark --surface-base", () => {
  expect(themeColor("dark")).toBe(surfaceBase(".dark"));
});
