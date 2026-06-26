import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-level regression guard for WS-6e: the de-emphasized caption tier must
// use the shared, WCAG-AA `.text-caption` utility, never the inverted, sub-AA
// `text-gray-400 dark:text-gray-500` literal. This scan is deterministic and is
// the only coverage for the WebGL-only bloch-sphere-3d.tsx site (jsdom cannot
// render it).
const Q = join(__dirname, "../../../src/components/quantum");
const GLOBALS = join(__dirname, "../../../src/app/globals.css");
const read = (f: string) => readFileSync(join(Q, f), "utf8");

const BAD = "text-gray-400 dark:text-gray-500";

// Every quantum/ file whose failing-literal caption text was migrated to
// `.text-caption`. Includes shots-sampler.tsx (its :59 text badge carried the
// failing literal; its :141 marker uses the separate gray-600 tier, untouched).
const MIGRATED = [
  "widget-ui.tsx",
  "dj-demo.tsx",
  "qaoa-explorer.tsx",
  "encoding-explorer.tsx",
  "kernel-explorer.tsx",
  "hamiltonian-explorer.tsx",
  "metrics-explorer.tsx",
  "checkpoint-explorer.tsx",
  "vqc-trainer.tsx",
  "challenge.tsx",
  "correlation-demo.tsx",
  "grover-visualizer.tsx",
  "job-explorer.tsx",
  "param-compile-explorer.tsx",
  "review-card.tsx",
  "runnable-editor.tsx",
  "bloch-sphere-3d.tsx",
  "shots-sampler.tsx",
];

test("globals.css defines .text-caption with the AA-passing pair", () => {
  const css = readFileSync(GLOBALS, "utf8");
  expect(css).toContain(".text-caption");
  expect(css).toMatch(/\.text-caption\s*\{[^}]*text-gray-500 dark:text-gray-400/);
});

test.each(MIGRATED)("%s has no inverted sub-AA caption literal", (f) => {
  expect(read(f)).not.toContain(BAD);
});

test.each(MIGRATED)("%s uses the shared .text-caption utility", (f) => {
  expect(read(f)).toContain("text-caption");
});

test("pes/vqe keep exactly one excluded SVG-stroke occurrence", () => {
  for (const f of ["pes-explorer.tsx", "vqe-explorer.tsx"]) {
    expect(read(f).split(BAD).length - 1).toBe(1);
  }
});
