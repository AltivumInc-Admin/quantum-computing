import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the two CSS invariants CodeBlock's behaviour silently depends on. Both
 * were broken in the shipped export and neither was visible to any component
 * test, because jsdom applies no stylesheets at all: the components rendered the
 * right markup while the cascade quietly did something else.
 *
 * 1. THE <pre> MUST BE THE SOLE HORIZONTAL SCROLLER. highlight.js's theme ships
 *    `pre code.hljs { display:block; overflow-x:auto; padding:1em }`. With that
 *    live, the <code> child absorbs the overflow and the <pre> never overflows —
 *    so CodeBlock's measurement (which gates the WCAG 2.1.1 / 1.4.10 keyboard
 *    scroll-region exposure) reads a permanent false and no wide fence is ever
 *    focusable or labelled. Measured on the shipped export at a 380px viewport:
 *    pre.scrollWidth 344 === pre.clientWidth 344, while the child code reported
 *    scrollWidth 582 vs clientWidth 312 and was the element that scrolled; the
 *    pre reported role=null and tabindex=null.
 *
 * 2. THE FENCE RECIPE LIVES IN ONE PLACE. A hand-written `.prose pre` rule in
 *    globals.css carried no not-prose exclusion (that guard only ships on
 *    @tailwindcss/typography's own `:where(...)` selectors), so it reached
 *    CodeBlock's inner <pre> straight through the not-prose wrapper and painted
 *    a second background, border and radius on every fence of every lesson.
 */

const SRC = join(__dirname, "../src");
const THEME_CSS = join(SRC, "components/code-block-theme.css");
const GLOBALS = join(SRC, "app/globals.css");
const CODE_BLOCK = join(SRC, "components/code-block.tsx");
const VENDOR_THEME = join(
  __dirname,
  "../node_modules/highlight.js/styles/github-dark.css"
);

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("the <pre> owns the fence's horizontal overflow", () => {
  it("the vendor theme still hands overflow to the <code> (guard is live)", () => {
    // If a highlight.js upgrade ever drops this rule, this case fails first and
    // tells the next maintainer the neutralizer below may be retired — rather
    // than leaving a dead override nobody dares touch.
    const vendor = stripComments(readFileSync(VENDOR_THEME, "utf8"));
    expect(vendor).toMatch(/pre\s+code\.hljs\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("code-block-theme.css neutralizes it AFTER importing the theme", () => {
    const css = stripComments(readFileSync(THEME_CSS, "utf8"));
    const importAt = css.indexOf('@import "highlight.js/styles/github-dark.css"');
    expect(importAt).toBeGreaterThanOrEqual(0);

    const resetMatch = css.match(/pre\s+code\.hljs\s*\{[^}]*\}/);
    expect(resetMatch).not.toBeNull();
    // Same origin and same specificity as the vendor rule, so the LATER
    // declaration wins — the reset must not sit above the import.
    expect(resetMatch!.index!).toBeGreaterThan(importAt);
    expect(resetMatch![0]).toMatch(/overflow:\s*visible/);
    // The other two box rules the fence chrome owns instead.
    expect(resetMatch![0]).toMatch(/padding:\s*0/);
    expect(resetMatch![0]).toMatch(/background:\s*transparent/);
  });

  it("the theme is route-scoped to code-block.tsx, not the global sheet", () => {
    // Keeping both the import and its reset in ONE file is what makes the
    // ordering above a CSS-spec guarantee rather than a chunk-emission
    // coincidence; it also keeps the theme off the 118 exported pages that
    // render no fences at all.
    expect(readFileSync(CODE_BLOCK, "utf8")).toContain('import "./code-block-theme.css"');
    expect(stripComments(readFileSync(GLOBALS, "utf8"))).not.toContain("highlight.js/styles");
  });
});

describe("the dark code-slab recipe is not duplicated in globals.css", () => {
  const globals = stripComments(readFileSync(GLOBALS, "utf8"));

  it("has no `.prose pre` block recipe", () => {
    // `.prose pre ::selection` is a different rule and stays.
    expect(globals).not.toMatch(/\.prose\s+pre\s*\{/);
  });

  it("has no `.prose pre code` color rule", () => {
    expect(globals).not.toMatch(/\.prose\s+pre\s+code\s*\{/);
  });
});
