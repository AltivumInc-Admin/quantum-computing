/**
 * The hero's curriculum dial is a full-bleed <svg> pinned over the whole hero
 * (`absolute inset-0`), and an <svg> root hit-tests across its entire box, not
 * just where something is painted. So unless the root opts out of pointer
 * events, it sits on top of the hero's own controls and swallows every click:
 * "Sign up free", "Sign in" and "Explore the curriculum" all became unclickable
 * at md+ widths this way, while the same buttons worked on phones because the
 * dial is `hidden md:block`.
 *
 * jsdom cannot hit-test, and a screenshot test would not catch it either, so
 * this reads the source and pins the two halves of the contract that keep the
 * dial interactive without letting it eat the hero:
 *
 *   1. the full-bleed root is pointer-events-none, and
 *   2. every station <g role="button"> turns pointer events back on for itself.
 *
 * Breaking either half reproduces the bug, so both are asserted.
 */

import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(join(__dirname, "../../../src/components/welcome/hero.tsx"), "utf8");

describe("hero dial does not swallow the hero's own controls", () => {
  it("pins the full-bleed dial svg behind pointer events", () => {
    const rootClass = SOURCE.match(/className="([^"]*absolute inset-0 z-20[^"]*)"/)?.[1];
    expect(rootClass).toBeDefined();
    expect(rootClass).toContain("pointer-events-none");
  });

  it("gives every station control its pointer events back", () => {
    // The station <g> is the only role="button" in the dial; without an
    // explicit opt-in it inherits `none` from the root and the dial goes dead.
    const start = SOURCE.indexOf("<g\n                key={s.slug}");
    expect(start).toBeGreaterThan(-1);
    const station = SOURCE.slice(start, SOURCE.indexOf("<title>", start));
    expect(station).toMatch(/role="button"/);
    expect(station).toMatch(/pointerEvents:\s*"auto"|pointer-events-auto/);
  });

  it("keeps the hero's own CTAs out of any full-bleed overlay", () => {
    // A second full-bleed layer that paints over the CTA row must opt out too.
    // Every `absolute inset-0` layer in the hero is either pointer-events-none
    // or has an explicit reason recorded next to it.
    const layers = [...SOURCE.matchAll(/className="([^"]*absolute inset-0[^"]*)"/g)].map((m) => m[1]);
    expect(layers.length).toBeGreaterThan(0);
    for (const cls of layers) {
      expect(cls).toContain("pointer-events-none");
    }
  });
});
