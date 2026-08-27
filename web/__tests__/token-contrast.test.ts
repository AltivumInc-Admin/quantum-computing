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
// A parsed opaque color as LINEAR sRGB — the shared currency both authoring
// syntaxes (oklch() and the after-dark system's hex anchors) convert into.
type Rgb = [r: number, g: number, b: number];

// oklch -> OKLab -> LMS -> linear sRGB (Björn Ottosson's reference matrices).
function toLinearSrgb([L, C, Hdeg]: Oklch): Rgb {
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

function parseColor(raw: string, vars: Vars): Rgb {
  const value = resolve(raw, vars);
  const ok = value.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (ok) {
    const L = parseFloat(ok[1]) / (ok[2] === "%" ? 100 : 1);
    return toLinearSrgb([L, parseFloat(ok[3]), parseFloat(ok[4])]);
  }
  // The after-dark tokens are authored as the design system's exact hex
  // anchors (#071710, #C2A379, …) rather than oklch conversions, so the
  // brand files and globals.css can never drift by a rounding step.
  const hex = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const lin = (i: number) => {
      const v = parseInt(hex[1].slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return [lin(0), lin(2), lin(4)];
  }
  // Anything else — notably any alpha channel — means the token is
  // translucent: its rendered color depends on what is behind it, so it
  // must never be asserted here.
  throw new Error(`not an opaque oklch/hex color: "${value}"`);
}

// WCAG relative luminance takes LINEARIZED sRGB channels — which is exactly
// what both parse paths already yield, so no gamma round-trip is needed.
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(c1: Rgb, c2: Rgb): number {
  const [hi, lo] = [luminance(c1), luminance(c2)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// The .chip-selected ink, parsed out of its own rule rather than retyped —
// the one literal ink in the system (globals.css documents the AA/AAA math),
// pinned here so the rule and this guard can never diverge.
const chipInkMatch = css.match(
  /\.chip-selected\s*\{[^}]*[^-]color:\s*(#[0-9a-fA-F]{6})\s*;/
);
if (!chipInkMatch) throw new Error(".chip-selected ink not found");
const CHIP_INK: Rgb = parseColor(chipInkMatch[1], {});

const light = themeBlock(":root");
const dark = themeBlock(".dark");
const SURFACES = ["surface-base", "surface-1", "surface-2"] as const;

function ratio(vars: Vars, fg: string, bg: string): number {
  return contrast(parseColor(vars[fg], vars), parseColor(vars[bg], vars));
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

  // .chip-selected: its pinned dark ink on the theme's --accent (gold) fill.
  it("chip ink on --accent (.chip-selected) is AA (>= 4.5:1)", () => {
    expect(contrast(CHIP_INK, parseColor(vars.accent, vars))).toBeGreaterThanOrEqual(4.5);
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
    // Tripwire, like the text-tier one: the light accent misses the non-text
    // floor on at least one app surface, which is why the marker/dial/thumb
    // route to --accent-dark / --focus instead — a graphic that is only
    // legible on SOME surfaces cannot carry meaning app-wide. Asserted as the
    // minimum across surfaces, not per-surface: the after-dark gold measures
    // 2.84 on base and 2.92 on surface-2 but 3.14 on the near-white
    // surface-1, and one passing surface does not make it universally safe.
    // A retune clearing 3:1 on EVERY surface means the pair-down can be
    // revisited.
    const worst = Math.min(...SURFACES.map((s) => ratio(light, "accent", s)));
    expect(worst).toBeLessThan(3);
  });
});

describe("chip AAA claim on the dark theme", () => {
  // globals.css documents 7.64:1 (AAA) for the chip ink on the dark bright
  // gold. (The green-black --ink #10231D would measure only 6.88:1 there —
  // which is why the chip carries its own darker literal ink.)
  it("chip ink on dark --accent is AAA (>= 7:1)", () => {
    expect(contrast(CHIP_INK, parseColor(dark.accent, dark))).toBeGreaterThanOrEqual(7);
  });
});

describe("semantic tiers (oxblood caution, jade success, danger)", () => {
  // The sanctioned resting-text idiom for all three tiers is the same
  // pair-down the accent uses: `text-<tier>-dark dark:text-<tier>-light`.
  // The BASE steps are fills/graphics (light --success measures 4.29 on the
  // new base; dark --danger 4.19 — neither may carry resting text).
  const TIERS = ["warm", "success", "danger"] as const;

  it.each(TIERS.flatMap((t) => SURFACES.map((s) => [t, s] as const)))(
    "light --%s-dark on --%s is AA (>= 4.5:1)",
    (t, s) => {
      expect(ratio(light, `${t}-dark`, s)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it.each(TIERS.flatMap((t) => SURFACES.map((s) => [t, s] as const)))(
    "dark --%s-light on --%s is AA (>= 4.5:1)",
    (t, s) => {
      expect(ratio(dark, `${t}-light`, s)).toBeGreaterThanOrEqual(4.5);
    }
  );
});

describe("the abyss contract", () => {
  // --abyss is the ONE pinned near-black green under every self-dark island
  // (hero shell, code fences, media frames, modal backdrops). It is declared
  // once in :root and deliberately NOT overridden in .dark — the cascade is
  // what makes it identical in both themes — and the compile-time @theme
  // twin (--color-abyss, the bg-abyss utility) must carry the same literal.
  it("is declared in :root and not re-declared in .dark", () => {
    expect(light.abyss).toBeDefined();
    expect(dark.abyss).toBeUndefined();
  });

  it("matches the @theme --color-abyss literal", () => {
    const themeTwin = css.match(/--color-abyss:\s*([^;]+);/);
    expect(themeTwin).not.toBeNull();
    expect(themeTwin![1].trim().toLowerCase()).toBe(light.abyss.toLowerCase());
  });

  it("keeps AAA ink on the abyss (self-dark islands set silver text)", () => {
    expect(contrast(parseColor(dark.ink, dark), parseColor(light.abyss, light))).toBeGreaterThanOrEqual(7);
  });
});

describe("the hue-free phase scale", () => {
  // Relative phase is silver lightness steps with gold marking zero phase
  // ONLY; the symmetry (θ and 2π−θ share a value) is carried in the token
  // VALUES so consumer index math stays trivial. Both themes must define all
  // eight, and the mirror pairs must be byte-identical.
  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("%s theme defines --phase-0..7 symmetrically", (_name, vars) => {
    for (let k = 0; k <= 7; k++) expect(vars[`phase-${k}`]).toBeDefined();
    for (let k = 1; k <= 3; k++) {
      expect(vars[`phase-${k}`]).toBe(vars[`phase-${8 - k}`]);
    }
  });

  it("marks zero phase in gold and keeps every other step hue-free", () => {
    for (const vars of [light, dark]) {
      // --phase-0 carries chroma (the gold tick)…
      expect(vars["phase-0"]).toMatch(/oklch\([\d.]+ 0\.0[1-9]/);
      // …and --phase-1..7 are achromatic silver steps.
      for (let k = 1; k <= 7; k++) {
        expect(vars[`phase-${k}`]).toMatch(/oklch\([\d.]+ 0 0\)/);
      }
    }
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

  function composite(fg: Oklch, bgAlpha: number, tint: Oklch, base: Rgb): number {
    const t = toLinearSrgb(tint);
    const mixed = t.map((v, i) => v * bgAlpha + base[i] * (1 - bgAlpha));
    const bgLum = 0.2126 * mixed[0] + 0.7152 * mixed[1] + 0.0722 * mixed[2];
    const fgLum = luminance(toLinearSrgb(fg));
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
    const base = parseColor(vars["surface-base"], vars);
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
        "warm",
        "warm-light",
        "warm-dark",
        "success",
        "success-light",
        "success-dark",
        "danger",
        "danger-light",
        "danger-dark",
      ]) {
        expect(vars[t]).toBeDefined();
      }
    }
  });
});
