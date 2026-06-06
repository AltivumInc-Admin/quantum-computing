# Phase 1 — Intro Content Overhaul + New Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the two intro learning modules (`00-prereqs`, `01-foundations`) into one captivating, interactive narrative, and add three new GUIDE widgets (`qbloch`, `qshots`, `qcorr`) that demonstrate concepts the prose currently only describes.

**Architecture:** GUIDE content is Markdown rendered by `web/src/components/markdown-renderer.tsx`, which routes custom fenced code blocks (` ```qsim `, ` ```qscrub `, ` ```qchallenge `, ` ```quiz `, ` ```runnable `) to client React widgets. We add three more fence languages. All new widgets are client components under `web/src/components/quantum/`, reuse the pure-TS kernel `math.ts` (`simulate`, `probabilities`, `basisLabel`, `blochVector`, `Op`, `Complex`) and readouts `state-readout.ts` (`diracString`, `toPythonState`), and follow the existing widgets' card chrome and accessibility (ARIA + `prefers-reduced-motion`). No backend; static export safe (`output: "export"`).

**Tech Stack:** Next.js 16 / React 19, TypeScript, Tailwind v4, Jest + React Testing Library (component tests opt into jsdom via a `/** @jest-environment jsdom */` docblock; pure-logic tests run in the default node env), KaTeX for math, three.js (lazy, client-only) for the 3D Bloch sphere.

**Branch:** `feat/intro-modules-phase1` (already created off the merged `main`). Run all commands from repo root unless noted; web commands from `web/`.

**Critical repo gotcha:** `.gitattributes` runs `nbstripout` as an `.ipynb` clean filter, so notebooks perpetually show as "modified" in `git status` (the on-disk bytes still equal HEAD). **Never `git add -A` / `git add .`** in this repo — stage explicit paths only, or you will sweep 31 unrelated notebooks into your commit.

**Voice rules (apply to all prose):** No emojis. Professional, vivid register. Open each section with motivation/a question, not a definition. Carry a through-line (the prereqs "spun coin"; build toward the Bell pair). Formalism (matrices, Dirac) appears after intuition, as the precise version of what the reader already feels.

---

## Part A — New Widgets

### Task A0: Extract shared display-capability hooks

`wavefunction-scrubber.tsx` defines `usePrefersReducedMotion`, `detectWebGL`, and `useWebGL` inline. `qbloch` (Task A1) needs the same logic. Extract them to a shared module so both use one copy.

**Files:**
- Create: `web/src/components/quantum/use-display-caps.ts`
- Modify: `web/src/components/quantum/wavefunction-scrubber.tsx` (remove the three inline definitions; import them)
- Test: `web/__tests__/components/quantum/use-display-caps.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/components/quantum/use-display-caps.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import { detectWebGL } from "@/components/quantum/use-display-caps";

describe("detectWebGL", () => {
  it("returns a boolean and does not throw when canvas has no WebGL context", () => {
    // jsdom canvas.getContext returns null → detectWebGL must return false, not throw.
    const result = detectWebGL();
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx jest use-display-caps --watchAll=false`
Expected: FAIL — cannot find module `use-display-caps`.

- [ ] **Step 3: Create the shared module**

Create `web/src/components/quantum/use-display-caps.ts` by moving the existing implementations verbatim out of `wavefunction-scrubber.tsx`:

```ts
"use client";

import { useSyncExternalStore } from "react";

/** True when the user has requested reduced motion. SSR snapshot is `false`. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

export function detectWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Whether WebGL is available. Stable across a session; SSR snapshot is `false`. */
export function useWebGL(): boolean {
  return useSyncExternalStore(
    () => () => {},
    detectWebGL,
    () => false
  );
}
```

- [ ] **Step 4: Refactor the scrubber to import them**

In `web/src/components/quantum/wavefunction-scrubber.tsx`: delete the inline `usePrefersReducedMotion`, `detectWebGL`, and `useWebGL` definitions and their now-unused `useSyncExternalStore` import (keep `useSyncExternalStore` only if still used elsewhere in the file — it is not after removal, so drop it from the React import). Add:

```ts
import { usePrefersReducedMotion, useWebGL } from "./use-display-caps";
```

- [ ] **Step 5: Run tests**

Run: `cd web && npx jest use-display-caps wavefunction-scrubber --watchAll=false`
Expected: PASS (both the new test and the existing scrubber tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/quantum/use-display-caps.ts web/src/components/quantum/wavefunction-scrubber.tsx web/__tests__/components/quantum/use-display-caps.test.ts
git commit -m "refactor(web): extract shared display-capability hooks"
```

---

### Task A1: `qbloch` — Bloch build-a-state widget

A single-qubit playground: θ and φ sliders drive the canonical state
|ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩, shown on the draggable 3D Bloch sphere (2D `BlochDial` fallback), with amplitudes, P(0)/P(1), the Dirac string, and the gate sequence that builds it.

**Files:**
- Create: `web/src/components/quantum/bloch-builder.ts` (pure helper)
- Create: `web/src/components/quantum/bloch-builder-widget.tsx` (component)
- Modify: `web/src/components/markdown-renderer.tsx` (route ` ```qbloch `)
- Test: `web/__tests__/components/quantum/bloch-builder.test.ts`
- Test: `web/__tests__/components/quantum/bloch-builder-widget.test.tsx`

- [ ] **Step 1: Write the failing helper test**

Create `web/__tests__/components/quantum/bloch-builder.test.ts`:

```ts
import { stateFromAngles, probsFromAngles } from "@/components/quantum/bloch-builder";
import { diracString } from "@/components/quantum/state-readout";

describe("stateFromAngles", () => {
  it("θ=0 gives |0>", () => {
    const s = stateFromAngles(0, 0);
    expect(s[0][0]).toBeCloseTo(1, 10);
    expect(s[1][0]).toBeCloseTo(0, 10);
    expect(s[1][1]).toBeCloseTo(0, 10);
  });

  it("θ=π gives |1>", () => {
    const s = stateFromAngles(Math.PI, 0);
    expect(s[0][0]).toBeCloseTo(0, 10);
    expect(s[1][0]).toBeCloseTo(1, 10);
  });

  it("θ=π/2, φ=0 gives |+> = (|0>+|1>)/√2", () => {
    const s = stateFromAngles(Math.PI / 2, 0);
    expect(s[0][0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(s[1][0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(s[1][1]).toBeCloseTo(0, 10);
    expect(diracString(s, 1)).toContain("|0⟩");
  });

  it("θ=π/2, φ=π/2 puts the relative phase on |1> (imaginary)", () => {
    const s = stateFromAngles(Math.PI / 2, Math.PI / 2);
    expect(s[1][0]).toBeCloseTo(0, 10); // cos(π/2)·(1/√2)
    expect(s[1][1]).toBeCloseTo(Math.SQRT1_2, 10); // sin(π/2)·(1/√2)
  });

  it("probsFromAngles obeys the Born rule cos²(θ/2), sin²(θ/2)", () => {
    const { p0, p1 } = probsFromAngles(Math.PI / 3, 1.2);
    expect(p0).toBeCloseTo(Math.cos(Math.PI / 6) ** 2, 10); // 3/4
    expect(p1).toBeCloseTo(Math.sin(Math.PI / 6) ** 2, 10); // 1/4
    expect(p0 + p1).toBeCloseTo(1, 10);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest bloch-builder.test --watchAll=false`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `web/src/components/quantum/bloch-builder.ts`:

```ts
import type { Complex } from "./math";

/**
 * Canonical single-qubit state for Bloch angles (θ polar, φ azimuth):
 *   |ψ> = cos(θ/2)|0> + e^{iφ} sin(θ/2)|1>
 * Returned with no global phase so the Dirac readout matches the textbook form.
 */
export function stateFromAngles(theta: number, phi: number): Complex[] {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [
    [c, 0],
    [s * Math.cos(phi), s * Math.sin(phi)],
  ];
}

/** Born-rule probabilities for the angle state. */
export function probsFromAngles(theta: number, phi: number): { p0: number; p1: number } {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return { p0: c * c, p1: s * s };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest bloch-builder.test --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Write the component**

Create `web/src/components/quantum/bloch-builder-widget.tsx`. Mirror the card chrome of `CircuitLab` (header chip "Build a state", `not-prose` rounded-card container). Behavior:
- Two `<input type="range">` sliders: θ ∈ [0, π] (step π/60), φ ∈ [0, 2π] (step π/60), each with a `<label>`, `aria-label`, and `aria-valuetext` in radians (mirror CircuitLab's θ slider markup exactly).
- Compute `state = stateFromAngles(theta, phi)` and `{p0, p1} = probsFromAngles(theta, phi)` with `useMemo`.
- Right side: render the 3D Bloch sphere when motion is allowed and WebGL present, else `BlochDial` — same gate as the scrubber:

```tsx
"use client";

import { useId, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BlochDial } from "./bloch-dial";
import { stateFromAngles, probsFromAngles } from "./bloch-builder";
import { diracString, toPythonState } from "./state-readout";
import { usePrefersReducedMotion, useWebGL } from "./use-display-caps";
import { CopyButton } from "../copy-button";

const BlochSphere3D = dynamic(() => import("./bloch-sphere-3d"), { ssr: false });

export function BlochBuilder() {
  const [theta, setTheta] = useState(Math.PI / 2);
  const [phi, setPhi] = useState(0);
  const thetaId = useId();
  const phiId = useId();
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGL();

  const state = useMemo(() => stateFromAngles(theta, phi), [theta, phi]);
  const { p0, p1 } = useMemo(() => probsFromAngles(theta, phi), [theta, phi]);
  const show3D = !reduced && webgl;

  // gate sequence (up to global phase): RY(θ) then RZ(φ) from |0>
  const gateSeq = `RY ${theta.toFixed(2)}  →  RZ ${phi.toFixed(2)}`;

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Build a state
        </span>
        <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{gateSeq}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 px-4 py-4">
        <div className="flex-1 min-w-0">
          {/* P(0)/P(1) bars — reuse the bar markup from CircuitLab, two rows: |0>, |1> */}
          {/* ...two probability rows using p0, p1 and basisLabel... */}
          <div className="mt-4 flex items-start gap-2">
            <p className="min-w-0 flex-1 font-mono text-sm text-gray-700 dark:text-gray-200 break-words">
              <span className="text-gray-400 dark:text-gray-500">|ψ⟩ = </span>
              <span className="text-accent dark:text-accent-light">{diracString(state, 1)}</span>
            </p>
            <CopyButton getText={() => toPythonState(state)} label="Copy state as runnable Python" />
          </div>
        </div>
        {show3D ? <BlochSphere3D state={state} /> : <BlochDial state={state} />}
      </div>

      <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <label htmlFor={thetaId} className="font-mono text-sm text-gray-600 dark:text-gray-300">θ</label>
        <input id={thetaId} type="range" min={0} max={Math.PI} step={Math.PI / 60}
          value={theta} onChange={(e) => setTheta(parseFloat(e.target.value))}
          className="slider flex-1 focus-ring" aria-label="Polar angle theta in radians"
          aria-valuetext={`${theta.toFixed(2)} radians`} />
        <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">{theta.toFixed(2)} rad</span>
      </div>
      <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <label htmlFor={phiId} className="font-mono text-sm text-gray-600 dark:text-gray-300">φ</label>
        <input id={phiId} type="range" min={0} max={2 * Math.PI} step={Math.PI / 60}
          value={phi} onChange={(e) => setPhi(parseFloat(e.target.value))}
          className="slider flex-1 focus-ring" aria-label="Azimuthal angle phi in radians"
          aria-valuetext={`${phi.toFixed(2)} radians`} />
        <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">{phi.toFixed(2)} rad</span>
      </div>
    </div>
  );
}
```

Fill in the two probability bar rows (|0⟩, |1⟩) by copying the bar markup from `CircuitLab` (the `sim.probs!.map(...)` block) and driving it from `[p0, p1]`. The `qbloch` fence body is ignored (no source needed); the component takes no props.

- [ ] **Step 6: Register the fence in the renderer**

In `web/src/components/markdown-renderer.tsx`: add the import and a branch in `pre()` mirroring the existing ones:

```tsx
import { BlochBuilder } from "./quantum/bloch-builder-widget";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qbloch")) {
  return <BlochBuilder />;
}
```
(Place it alongside the other `language-*` checks.)

- [ ] **Step 7: Write the component render test**

Create `web/__tests__/components/quantum/bloch-builder-widget.test.tsx` (mirror `wavefunction-scrubber.test.tsx`'s jsdom setup; the 3D sphere is dynamically imported and will fall back, so assert on the always-present readouts/sliders):

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlochBuilder } from "@/components/quantum/bloch-builder-widget";

describe("BlochBuilder", () => {
  it("renders θ and φ sliders and the initial |+> state", () => {
    render(<BlochBuilder />);
    expect(screen.getByLabelText(/polar angle theta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/azimuthal angle phi/i)).toBeInTheDocument();
    // default θ=π/2, φ=0 → |+>, both amplitudes 0.71
    expect(screen.getByText(/0\.71\|0⟩/)).toBeInTheDocument();
  });

  it("updating θ to π collapses to |1>", () => {
    render(<BlochBuilder />);
    fireEvent.change(screen.getByLabelText(/polar angle theta/i), {
      target: { value: String(Math.PI) },
    });
    expect(screen.getByText(/1\.00\|1⟩/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run tests**

Run: `cd web && npx jest bloch-builder markdown-renderer --watchAll=false`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/quantum/bloch-builder.ts web/src/components/quantum/bloch-builder-widget.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/bloch-builder.test.ts web/__tests__/components/quantum/bloch-builder-widget.test.tsx
git commit -m "feat(web): qbloch build-a-state widget"
```

---

### Task A2: `qshots` — shots sampler widget

Parses a `qsim` circuit, computes exact Born-rule probabilities, and samples N measurement shots, drawing a histogram of empirical frequencies with the true probability marked per bar — the law of large numbers, visible.

**Files:**
- Create: `web/src/components/quantum/shots.ts` (pure sampling helper)
- Create: `web/src/components/quantum/shots-sampler.tsx` (component)
- Modify: `web/src/components/markdown-renderer.tsx` (route ` ```qshots `)
- Test: `web/__tests__/components/quantum/shots.test.ts`
- Test: `web/__tests__/components/quantum/shots-sampler.test.tsx`

- [ ] **Step 1: Write the failing helper test**

Create `web/__tests__/components/quantum/shots.test.ts`:

```ts
import { sampleCounts } from "@/components/quantum/shots";

describe("sampleCounts", () => {
  it("returns counts that sum to N over the right number of outcomes", () => {
    const probs = [0.25, 0.25, 0.25, 0.25];
    const counts = sampleCounts(probs, 100, mulberry32(1));
    expect(counts).toHaveLength(4);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("never samples a zero-probability outcome", () => {
    const probs = [0.5, 0, 0.5, 0]; // only |00> and |10> possible
    const counts = sampleCounts(probs, 500, mulberry32(7));
    expect(counts[1]).toBe(0);
    expect(counts[3]).toBe(0);
    expect(counts[0] + counts[2]).toBe(500);
  });

  it("is deterministic for a fixed RNG seed", () => {
    const probs = [0.7, 0.3];
    const a = sampleCounts(probs, 1000, mulberry32(42));
    const b = sampleCounts(probs, 1000, mulberry32(42));
    expect(a).toEqual(b);
  });

  it("converges toward the true distribution for large N", () => {
    const probs = [0.7, 0.3];
    const counts = sampleCounts(probs, 50000, mulberry32(123));
    expect(counts[0] / 50000).toBeCloseTo(0.7, 1); // 1 decimal place
  });
});

// Small deterministic PRNG for tests (not used in production).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest shots.test --watchAll=false`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `web/src/components/quantum/shots.ts`:

```ts
/**
 * Sample `n` measurement shots from a categorical distribution `probs`
 * (probabilities over basis-state indices) and return per-outcome counts.
 * `rng` defaults to Math.random; tests inject a seeded generator for determinism.
 */
export function sampleCounts(
  probs: number[],
  n: number,
  rng: () => number = Math.random
): number[] {
  // Cumulative distribution for inverse-transform sampling.
  const cdf: number[] = [];
  let acc = 0;
  for (const p of probs) {
    acc += p;
    cdf.push(acc);
  }
  const counts = new Array(probs.length).fill(0);
  for (let s = 0; s < n; s++) {
    const r = rng() * acc; // scale by total in case probs sum slightly < 1
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r <= cdf[mid]) hi = mid;
      else lo = mid + 1;
    }
    counts[lo]++;
  }
  return counts;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest shots.test --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Write the component**

Create `web/src/components/quantum/shots-sampler.tsx`. Behavior:
- `parseProgram(source)` + `simulate(opsFor(program, 0), program.n)` + `probabilities(state)` give the exact `probs` (no θ slider; if `program.hasTheta`, treat θ=0). Render the parse-error card on `program.error` (copy the pattern from `CircuitLab`).
- A row of shot-count preset buttons: `[1, 10, 100, 1000, 10000]`. A "Run" button calls `setCounts(sampleCounts(probs, shots))` (production uses default `Math.random`). Track `total` shots run.
- Histogram: one row per basis state (`basisLabel(idx, n)`), a bar whose width is the empirical fraction `counts[idx]/total`, the empirical `%`, and a thin target marker at the exact `probs[idx]` (e.g. an absolutely-positioned 2px line over the bar track). Before any run, show the exact probabilities with `total = 0` and bars at 0.
- Header chip: "Shots sampler". `not-prose` rounded-card chrome like `CircuitLab`.
- Accessibility / reduced motion: no animated fill needed; render final widths directly. Each row exposes empirical and exact values as text. Buttons have discernible labels (e.g. `aria-pressed` on the active shot count).

- [ ] **Step 6: Register the fence**

In `markdown-renderer.tsx`:
```tsx
import { ShotsSampler } from "./quantum/shots-sampler";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qshots")) {
  return <ShotsSampler source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 7: Write the component render test**

Create `web/__tests__/components/quantum/shots-sampler.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShotsSampler } from "@/components/quantum/shots-sampler";

describe("ShotsSampler", () => {
  it("shows the exact probabilities for H on one qubit before any run", () => {
    render(<ShotsSampler source={"qubits 1\nH 0"} />);
    // two basis states |0>, |1>; exact 50% each shown somewhere
    expect(screen.getAllByText(/50\.0%|50%/).length).toBeGreaterThan(0);
  });

  it("running shots produces counts that fill the bars", () => {
    render(<ShotsSampler source={"qubits 1\nH 0"} />);
    fireEvent.click(screen.getByRole("button", { name: /^1000$/ }));
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    // after a 1000-shot run the empirical readout updates away from the 0-shot state
    expect(screen.getByText(/1000 shots/i)).toBeInTheDocument();
  });

  it("renders a parse-error card for a bad circuit", () => {
    render(<ShotsSampler source={"NOTAGATE 0"} />);
    expect(screen.getByText(/parse error/i)).toBeInTheDocument();
  });
});
```
(Adjust the exact label/text matchers to the strings you render; keep the three behaviors: exact probs shown, a run updates the total, parse error card.)

- [ ] **Step 8: Run tests**

Run: `cd web && npx jest shots markdown-renderer --watchAll=false`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/quantum/shots.ts web/src/components/quantum/shots-sampler.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/shots.test.ts web/__tests__/components/quantum/shots-sampler.test.tsx
git commit -m "feat(web): qshots shots-sampler widget"
```

---

### Task A3: `qcorr` — entanglement correlation widget

Two side-by-side 2-qubit circuits (an entangled one and a product one). "Measure" samples one joint outcome from each; a running tally over many measurements makes "entangled ≠ independent" undeniable — the Bell pair only ever yields 00 or 11, the product state spreads over all four.

**Files:**
- Create: `web/src/components/quantum/correlation.ts` (parse + sample + tally helpers)
- Create: `web/src/components/quantum/correlation-demo.tsx` (component)
- Modify: `web/src/components/markdown-renderer.tsx` (route ` ```qcorr `)
- Test: `web/__tests__/components/quantum/correlation.test.ts`
- Test: `web/__tests__/components/quantum/correlation-demo.test.tsx`

**Fence format (JSON, parsed like `quiz`/`challenge`):**
```json
{
  "prompt": "Measure both qubits repeatedly. Which circuit's outcomes are correlated?",
  "entangled": "H 0\nCNOT 0 1",
  "product": "H 0\nH 1"
}
```

- [ ] **Step 1: Write the failing helper test**

Create `web/__tests__/components/quantum/correlation.test.ts`:

```ts
import { parseCorrelation, sampleOutcome } from "@/components/quantum/correlation";
import { simulate, probabilities } from "@/components/quantum/math";
import { opsFor, parseProgram } from "@/components/quantum/qsim-dsl";

function probsFor(src: string): number[] {
  const p = parseProgram(src);
  return probabilities(simulate(opsFor(p, 0), p.n));
}

describe("parseCorrelation", () => {
  it("parses prompt + two 2-qubit programs", () => {
    const r = parseCorrelation(
      JSON.stringify({ prompt: "p", entangled: "H 0\nCNOT 0 1", product: "H 0\nH 1" })
    );
    expect(r.spec).not.toBeNull();
    expect(r.spec!.entangled.n).toBe(2);
    expect(r.spec!.product.n).toBe(2);
  });

  it("rejects a non-2-qubit circuit", () => {
    const r = parseCorrelation(JSON.stringify({ prompt: "p", entangled: "H 0", product: "H 0\nH 1" }));
    expect(r.spec).toBeNull();
    expect(r.error).toMatch(/two qubits/i);
  });
});

describe("sampleOutcome", () => {
  it("a Bell pair only ever yields 00 or 11", () => {
    const probs = probsFor("H 0\nCNOT 0 1"); // [0.5,0,0,0.5]
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const idx = sampleOutcome(probs, rng);
      expect([0, 3]).toContain(idx); // |00>=0, |11>=3
    }
  });

  it("a product state can yield all four outcomes", () => {
    const probs = probsFor("H 0\nH 1"); // [.25,.25,.25,.25]
    const rng = mulberry32(9);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(sampleOutcome(probs, rng));
    expect(seen.size).toBe(4);
  });
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest correlation.test --watchAll=false`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `web/src/components/quantum/correlation.ts`:

```ts
import { parseProgram, type Program } from "./qsim-dsl";

export interface CorrelationSpec {
  prompt: string;
  entangled: Program;
  product: Program;
}

export interface ParsedCorrelation {
  spec: CorrelationSpec | null;
  error?: string;
}

export function parseCorrelation(source: string): ParsedCorrelation {
  try {
    const data = JSON.parse(source) as Partial<{ prompt: string; entangled: string; product: string }>;
    if (typeof data.prompt !== "string" || typeof data.entangled !== "string" || typeof data.product !== "string") {
      throw new Error('expected { "prompt", "entangled", "product" } strings');
    }
    const entangled = parseProgram(data.entangled);
    const product = parseProgram(data.product);
    for (const [label, p] of [["entangled", entangled], ["product", product]] as const) {
      if (p.error) throw new Error(`${label}: ${p.error}`);
      if (p.n !== 2) throw new Error(`${label} circuit must use exactly two qubits`);
    }
    return { spec: { prompt: data.prompt, entangled, product } };
  } catch (e) {
    return { spec: null, error: (e as Error).message };
  }
}

/** Inverse-transform sample one basis-state index from `probs`. */
export function sampleOutcome(probs: number[], rng: () => number = Math.random): number {
  const total = probs.reduce((a, b) => a + b, 0);
  const r = rng() * total;
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return i;
  }
  return probs.length - 1;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest correlation.test --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Write the component**

Create `web/src/components/quantum/correlation-demo.tsx`. Behavior:
- `parseCorrelation(source)`; render an error card if `spec` is null (mirror `Challenge`).
- Compute each program's `probs` via `simulate(opsFor(program, 0), 2)` + `probabilities`.
- A single "Measure" button samples BOTH circuits once (`sampleOutcome`), updating two tally arrays `number[4]` (counts per `00/01/10/11`) and a "last outcome" highlight (light up q0,q1 bits). A "Reset" button clears tallies.
- Two side-by-side panels (`flex`, stack on mobile): each shows the gate chips (reuse CircuitLab's chip style), the last sampled `|q0 q1⟩`, and a 4-row tally (`basisLabel(idx, 2)` → count and running %). Label the left panel "Entangled" and right "Product".
- Header chip "Correlation"; show `spec.prompt` as the intro line. `not-prose` card chrome.
- Accessibility / reduced motion: instantaneous reveal (no animation required); tally values are text. Button has a clear label; the running count is announced via `role="status"` on the tally region.

- [ ] **Step 6: Register the fence**

In `markdown-renderer.tsx`:
```tsx
import { CorrelationDemo } from "./quantum/correlation-demo";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qcorr")) {
  return <CorrelationDemo source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 7: Write the component render test**

Create `web/__tests__/components/quantum/correlation-demo.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CorrelationDemo } from "@/components/quantum/correlation-demo";

const SOURCE = JSON.stringify({
  prompt: "Measure both repeatedly.",
  entangled: "H 0\nCNOT 0 1",
  product: "H 0\nH 1",
});

describe("CorrelationDemo", () => {
  it("renders the prompt and a Measure button", () => {
    render(<CorrelationDemo source={SOURCE} />);
    expect(screen.getByText(/measure both repeatedly/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /measure/i })).toBeInTheDocument();
  });

  it("accumulates measurements when Measure is clicked", () => {
    render(<CorrelationDemo source={SOURCE} />);
    const btn = screen.getByRole("button", { name: /measure/i });
    for (let i = 0; i < 5; i++) fireEvent.click(btn);
    // total measurements reflected somewhere (e.g. "5 measurements")
    expect(screen.getByText(/\b5\b/)).toBeInTheDocument();
  });

  it("renders an error card for malformed JSON", () => {
    render(<CorrelationDemo source={"{ not json"} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
```
(Tune matchers to the exact strings you render.)

- [ ] **Step 8: Run tests + full web suite**

Run: `cd web && npx jest correlation markdown-renderer --watchAll=false`
Then: `cd web && npm test -- --watchAll=false`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/quantum/correlation.ts web/src/components/quantum/correlation-demo.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/correlation.test.ts web/__tests__/components/quantum/correlation-demo.test.tsx
git commit -m "feat(web): qcorr entanglement-correlation widget"
```

---

### Task A4: Renderer routing test for the three new fences

**Files:**
- Modify: `web/__tests__/components/markdown-renderer.test.tsx`

- [ ] **Step 1: Add routing assertions**

Mirror the existing fence-routing tests. Add cases asserting that a ` ```qbloch `, ` ```qshots `, and ` ```qcorr ` fenced block renders its widget (e.g. the "Build a state", "Shots sampler", "Correlation" header chips appear) and that an unknown language still degrades to a code block. Use the existing test's `render(<MarkdownRenderer content={...} />)` pattern.

- [ ] **Step 2: Run + commit**

Run: `cd web && npx jest markdown-renderer --watchAll=false` → PASS.
```bash
git add web/__tests__/components/markdown-renderer.test.tsx
git commit -m "test(web): route qbloch/qshots/qcorr fences in renderer"
```

---

## Part B — Content Rewrite

### Task B1: Rewrite `00-prereqs/GUIDE.md` (polish + handoff)

`00-prereqs` is already warm; keep its plain-English → code → notation → self-check shape and its six concept subsections. Improvements only.

**Files:**
- Modify: `00-prereqs/GUIDE.md`

- [ ] **Step 1: Apply the edits**

1. Tighten the intro and the six concept subsections for momentum (no structural reorder). Keep the spun-coin metaphor and the Dirac→NumPy table.
2. Strengthen the closing handoff: the existing "…then you are ready for `01-foundations`" line and the final "move on to [01-foundations](../01-foundations/GUIDE.md)" become an explicit narrative bridge — one short paragraph that frames `01-foundations` as "now that you can *describe* the spun coin, you'll learn to *act* on it, *combine* it, and *read* it." This sets up the through-line B2 pays off.
3. Add one live `qsim` beat near the "What is a qubit" section so the reader sees |0⟩ and |+⟩ immediately:
   ````
   ```qsim
   qubits 1
   H 0
   ```
   ````
4. Keep the existing `qscrub` (Bloch) block and the placement `quiz`.
5. Verify no emojis; professional register.

- [ ] **Step 2: Verify it renders**

Run: `cd web && npm run build` → succeeds, `out/learn/00-prereqs` regenerates with no KaTeX/parse errors. (Optionally `npm run dev` and eyeball `/learn/00-prereqs`.)

- [ ] **Step 3: Commit**

```bash
git add 00-prereqs/GUIDE.md
git commit -m "docs(00-prereqs): polish prose + narrative handoff to foundations"
```

### Task B2: Rewrite `01-foundations/GUIDE.md` (full rewrite + resequence)

Replace the glossary-style content with the resequenced, narrative structure. **Preserve** the existing references section and the hands-on notebook list (filenames unchanged; only the parent dir was renamed). Compress "Learning Objectives" + "Prerequisites" into a short header callout, not the opener.

**Files:**
- Modify: `01-foundations/GUIDE.md`

- [ ] **Step 1: Write the new structure**

Author the GUIDE in this order, each section opening with motivation and ending by setting up the next. Embed the widgets exactly as indicated:

1. **Cold open** — pick up the spun coin from the prereqs; pose the stakes ("a state you can only describe is inert; here we get verbs: act, combine, read"). No "Learning Objectives" heading first; fold objectives/prereqs into a compact callout after the hook.
2. **The qubit, in one breath** — fast recall, then a live readout:
   ````
   ```qsim
   qubits 1
   H 0
   ```
   ````
3. **Measurement — what "looking" costs** — Born rule + collapse + shots, motivated *before* gates/entanglement. Embed the shots sampler:
   ````
   ```qshots
   qubits 1
   H 0
   ```
   ````
   Narrate: run 1, 10, 100, 1000, 10000 and watch the bars settle onto 50/50.
4. **Gates as rotations** — lead with the Bloch picture; keep the Pauli/H/S/T/R matrices as a reference table *after* the intuition. Embed the build-a-state widget and a θ-swept scrubber:
   ````
   ```qbloch
   ```
   ````
   ````
   ```qscrub
   qubits 1
   RY 0 theta
   ```
   ````
5. **The circuit model** — the rules of the game (init |0…0⟩ → unitary sequence → measure; depth vs width) stated here, with the Braket SDK basics and a runnable cell:
   ````
   ```runnable
   from braket.circuits import Circuit
   circuit = Circuit().h(0).cnot(0, 1)
   print(circuit.state_vector())
   ```
   ````
6. **Two qubits & the gates that bind them** — CNOT/CZ/SWAP/Toffoli, building toward the climax. Embed a `qsim` showing CNOT on |10⟩→|11⟩ or the start of a Bell build.
7. **Entanglement (the climax)** — build the Bell pair step-by-step, demonstrate the correlation, then make the reader do it:
   ````
   ```qscrub
   qubits 2
   H 0
   CNOT 0 1
   ```
   ````
   ````
   ```qcorr
   {
     "prompt": "Measure both qubits many times. In which circuit does qubit 1's result depend on qubit 0's?",
     "entangled": "H 0\nCNOT 0 1",
     "product": "H 0\nH 1"
   }
   ```
   ````
   ````
   ```qchallenge
   {
     "prompt": "Prepare the Bell state |Φ+⟩ = (|00⟩ + |11⟩)/√2 on two qubits.",
     "qubits": 2,
     "target": { "program": "H 0\nCNOT 0 1" },
     "starter": "H 0",
     "allowedGates": ["H", "X", "CNOT"],
     "hint": "Put qubit 0 into superposition with H, then let it control a flip of qubit 1 with CNOT."
   }
   ```
   ````
   Mention GHZ as the n-qubit stretch.
8. **Check yourself** — a `quiz` (mirror the prereqs placement-quiz shape) with ~5 questions consolidating measurement, gates-as-rotations, and entanglement, each with a `hint` and worked `a`.
9. **Where this goes + Hands-On + References** — one-paragraph bridge to `02-hardware`; then keep the existing notebook list (the five `notebooks/0X-*.ipynb` entries) and the references section.

- [ ] **Step 2: Self-check the content**

- KaTeX expressions use the repo macros (`\ket`, `\bra`); no raw `$$` syntax errors.
- Every widget fence is valid (qsim/qscrub/qshots/qbloch/qcorr/qchallenge/quiz) and uses gates within the DSL (H, X, Y, Z, S, T, I, RX, RY, RZ, CNOT; ≤ 4 qubits).
- No emojis; vivid, professional voice; each section opens with motivation.
- Notebook filenames and references preserved.

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build`
Expected: succeeds; `out/learn/01-foundations` regenerates; no KaTeX/markdown errors. Eyeball `/learn/01-foundations` via `npm run dev` — every widget mounts (shots sampler runs, qbloch sliders move the sphere, qcorr tallies, challenge grades, quiz reveals).

- [ ] **Step 4: Commit**

```bash
git add 01-foundations/GUIDE.md
git commit -m "docs(01-foundations): narrative rewrite + resequence + interactive payoffs"
```

### Task B3: Full verification

- [ ] **Step 1: Web suite + lint + build**

Run: `cd web && npm test -- --watchAll=false` → all pass (new total = old 217 + the new widget/helper tests).
Run: `cd web && npm run lint` → clean.
Run: `cd web && npm run build` → 11 pages; `out/learn/00-prereqs` and `out/learn/01-foundations` present.

- [ ] **Step 2: Python suite unaffected**

Run: `make test` → still green (no Python touched).

- [ ] **Step 3: Manual interaction pass**

`cd web && npm run dev`, open `/learn/00-prereqs` and `/learn/01-foundations`; confirm every embedded widget mounts and behaves (no console errors), light + dark themes, and reduced-motion (the 3D sphere falls back to `BlochDial`, the sampler shows static bars).

- [ ] **Step 4: Update CLAUDE.md test count if it changed**

If the web test total moved, update the `npm test` count in `CLAUDE.md` (the "Web App" → Commands section). Stage explicit paths only (never `git add -A` — nbstripout will sweep notebooks).
```bash
git add CLAUDE.md
git commit -m "docs: sync web test count after Phase 1 widgets"
```

---

## Self-Review checklist (run before finishing)

- Every spec requirement maps to a task: ✅ three widgets (A1–A3, registered + tested + routed A4), prereqs polish (B1), foundations rewrite + resequence with all widget beats (B2), verification (B3); shared-hook extraction (A0) enables qbloch.
- No placeholders: helper code and tests are complete; component blueprints reference exact existing components to mirror; GUIDE sections specify exact embedded fences.
- Type/name consistency: helpers return the documented shapes (`stateFromAngles → Complex[]`, `sampleCounts → number[]`, `sampleOutcome → number`, `parseCorrelation → {spec,error}`); fence languages `qbloch`/`qshots`/`qcorr` match the renderer branches and the GUIDE fences.
- nbstripout gotcha called out; all commits stage explicit paths.
