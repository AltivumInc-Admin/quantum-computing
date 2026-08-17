import { readFileSync } from "fs";
import { join } from "path";

/**
 * KERNEL PURITY: the shared tutor logic ships VERBATIM into the public bundle.
 *
 * scripts/gen-tutor-core.mjs copies lambda/tutor/tutor-core.mjs and
 * lambda/tutor/tutor-billing.mjs byte-for-byte into
 * web/src/lib/*.generated.ts, which the static site compiles and serves to
 * every visitor. That copy is what keeps the client's model picker and the
 * server's billing math in exact agreement — and it only works because both
 * modules are pure: no imports to resolve, no environment to read.
 *
 * The purity is also a RULE-6 STRUCTURE, not a style preference. The metering
 * markup must one day be read from deployed configuration (an env var, like
 * SECRET_ID) — and the one place that read must never happen is a file that
 * gets copied into a public web bundle, where "deployed configuration" would
 * become "committed, published constant" the moment anyone inlines a default.
 * As long as these files cannot touch process.env at all, putting the markup
 * read in the kernel is structurally impossible rather than merely forbidden.
 *
 * If this test fails on your change: the env read (or the import that smuggles
 * one in) belongs in the HANDLER (lambda/tutor/index.mjs), which passes plain
 * values into the kernel. Do not exempt a file here; move the read.
 */

const REPO = join(__dirname, "..", "..", "..");

const KERNEL_FILES = ["lambda/tutor/tutor-core.mjs", "lambda/tutor/tutor-billing.mjs"];

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe.each(KERNEL_FILES)("%s stays a pure, env-blind kernel", (rel) => {
  const code = stripComments(readFileSync(join(REPO, rel), "utf8"));

  it("never touches process (env or otherwise)", () => {
    expect(code).not.toMatch(/\bprocess\b/);
  });

  it("has no static imports or re-exports", () => {
    expect(code).not.toMatch(/^\s*import\b/m);
    expect(code).not.toMatch(/^\s*export\s+[^;\n]*\bfrom\b/m);
  });

  it("has no dynamic import() or require()", () => {
    expect(code).not.toMatch(/\bimport\s*\(/);
    expect(code).not.toMatch(/\brequire\s*\(/);
  });
});

describe("the generator still copies exactly these kernels", () => {
  it("gen-tutor-core.mjs names both files (so this guard covers what actually ships)", () => {
    const gen = readFileSync(join(REPO, "scripts", "gen-tutor-core.mjs"), "utf8");
    for (const rel of KERNEL_FILES) {
      expect(gen).toContain(rel.split("/").pop() as string);
    }
  });
});
