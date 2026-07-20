import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Computed WCAG guard for the Instrument token system (globals.css).
 *
 * The other two guards are class-string greps: contrast-guard blocks the
 * `bg-accent`+`text-white` pairing and caption-contrast pins `.text-caption`
 * to var(--mut) — neither ever evaluates a color VALUE, so retuning an oklch
 * token could silently break AA in one theme while both suites stay green
 * (the pre-fix light `--accent` shipped commented "legible on light bg" at an
 * actual 2.79:1). This suite closes that hole: it parses the light and dark
 * token blocks out of globals.css and computes real WCAG contrast ratios
 * (oklch -> OKLab -> linear sRGB -> relative luminance) for every pairing the
 * token comments promise, in BOTH themes.
 *
 * Thresholds are WCAG levels only — 4.5:1 (AA text), 7:1 (AAA text where the
 * comment claims it), 3:1 (non-text / focus indicators). Never assert below
 * the WCAG floor to make a bad value pass: if a retune fails here, fix the
 * token or re-route the usage (e.g. resting accent TEXT on the light theme
 * uses --accent-dark, never the 2.79:1 --accent).
 */

const cssRaw = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
// Strip comments so prose mentioning `--token:` can never confuse the parser.
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, "");

type Vars = Record<string, string>;

function themeBlock(selector: string): Vars {
  // Matches the `:root {` / `.dark {` token blocks inside @layer base; both
  // close with a two-space-indented brace and contain no nested rules.
  const re = new RegExp(
    selector.replace(/\./g, "\\.") + String.raw`\s*\{([\s\S]*?)\n  \}`
  );
  const m = css.match(re);
  if (!m) throw new Error(`token block not found for ${selector}`);
  const vars: Vars = {};
  for (const d of m[1].matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
    vars[d[1]] = d[2].replace(/\s+/g, " ").trim();
  }
  return vars;
}

function resolve(value: string, vars: Vars, depth = 0): string {
  if (depth > 8) throw new Error(`var() resolution loop in "${value}"`);
  const m = value.match(/var\(--([a-zA-Z0-9-]+)\)/);
  if (!m) return value;
  const inner = vars[m[1]];
  if (!inner) throw new Error(`unresolvable var(--${m[1]})`);
  return resolve(value.replace(m[0], inner), vars, depth + 1);
}

type Oklch = [L: number, C: number, H: number];

function parseOklch(raw: string, vars: Vars): Oklch {
  const value = resolve(raw, vars);
  const m = value.match(
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/
  );
  if (!m) {
    // An alpha channel means the token is translucent — its rendered color
    // depends on what is behind it, so it must never be asserted here.
    throw new Error(`not an opaque oklch color: "${value}"`);
  }
  const L = parseFloat(m[1]) / (m[2] === "%" ? 100 : 1);
  return [L, parseFloat(m[3]), parseFloat(m[4])];
}

// oklch -> OKLab -> LMS -> linear sRGB (Björn Ottosson's reference matrices).
function toLinearSrgb([L, C, Hdeg]: Oklch): [number, number, number] {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

// WCAG relative luminance takes LINEARIZED sRGB channels — which is exactly
// what the OKLab pipeline already yields, so no gamma round-trip is needed.
function luminance(c: Oklch): number {
  const [r, g, b] = toLinearSrgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(c1: Oklch, c2: Oklch): number {
  const [hi, lo] = [luminance(c1), luminance(c2)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// Tailwind v4's gray-950 (node_modules/tailwindcss/theme.css) — the pinned
// dark ink of .chip-selected.
const GRAY_950: Oklch = [0.13, 0.028, 261.692];

const light = themeBlock(":root");
const dark = themeBlock(".dark");
const SURFACES = ["surface-base", "surface-1", "surface-2"] as const;

function ratio(vars: Vars, fg: string, bg: string): number {
  return contrast(parseOklch(vars[fg], vars), parseOklch(vars[bg], vars));
}

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s theme token contrast", (name, vars) => {
  // Body/heading ink: AAA body text on every app surface.
  it.each(SURFACES)("--ink on --%s is AAA (>= 7:1)", (s) => {
    expect(ratio(vars, "ink", s)).toBeGreaterThanOrEqual(7);
  });

  // Muted/caption tier: AA on every app surface (the .text-caption promise).
  it.each(SURFACES)("--mut on --%s is AA (>= 4.5:1)", (s) => {
    expect(ratio(vars, "mut", s)).toBeGreaterThanOrEqual(4.5);
  });

  // The neutral primary CTA: .surface-accent's ink on its own fill, AAA.
  it("--btn-ink on --btn-fill is AAA (>= 7:1)", () => {
    expect(ratio(vars, "btn-ink", "btn-fill")).toBeGreaterThanOrEqual(7);
  });

  // .chip-selected: pinned gray-950 ink on the theme's --accent fill.
  it("gray-950 on --accent (.chip-selected) is AA (>= 4.5:1)", () => {
    expect(contrast(GRAY_950, parseOklch(vars.accent, vars))).toBeGreaterThanOrEqual(4.5);
  });

  // Focus indicator (.focus-ring): solid --focus against every surface the
  // ring can sit on — WCAG 1.4.11 non-text minimum.
  it.each(SURFACES)("--focus against --%s is >= 3:1", (s) => {
    expect(ratio(vars, "focus", s)).toBeGreaterThanOrEqual(3);
  });
});

describe("resting accent TEXT", () => {
  // The sanctioned resting accent-text idiom is `text-accent-dark
  // dark:text-accent` / `dark:text-accent-light` (eyebrows, micro-labels,
  // A-Z glossary headings). Light-theme resting text must NEVER be the raw
  // --accent: it computes 2.79:1 on --surface-base.
  it.each(SURFACES)("light --accent-dark on --%s is AA (>= 4.5:1)", (s) => {
    expect(ratio(light, "accent-dark", s)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES)("dark --accent on --%s is AA (>= 4.5:1)", (s) => {
    expect(ratio(dark, "accent", s)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES)("dark --accent-light on --%s is AA (>= 4.5:1)", (s) => {
    expect(ratio(dark, "accent-light", s)).toBeGreaterThanOrEqual(4.5);
  });

  it("documents why light --accent is fill/signal only (fails AA as text)", () => {
    // Not an assertion that it must fail — a tripwire: if the light accent is
    // ever retuned to clear AA on the base surface, this test flags that the
    // accent-dark re-route (and this suite's split) can be revisited.
    expect(ratio(light, "accent", "surface-base")).toBeLessThan(4.5);
  });
});

describe("meaningful accent GRAPHICS (WCAG 1.4.11 non-text, >= 3:1)", () => {
  // Information-bearing, non-text accent graphics — the shots sampler's
  // exact-probability marker and its legend swatch, the BlochDial state-vector
  // line/tip, the .slider thumb — take the 3:1 non-text floor, one tier below
  // the 4.5:1 text floor above. They pair down on light exactly like the text
  // tier does; the raw light --accent is decorative-only (dots, chip fills).
  it.each(SURFACES)("light --accent-dark on --%s is >= 3:1", (s) => {
    expect(ratio(light, "accent-dark", s)).toBeGreaterThanOrEqual(3);
  });

  it.each(SURFACES)("dark --accent-light on --%s is >= 3:1", (s) => {
    expect(ratio(dark, "accent-light", s)).toBeGreaterThanOrEqual(3);
  });

  it("documents why light --accent cannot carry a meaningful graphic", () => {
    // Tripwire, like the text-tier one: light --accent misses even the
    // non-text floor, which is why the marker/dial/thumb route to
    // --accent-dark / --focus instead. A retune clearing 3:1 here means the
    // pair-down can be revisited.
    for (const s of SURFACES) {
      expect(ratio(light, "accent", s)).toBeLessThan(3);
    }
  });
});

describe("chip AAA claim on the dark theme", () => {
  // globals.css documents 13.0:1 (AAA) for gray-950 on the dark bright olive.
  it("gray-950 on dark --accent is AAA (>= 7:1)", () => {
    expect(contrast(GRAY_950, parseOklch(dark.accent, dark))).toBeGreaterThanOrEqual(7);
  });
});

describe("inline-code chip across every section hue (WCAG 1.4.3, >= 4.5:1)", () => {
  // The one pair in the system generated from a hue ANGLE rather than a named
  // token, so its ratio varies per section and none of the three guards could
  // see it: contrast-guard and caption-contrast are class-string greps that
  // never evaluate a color, and themeBlock() above only parses the :root/.dark
  // blocks — a color declared from var(--hue) outside them is invisible to it.
  // At the old oklch(0.5 ...) lightness, hue 192 measured 4.35:1, a FAIL; and
  // hue 192 is sectionHue[0], which index 6 wraps back to, so it hit both
  // /learn/00-prereqs and /learn/06-hybrid-jobs. Inline code is 14px/600 —
  // normal-size text, so 4.5:1 applies, not the 3:1 large-text allowance.
  const sections = readFileSync(join(__dirname, "../src/lib/sections.ts"), "utf8");
  const hueList = sections.match(/sectionHue\s*=\s*\[([^\]]+)\]/);
  const hues = hueList![1].split(",").map((h) => parseFloat(h.trim()));

  // The unlayered rules at the bottom of globals.css, read rather than retyped.
  // There are several `.prose :not(pre) > code` blocks (the @layer components
  // one sets only padding/weight), so the pair is located by CONTENT: the light
  // rule is the one declaring both halves, the dark override restates color only.
  const CHIP_COLOR = /(?:^|[;{\s])color:\s*oklch\(([\d.]+) ([\d.]+) var\(--hue/;
  const CHIP_BG =
    /background-color:\s*oklch\(([\d.]+) ([\d.]+) var\(--hue[^)]*\)\s*\/\s*([\d.]+)\)/;

  function bodies(prefix: string): string[] {
    const re = new RegExp(
      prefix.replace(/\./g, "\\.") + String.raw`\.prose :not\(pre\) > code\s*\{([^}]*)\}`,
      "g"
    );
    return [...css.matchAll(re)].map((m) => m[1]);
  }

  const lightBody = bodies("").find((b) => CHIP_COLOR.test(b) && CHIP_BG.test(b))!;
  const darkBody = bodies(".dark ").find((b) => CHIP_COLOR.test(b))!;

  function parseChip(body: string) {
    const c = body.match(CHIP_COLOR)!;
    const bg = body.match(CHIP_BG);
    return {
      color: [parseFloat(c[1]), parseFloat(c[2]), 0] as Oklch,
      bg: (bg ? [parseFloat(bg[1]), parseFloat(bg[2]), 0] : [0, 0, 0]) as Oklch,
      alpha: bg ? parseFloat(bg[3]) : 0,
    };
  }

  const lightChip = parseChip(lightBody);
  const darkChip = parseChip(darkBody);
  // The dark override restates only `color`; the tinted background is inherited
  // from the unprefixed rule.
  darkChip.bg = lightChip.bg;
  darkChip.alpha = lightChip.alpha;

  function composite(fg: Oklch, bgAlpha: number, tint: Oklch, base: Oklch): number {
    const t = toLinearSrgb(tint);
    const b = toLinearSrgb(base);
    const mixed = t.map((v, i) => v * bgAlpha + b[i] * (1 - bgAlpha));
    const bgLum = 0.2126 * mixed[0] + 0.7152 * mixed[1] + 0.0722 * mixed[2];
    const fgLum = luminance(fg);
    const [hi, lo] = [fgLum, bgLum].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  }

  it("found the hue table and both chip rules", () => {
    expect(hues.length).toBeGreaterThan(0);
    expect(lightChip.alpha).toBeGreaterThan(0);
    expect(darkChip.color[0]).toBeGreaterThan(0);
  });

  it.each(
    hues.flatMap((h) => [
      ["light", h] as const,
      ["dark", h] as const,
    ])
  )("%s theme, hue %s is AA (>= 4.5:1)", (theme, hue) => {
    const chip = theme === "light" ? lightChip : darkChip;
    const vars = theme === "light" ? light : dark;
    const base = parseOklch(vars["surface-base"], vars);
    const ratio = composite(
      [chip.color[0], chip.color[1], hue],
      chip.alpha,
      [chip.bg[0], chip.bg[1], hue],
      base
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("parser sanity", () => {
  it("resolved the per-theme focus token through var() indirection", () => {
    expect(resolve(light.focus, light)).toBe(light["accent-dark"]);
    expect(resolve(dark.focus, dark)).toBe(dark.accent);
  });

  it("found every token this suite asserts on, in both themes", () => {
    for (const vars of [light, dark]) {
      for (const t of [
        ...SURFACES,
        "ink",
        "mut",
        "btn-ink",
        "btn-fill",
        "accent",
        "accent-light",
        "accent-dark",
        "focus",
      ]) {
        expect(vars[t]).toBeDefined();
      }
    }
  });
});
