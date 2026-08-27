import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the .eyebrow recipe's geometry and colors in globals.css.
 *
 * The re-theme moved the micro-label tier's typography OUT of ~30 inline
 * class strings and into this single recipe, which made globals.css the one
 * point of failure: the component tests now assert only that elements carry
 * the class (token-exact toHaveClass), so nothing element-level would fail if
 * the recipe itself lost its tracking, size, case, mono face, or gold pair.
 * This suite parses the rule out of the stylesheet — the same approach
 * token-contrast.test.ts takes for the token blocks — so the recipe cannot
 * be retuned or deleted silently.
 */

const css = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8")
  // Strip comments so prose mentioning the class can never confuse the parser.
  .replace(/\/\*[\s\S]*?\*\//g, "");

function rule(selector: string): string {
  const re = new RegExp(
    selector.replace(/[.\\]/g, (c) => "\\" + c) + String.raw`\s*\{([^}]*)\}`
  );
  const m = css.match(re);
  if (!m) throw new Error(`rule not found: ${selector}`);
  return m[1];
}

test(".eyebrow carries the full micro-label geometry", () => {
  const body = rule(".eyebrow");
  expect(body).toMatch(/font-family:\s*var\(--font-mono\)/);
  expect(body).toMatch(/font-size:\s*0\.625rem/);
  expect(body).toMatch(/font-weight:\s*500/);
  expect(body).toMatch(/text-transform:\s*uppercase/);
  expect(body).toMatch(/letter-spacing:\s*0\.2em/);
});

test(".eyebrow rides the sanctioned gold pair (accent-dark light, accent dark)", () => {
  expect(rule(".eyebrow")).toMatch(/color:\s*var\(--accent-dark\)/);
  expect(rule(".dark .eyebrow")).toMatch(/color:\s*var\(--accent\)/);
});

test("the tone modifiers restate color only — geometry lives in .eyebrow alone", () => {
  for (const mod of [".eyebrow-warm", ".eyebrow-mut"]) {
    const body = rule(mod);
    expect(body).toMatch(/color:/);
    // A modifier that grew its own typography would let callers drop the
    // base class without any test noticing — keep them color-only.
    expect(body).not.toMatch(/font-|letter-spacing|text-transform/);
  }
  expect(rule(".eyebrow-mut")).toMatch(/color:\s*var\(--mut\)/);
  expect(rule(".eyebrow-warm")).toMatch(/color:\s*var\(--warm-dark\)/);
});
