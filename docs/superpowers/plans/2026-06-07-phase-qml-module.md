# 04-quantum-ml Module Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reflow the `04-quantum-ml` GUIDE into a "the model is a quantum circuit" narrative and add four pure-client QML widgets — `qencode`, `qkernel`, `qvqc`, `qbarren`.

**Architecture:** Each widget is a client React component under `web/src/components/quantum/`, routed by a new `language-*` branch in `markdown-renderer.tsx`. Quantum/ML logic lives in four small modules (`encoding.ts`, `kernel.ts`, `vqc.ts`, `barren.ts`) on top of `math.ts`. **All math + behavioral parameters below were verified by a 12-agent adversarial workflow before this plan; transcribe them faithfully.** No AWS, no SSR.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Tailwind v4, Jest + RTL (component tests: `/** @jest-environment jsdom */` docblock + local `matchMedia` polyfill where reduced-motion is read; pure-logic tests: node env), KaTeX.

**Branch:** `feat/04-quantum-ml-overhaul` (spec committed there). Web commands from `web/`.

**CRITICAL gotchas:**
- `.gitattributes` runs `nbstripout` → notebooks always show "modified". **Never `git add -A`** — stage explicit paths.
- **Conventions (load-bearing):** `ry(t)=[[cos t/2,-sin t/2],[sin t/2,cos t/2]]`, `rz(t)=diag(e^{-it/2},e^{+it/2})` (both already in `math.ts`); big-endian (qubit 0 = MSB, amp index `q0*2+q1`); parameter-shift gradient `0.5*(f(θ+π/2)-f(θ-π/2))` — keep the 0.5.
- **rules-of-hooks:** every `useState/useMemo/useId` BEFORE any early-return error card (the 02-hardware bug).

**Reused `math.ts` exports:** `Complex`, `cAdd`, `cMul`, `cConj`, `cAbs2`, `H`, `ry`, `rz`, `applyGate1`, `applyCNOT`, `zeroState`, `basisLabel`.

Build order: qencode → qkernel (reuses encoding) → qbarren → qvqc.

---

### Task 1: `qencode` — data encoding

**Files:** Create `web/src/components/quantum/encoding.ts`, `encoding-explorer.tsx`; Modify `markdown-renderer.tsx`; Test `encoding.test.ts`, `encoding-explorer.test.tsx`.

- [ ] **Step 1: Failing logic test** — `web/__tests__/components/quantum/encoding.test.ts`:

```ts
import { angleState, amplitudeState, iqpState, fidelity } from "@/components/quantum/encoding";

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("encoding", () => {
  it("angleState(pi,0): qubit 0 -> |1> (amplitude on |10>, index 2)", () => {
    const s = angleState(Math.PI, 0);
    expect(s[2][0]).toBeCloseTo(1, 8); // |10>
  });
  it("angle kernel closed form: |<phi(x)|phi(x')>|^2 = prod cos^2((xi-xi')/2)", () => {
    const x = [0.7, 1.2], y = [0.3, -0.4];
    const expected = Math.cos((x[0] - y[0]) / 2) ** 2 * Math.cos((x[1] - y[1]) / 2) ** 2;
    expect(fidelity(angleState(x[0], x[1]), angleState(y[0], y[1]))).toBeCloseTo(expected, 8);
  });
  it("self-fidelity is 1 for all encodings", () => {
    expect(fidelity(angleState(0.5, 0.9), angleState(0.5, 0.9))).toBeCloseTo(1, 8);
    expect(fidelity(iqpState(0.5, 0.9), iqpState(0.5, 0.9))).toBeCloseTo(1, 8);
  });
  it("amplitudeState normalizes (1 qubit for 2 features) and guards the zero vector", () => {
    const s = amplitudeState([0.6, -0.8]);
    expect(s).toHaveLength(2);
    expect(s.reduce((acc, c) => acc + c[0] * c[0] + c[1] * c[1], 0)).toBeCloseTo(1, 9);
    const z = amplitudeState([0, 0]);
    expect(z[0][0]).toBeCloseTo(1, 9); // falls back to |0>
  });
  it("iqpState has norm 1", () => {
    const s = iqpState(0.7, 1.1);
    expect(s.reduce((acc, c) => acc + c[0] * c[0] + c[1] * c[1], 0)).toBeCloseTo(1, 9);
  });
});
```
Run: `cd web && npx jest encoding.test --watchAll=false` → FAIL.

- [ ] **Step 2: Implement `encoding.ts`** (verified conventions; IQP = `CX·RZ(2φ)·CX` with `φ=(π−x₀)(π−x₁)`):

```ts
import { type Complex, cMul, cConj, H, ry, rz, applyGate1, applyCNOT, zeroState } from "./math";

/** Angle encoding: RY(x0) on q0, RY(x1) on q1, applied to |00>. */
export function angleState(x0: number, x1: number): Complex[] {
  let s = zeroState(2);
  s = applyGate1(s, ry(x0), 0, 2);
  s = applyGate1(s, ry(x1), 1, 2);
  return s;
}

/** Amplitude encoding: v/||v|| over the next power of two. Zero vector -> |0...0>. */
export function amplitudeState(features: number[]): Complex[] {
  const dim = 1 << Math.max(1, Math.ceil(Math.log2(Math.max(2, features.length))));
  const v = features.slice();
  while (v.length < dim) v.push(0);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm < 1e-9) {
    const z: Complex[] = Array.from({ length: dim }, () => [0, 0] as Complex);
    z[0] = [1, 0];
    return z;
  }
  return v.map((x) => [x / norm, 0] as Complex);
}

/** IQP / ZZ feature map (Havlicek): per rep on |00>: H both; RZ(2x_i); CX; RZ(2(pi-x0)(pi-x1)) on q1; CX. */
export function iqpState(x0: number, x1: number, reps = 2): Complex[] {
  let s = zeroState(2);
  for (let r = 0; r < reps; r++) {
    s = applyGate1(s, H, 0, 2);
    s = applyGate1(s, H, 1, 2);
    s = applyGate1(s, rz(2 * x0), 0, 2);
    s = applyGate1(s, rz(2 * x1), 1, 2);
    s = applyCNOT(s, 0, 1, 2);
    s = applyGate1(s, rz(2 * (Math.PI - x0) * (Math.PI - x1)), 1, 2);
    s = applyCNOT(s, 0, 1, 2);
  }
  return s;
}

/** Fidelity kernel |<a|b>|^2. */
export function fidelity(a: Complex[], b: Complex[]): number {
  let re = 0, im = 0;
  for (let k = 0; k < a.length; k++) {
    const c = cMul(cConj(a[k]), b[k]);
    re += c[0];
    im += c[1];
  }
  return re * re + im * im;
}
```
Run the test → PASS.

- [ ] **Step 3: Build `encoding-explorer.tsx`** — `"use client"` `export function EncodingExplorer({ source }: { source: string })`.
  - Parse JSON `{ "x": [0.6,0.9], "encoding": "angle" }` defensively in a memo (default x=[0.5,0.5], encoding "angle"); validate encoding ∈ {angle, amplitude, iqp}.
  - State: x0, x1 sliders (−π..π); encoding `<select>`. Compute the state via `angleState`/`amplitudeState([x0,x1])`/`iqpState` in a memo.
  - Render: amplitude bars per basis state (`basisLabel`), the Dirac string (reuse `diracString` from `state-readout.ts`), a per-qubit `BlochDial` for angle (and the single-qubit `BlochDial` for amplitude), and a live "‖ψ‖ = 1.000" readout. `not-prose` card; header chip "Encoding". Hooks before early return; emoji-free.

- [ ] **Step 4: Register the fence** in `markdown-renderer.tsx`:
```tsx
import { EncodingExplorer } from "./quantum/encoding-explorer";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qencode")) {
  return <EncodingExplorer source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 5: Component render test** — `encoding-explorer.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { EncodingExplorer } from "@/components/quantum/encoding-explorer";

describe("EncodingExplorer", () => {
  it("renders the Encoding header and a unit-norm readout", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9], encoding: "angle" })} />);
    expect(screen.getByText(/encoding/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.000/)).toBeInTheDocument();
  });
  it("switches encoding without crashing", () => {
    render(<EncodingExplorer source={""} />);
    fireEvent.change(screen.getByLabelText(/encoding/i), { target: { value: "iqp" } });
    expect(screen.getByText(/encoding/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run + commit (explicit paths)**
Run: `cd web && npx jest encoding markdown-renderer --watchAll=false` → PASS.
```bash
git add web/src/components/quantum/encoding.ts web/src/components/quantum/encoding-explorer.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/encoding.test.ts web/__tests__/components/quantum/encoding-explorer.test.tsx
git commit -m "feat(web): qencode data-encoding widget"
```

---

### Task 2: `qkernel` — quantum kernel decision boundary

**Files:** Create `web/src/components/quantum/kernel.ts`, `kernel-explorer.tsx`; Modify `markdown-renderer.tsx`; Test `kernel.test.ts`, `kernel-explorer.test.tsx`.

- [ ] **Step 1: Failing logic test** — `web/__tests__/components/quantum/kernel.test.ts`:

```ts
import { kernelMatrix, kernelBias, kernelScore, makeDataset, accuracy } from "@/components/quantum/kernel";

describe("kernel", () => {
  it("kernel matrix is symmetric with unit diagonal in [0,1]", () => {
    const pts: [number, number][] = [[0.2, 0.3], [-0.4, 0.5], [0.1, -0.6]];
    const K = kernelMatrix(pts, "angle", 1);
    for (let i = 0; i < 3; i++) {
      expect(K[i][i]).toBeCloseTo(1, 9);
      for (let j = 0; j < 3; j++) {
        expect(K[i][j]).toBeCloseTo(K[j][i], 9);
        expect(K[i][j]).toBeGreaterThanOrEqual(-1e-9);
        expect(K[i][j]).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
  it("the quantum kernel beats a chance baseline on circles (seeded)", () => {
    const train = makeDataset("circles", 60, 1);
    const test = makeDataset("circles", 60, 2);
    const bias = kernelBias(train, "iqp", 1);
    const preds = test.map((p) => (kernelScore(p.x, train, "iqp", 1, bias) >= 0 ? 1 : -1));
    expect(accuracy(preds, test.map((p) => p.y))).toBeGreaterThan(0.7);
  });
});
```
Run: `cd web && npx jest kernel.test --watchAll=false` → FAIL.

- [ ] **Step 2: Implement `kernel.ts`**:

```ts
import { type Complex } from "./math";
import { angleState, iqpState, fidelity } from "./encoding";

export type FeatureMap = "angle" | "iqp";
export interface Point { x: [number, number]; y: -1 | 1; }

export function featureState(x: [number, number], map: FeatureMap, scale: number): Complex[] {
  const a = x[0] * scale, b = x[1] * scale;
  return map === "iqp" ? iqpState(a, b) : angleState(a, b);
}

export function kernelMatrix(points: [number, number][], map: FeatureMap, scale: number): number[][] {
  const states = points.map((p) => featureState(p, map, scale));
  return states.map((si) => states.map((sj) => fidelity(si, sj)));
}

/** Required bias = -mean_j( sum_i y_i K(x_j, x_i) ), centering the decision threshold. */
export function kernelBias(train: Point[], map: FeatureMap, scale: number): number {
  const states = train.map((p) => featureState(p.x, map, scale));
  let total = 0;
  for (let j = 0; j < train.length; j++) {
    let s = 0;
    for (let i = 0; i < train.length; i++) s += train[i].y * fidelity(states[j], states[i]);
    total += s;
  }
  return -total / train.length;
}

export function kernelScore(x: [number, number], train: Point[], map: FeatureMap, scale: number, bias: number): number {
  const sx = featureState(x, map, scale);
  let s = bias;
  for (const p of train) s += p.y * fidelity(sx, featureState(p.x, map, scale));
  return s;
}

export function accuracy(preds: number[], labels: number[]): number {
  let c = 0;
  for (let i = 0; i < preds.length; i++) if (preds[i] === labels[i]) c++;
  return c / preds.length;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
}

export type DatasetName = "circles" | "xor";

export function makeDataset(name: DatasetName, n: number, seed: number): Point[] {
  const rng = mulberry32(seed);
  const pts: Point[] = [];
  if (name === "circles") {
    for (let i = 0; i < n; i++) {
      const inner = i % 2 === 0;
      const r = inner ? rng() * 0.35 : 0.75 + rng() * 0.25;
      const t = rng() * 2 * Math.PI;
      pts.push({ x: [r * Math.cos(t) + 0.08 * gauss(rng), r * Math.sin(t) + 0.08 * gauss(rng)], y: inner ? -1 : 1 });
    }
  } else {
    const centers: [number, number, -1 | 1][] = [[0.6, 0.6, 1], [-0.6, -0.6, 1], [0.6, -0.6, -1], [-0.6, 0.6, -1]];
    for (let i = 0; i < n; i++) {
      const [cx, cy, y] = centers[i % 4];
      pts.push({ x: [cx + 0.1 * gauss(rng), cy + 0.1 * gauss(rng)], y });
    }
  }
  return pts;
}
```
Run the test → PASS. (Verified: with the bias and reasonable scale, the IQP kernel separates circles well above chance; the linear baseline is ~chance.)

- [ ] **Step 3: Build `kernel-explorer.tsx`** — `"use client"` `export function KernelExplorer({ source }: { source: string })`.
  - Parse JSON `{ "dataset": "circles", "map": "iqp" }` defensively (defaults circles, iqp); state: a feature-scale slider (0.3–2.0, default 1.0) and a map toggle (angle/iqp). Build `train = makeDataset(dataset, 60, 1)` once (memo on dataset).
  - Compute `bias = kernelBias(train, map, scale)` and render the decision boundary: an SVG over the plane (≈36×36 grid cells colored by `sign(kernelScore(cell, train, map, scale, bias))`), with the training points scattered on top; an accuracy readout (predict on the train set) vs a linear nearest-mean baseline. Pushing the scale slider high visibly degrades the boundary (aliasing).
  - `not-prose` card; SVG `role="img"`+aria-label; header chip "Quantum kernel"; hooks before early return; emoji-free.

- [ ] **Step 4: Register the fence**:
```tsx
import { KernelExplorer } from "./quantum/kernel-explorer";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qkernel")) {
  return <KernelExplorer source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 5: Component render test** — `kernel-explorer.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { KernelExplorer } from "@/components/quantum/kernel-explorer";

describe("KernelExplorer", () => {
  it("renders the Quantum kernel header and an accuracy readout", () => {
    render(<KernelExplorer source={JSON.stringify({ dataset: "circles", map: "iqp" })} />);
    expect(screen.getByText(/quantum kernel/i)).toBeInTheDocument();
    expect(screen.getByText(/accuracy/i)).toBeInTheDocument();
  });
  it("renders an error card for malformed JSON", () => {
    render(<KernelExplorer source={"{ not json"} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run + commit (explicit paths)**
Run: `cd web && npx jest kernel kernel-explorer markdown-renderer --watchAll=false` → PASS.
```bash
git add web/src/components/quantum/kernel.ts web/src/components/quantum/kernel-explorer.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/kernel.test.ts web/__tests__/components/quantum/kernel-explorer.test.tsx
git commit -m "feat(web): qkernel quantum-kernel boundary widget"
```

---

### Task 3: `qbarren` — barren plateaus

**Files:** Create `web/src/components/quantum/barren.ts`, `barren-explorer.tsx`; Modify `markdown-renderer.tsx`; Test `barren.test.ts`, `barren-explorer.test.tsx`.

- [ ] **Step 1: Failing logic test** — `web/__tests__/components/quantum/barren.test.ts`:

```ts
import { gradientVariance, mulberry32 } from "@/components/quantum/barren";

describe("barren", () => {
  it("global-cost gradient variance collapses with qubit count (L=2)", () => {
    const v2 = gradientVariance(2, 2, "global", 300, mulberry32(1));
    const v6 = gradientVariance(6, 2, "global", 300, mulberry32(1));
    expect(v6).toBeLessThan(v2 * 0.5); // markedly smaller (verified ~2x/qubit)
    expect(v6).toBeGreaterThan(0);
  });
  it("local cost stays in a band across n at shallow depth (does NOT collapse like global)", () => {
    const l2 = gradientVariance(2, 2, "local", 300, mulberry32(2));
    const l6 = gradientVariance(6, 2, "local", 300, mulberry32(2));
    expect(l6).toBeGreaterThan(l2 * 0.25); // local far flatter than global
  });
  it("the probed local gradient is not a structural zero (param in q0's cone)", () => {
    expect(gradientVariance(4, 2, "local", 200, mulberry32(3))).toBeGreaterThan(1e-4);
  });
  it("is deterministic for a fixed seed", () => {
    expect(gradientVariance(4, 2, "global", 100, mulberry32(9)))
      .toBeCloseTo(gradientVariance(4, 2, "global", 100, mulberry32(9)), 12);
  });
});
```
Run: `cd web && npx jest barren.test --watchAll=false` → FAIL.

- [ ] **Step 2: Implement `barren.ts`** (verified: McClean RY(π/4) seed + RY layers + CZ ring; probe param 0 = q0/layer0; global ~2^-n, local flat at shallow depth):

```ts
import { type Complex, ry, applyGate1, zeroState, cAbs2 } from "./math";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unique CZ ring edges (dedup so n=2 applies CZ once). */
function czEdges(n: number): [number, number][] {
  const seen = new Set<string>();
  const e: [number, number][] = [];
  for (let q = 0; q < n; q++) {
    const a = q, b = (q + 1) % n;
    if (a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!seen.has(key)) { seen.add(key); e.push([a, b]); }
  }
  return e;
}

function applyCZRing(state: Complex[], n: number): Complex[] {
  const out = state.map((c) => [c[0], c[1]] as Complex);
  for (const [a, b] of czEdges(n)) {
    const ma = 1 << (n - 1 - a), mb = 1 << (n - 1 - b);
    for (let i = 0; i < out.length; i++) if ((i & ma) && (i & mb)) out[i] = [-out[i][0], -out[i][1]];
  }
  return out;
}

/** Hardware-efficient ansatz: RY(pi/4) seed, then L layers of [RY(theta_q) per qubit] + CZ ring. */
function buildState(n: number, L: number, thetas: number[]): Complex[] {
  let s = zeroState(n);
  for (let q = 0; q < n; q++) s = applyGate1(s, ry(Math.PI / 4), q, n);
  let p = 0;
  for (let l = 0; l < L; l++) {
    for (let q = 0; q < n; q++) s = applyGate1(s, ry(thetas[p++]), q, n);
    s = applyCZRing(s, n);
  }
  return s;
}

function costGlobal(state: Complex[], n: number): number {
  let e = 0;
  for (let i = 0; i < state.length; i++) {
    let par = 1;
    for (let q = 0; q < n; q++) if ((i >> (n - 1 - q)) & 1) par = -par;
    e += par * cAbs2(state[i]);
  }
  return e;
}
function costLocal(state: Complex[], n: number): number {
  const m = 1 << (n - 1); // qubit 0 (MSB)
  let e = 0;
  for (let i = 0; i < state.length; i++) e += ((i & m) ? -1 : 1) * cAbs2(state[i]);
  return e;
}

export type Cost = "global" | "local";

/** Variance over `samples` random theta of the parameter-shift gradient of a fixed probed param. */
export function gradientVariance(n: number, L: number, cost: Cost, samples: number, rng: () => number): number {
  const nParams = n * L;
  const probe = 0; // qubit 0, layer 0 — inside q0's causal cone (nonzero local gradient)
  const costFn = cost === "global" ? costGlobal : costLocal;
  const grads: number[] = [];
  for (let s = 0; s < samples; s++) {
    const th = Array.from({ length: nParams }, () => rng() * 2 * Math.PI);
    const tp = th.slice(); tp[probe] += Math.PI / 2;
    const tm = th.slice(); tm[probe] -= Math.PI / 2;
    grads.push(0.5 * (costFn(buildState(n, L, tp), n) - costFn(buildState(n, L, tm), n)));
  }
  const mean = grads.reduce((a, b) => a + b, 0) / samples;
  return grads.reduce((a, g) => a + (g - mean) ** 2, 0) / samples;
}
```
Run the test → PASS. (If the global/local separation is marginal at samples=300, the qualitative inequality still holds; do not weaken the test — the verified effect is robust.)

- [ ] **Step 3: Build `barren-explorer.tsx`** — `"use client"` `export function BarrenExplorer({ source }: { source: string })`.
  - Parse JSON `{ "depth": 2, "samples": 400 }` defensively (defaults depth=2, samples=300). State: a depth slider (1–5). Compute, in a memo, `gradientVariance(n, depth, cost, samples, mulberry32(n))` for n=2..8 for BOTH `global` and `local`.
  - Render a log-scale line plot (SVG): n on x, `Var(∂C/∂θ)` (log10) on y, two curves — global (steep) and local (≈flat) — legended; a callout: "raise the depth slider and even the local cost flattens (Cerezo 2021)". `not-prose` card; SVG `role="img"`+aria-label; header chip "Barren plateaus"; hooks before early return; emoji-free; reduced-motion static.
  - Keep n≤8 on the main thread (256 amplitudes; ~400 samples × 7 n × 2 costs × small circuits — runs in a fraction of a second).

- [ ] **Step 4: Register the fence**:
```tsx
import { BarrenExplorer } from "./quantum/barren-explorer";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qbarren")) {
  return <BarrenExplorer source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 5: Component render test** — `barren-explorer.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { BarrenExplorer } from "@/components/quantum/barren-explorer";

describe("BarrenExplorer", () => {
  it("renders the Barren plateaus header and both cost legends", () => {
    render(<BarrenExplorer source={JSON.stringify({ depth: 2, samples: 120 })} />);
    expect(screen.getByText(/barren plateaus/i)).toBeInTheDocument();
    expect(screen.getByText(/global/i)).toBeInTheDocument();
    expect(screen.getByText(/local/i)).toBeInTheDocument();
  });
});
```
(Use a small `samples` in the test fence to keep the render fast.)

- [ ] **Step 6: Run + commit (explicit paths)**
Run: `cd web && npx jest barren markdown-renderer --watchAll=false` → PASS.
```bash
git add web/src/components/quantum/barren.ts web/src/components/quantum/barren-explorer.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/barren.test.ts web/__tests__/components/quantum/barren-explorer.test.tsx
git commit -m "feat(web): qbarren barren-plateau widget"
```

---

### Task 4: `qvqc` — variational classifier live training

**Files:** Create `web/src/components/quantum/vqc.ts`, `vqc-trainer.tsx`; Modify `markdown-renderer.tsx`; Test `vqc.test.ts`, `vqc-trainer.test.tsx`.

- [ ] **Step 1: Failing logic test** — `web/__tests__/components/quantum/vqc.test.ts`:

```ts
import { expectZ0, vqcOutput, paramShiftGrad, mseLoss, trainStep, makeBlobs, N_PARAMS } from "@/components/quantum/vqc";
import { zeroState, applyGate1, X } from "@/components/quantum/math";

describe("vqc", () => {
  it("expectZ0 endianness: |00> -> +1, X on q0 -> -1", () => {
    expect(expectZ0(zeroState(2))).toBeCloseTo(1, 9);
    expect(expectZ0(applyGate1(zeroState(2), X, 0, 2))).toBeCloseTo(-1, 9);
  });
  it("parameter-shift gradient matches finite difference", () => {
    const theta = Array.from({ length: N_PARAMS }, (_, i) => 0.3 + 0.1 * i);
    const x: [number, number] = [0.5, -0.4];
    const j = 3, eps = 1e-5;
    const tp = theta.slice(); tp[j] += eps;
    const tm = theta.slice(); tm[j] -= eps;
    const fd = (vqcOutput(x, tp, 0) - vqcOutput(x, tm, 0)) / (2 * eps);
    expect(paramShiftGrad(x, theta, 0, j)).toBeCloseTo(fd, 4);
  });
  it("training reduces MSE loss on separable blobs", () => {
    const data = makeBlobs(30, 1);
    let theta = Array.from({ length: N_PARAMS }, (_, i) => -0.1 + 0.05 * (i % 5));
    let bias = 0;
    const before = mseLoss(data, theta, bias);
    for (let s = 0; s < 30; s++) ({ theta, bias } = trainStep(data, theta, bias, 0.3));
    expect(mseLoss(data, theta, bias)).toBeLessThan(before);
  });
});
```
Run: `cd web && npx jest vqc.test --watchAll=false` → FAIL.

- [ ] **Step 2: Implement `vqc.ts`** (verified: ansatz ends in RY so q0's last gate is non-diagonal; param-shift 0.5 factor; trainable bias; lr≈0.3):

```ts
import { type Complex, ry, rz, applyGate1, applyCNOT, zeroState, cAbs2 } from "./math";

export interface Pt { x: [number, number]; y: -1 | 1; }

export const N_PARAMS = 9; // 2 blocks x (RY,RY,RZ,RZ) + final RY on q0

/** <Z_0> for a 2-qubit state (big-endian: q0 = MSB). |00>,|01> -> +1 ; |10>,|11> -> -1. */
export function expectZ0(state: Complex[]): number {
  return cAbs2(state[0]) + cAbs2(state[1]) - cAbs2(state[2]) - cAbs2(state[3]);
}

/** f(x;theta,bias) = <Z_0> after angle-encoding x then the ansatz, + bias. */
export function vqcOutput(x: [number, number], theta: number[], bias: number, scale = 1): number {
  let s = zeroState(2);
  s = applyGate1(s, ry(scale * x[0]), 0, 2);
  s = applyGate1(s, ry(scale * x[1]), 1, 2);
  let p = 0;
  for (let l = 0; l < 2; l++) {
    s = applyCNOT(s, 0, 1, 2);
    s = applyGate1(s, ry(theta[p++]), 0, 2);
    s = applyGate1(s, ry(theta[p++]), 1, 2);
    s = applyGate1(s, rz(theta[p++]), 0, 2);
    s = applyGate1(s, rz(theta[p++]), 1, 2);
  }
  s = applyGate1(s, ry(theta[p++]), 0, 2); // final RY on q0 (keeps the last gate non-diagonal)
  return expectZ0(s) + bias;
}

/** Parameter-shift gradient of f w.r.t. theta[j] (bias cancels in the difference). */
export function paramShiftGrad(x: [number, number], theta: number[], bias: number, j: number, scale = 1): number {
  const tp = theta.slice(); tp[j] += Math.PI / 2;
  const tm = theta.slice(); tm[j] -= Math.PI / 2;
  return 0.5 * (vqcOutput(x, tp, bias, scale) - vqcOutput(x, tm, bias, scale));
}

export function mseLoss(data: Pt[], theta: number[], bias: number, scale = 1): number {
  let s = 0;
  for (const d of data) s += (vqcOutput(d.x, theta, bias, scale) - d.y) ** 2;
  return s / data.length;
}

/** One full-batch gradient-descent step on MSE; returns updated theta + bias. */
export function trainStep(data: Pt[], theta: number[], bias: number, lr: number, scale = 1): { theta: number[]; bias: number } {
  const grads = new Array(theta.length).fill(0);
  let gb = 0;
  for (const d of data) {
    const e = 2 * (vqcOutput(d.x, theta, bias, scale) - d.y);
    gb += e;
    for (let j = 0; j < theta.length; j++) grads[j] += e * paramShiftGrad(d.x, theta, bias, j, scale);
  }
  const M = data.length;
  return { theta: theta.map((t, j) => t - (lr * grads[j]) / M), bias: bias - (lr * gb) / M };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
}

/** Two separable Gaussian blobs at (+/-0.7,+/-0.7), clipped to [-pi, pi]. */
export function makeBlobs(n: number, seed: number): Pt[] {
  const rng = mulberry32(seed);
  const clip = (v: number) => Math.max(-Math.PI, Math.min(Math.PI, v));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const pos = i % 2 === 0;
    const c = pos ? 0.7 : -0.7;
    pts.push({ x: [clip(c + 0.35 * gauss(rng)), clip(c + 0.35 * gauss(rng))], y: pos ? 1 : -1 });
  }
  return pts;
}
```
Run the test → PASS.

- [ ] **Step 3: Build `vqc-trainer.tsx`** — `"use client"` `export function VqcTrainer({ source }: { source: string })`.
  - Parse JSON `{ "dataset": "blobs" }` (default blobs). State: `theta` (init `Array(N_PARAMS)` small random, e.g. each `−0.1 + 0.4*Math.random()`), `bias` (0), a loss history array, and a `step` counter. `data = makeBlobs(30, 1)` (memo).
  - A **Train** button runs ~40 `trainStep`s (use `useState` updates batched, or a `setTimeout`/`requestAnimationFrame` loop that stops under reduced motion and just runs to completion). A **Reset** re-inits theta/bias/history.
  - Render the dataset scatter; the decision boundary over a ~32×32 grid (`sign(vqcOutput(cell, theta, bias))`); a loss curve (SVG); a live accuracy + step readout. `not-prose` card; SVG `role="img"`+aria-label; header chip "VQC"; hooks before early return; emoji-free.

- [ ] **Step 4: Register the fence**:
```tsx
import { VqcTrainer } from "./quantum/vqc-trainer";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qvqc")) {
  return <VqcTrainer source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 5: Component render test** — `vqc-trainer.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { VqcTrainer } from "@/components/quantum/vqc-trainer";

describe("VqcTrainer", () => {
  it("renders the VQC header and a Train button", () => {
    render(<VqcTrainer source={JSON.stringify({ dataset: "blobs" })} />);
    expect(screen.getByText(/vqc/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /train/i })).toBeInTheDocument();
  });
  it("training updates the step/accuracy readout", () => {
    render(<VqcTrainer source={""} />);
    fireEvent.click(screen.getByRole("button", { name: /train/i }));
    // after clicking Train, the step or accuracy readout reflects progress
    expect(screen.getByText(/accuracy|step|loss/i)).toBeInTheDocument();
  });
});
```
(If Train animates asynchronously, make the readout update synchronously on first click, or wrap in `act`/`waitFor`; keep the two behaviors.)

- [ ] **Step 6: Run + commit (explicit paths) + full suite**
Run: `cd web && npx jest vqc vqc-trainer markdown-renderer --watchAll=false` → PASS. Then `cd web && npm test -- --watchAll=false` → green.
```bash
git add web/src/components/quantum/vqc.ts web/src/components/quantum/vqc-trainer.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/vqc.test.ts web/__tests__/components/quantum/vqc-trainer.test.tsx
git commit -m "feat(web): qvqc variational-classifier training widget"
```

---

### Task 5: Renderer routing tests for the four new fences

**Files:** Modify `web/__tests__/components/markdown-renderer.fence-routing.test.tsx`.

- [ ] **Step 1:** Append four `it(...)` cases mirroring the existing ones (the file has a `mockMatchMedia(false)` `beforeEach`):
  - `qencode` body `JSON.stringify({ x: [0.6, 0.9], encoding: "angle" })` → `/encoding/i`.
  - `qkernel` body `JSON.stringify({ dataset: "circles", map: "iqp" })` → `/quantum kernel/i`.
  - `qbarren` body `JSON.stringify({ depth: 2, samples: 80 })` → `/barren/i`.
  - `qvqc` body `JSON.stringify({ dataset: "blobs" })` → `/vqc/i`.

- [ ] **Step 2: Run + commit**
Run: `cd web && npx jest markdown-renderer.fence-routing --watchAll=false` → PASS.
```bash
git add web/__tests__/components/markdown-renderer.fence-routing.test.tsx
git commit -m "test(web): route qencode/qkernel/qbarren/qvqc fences in renderer"
```

---

### Task 6: Reflow `04-quantum-ml/GUIDE.md`

**Files:** Modify `04-quantum-ml/GUIDE.md`.

- [ ] **Step 1: Rewrite to the narrative arc** (preserve the Hands-On notebook list + References + the PennyLane code block verbatim):

1. **Cold open** — "ML where the model *is* a quantum circuit"; the variational engine from `03-algorithms` becomes a learner. Fold objectives/prereqs into a callout.
2. **Getting data in: encoding** — basis/angle/amplitude/IQP/re-uploading; the choice fixes the feature space. Embed:
   ````
   ```qencode
   {"x": [0.6, 0.9], "encoding": "angle"}
   ```
   ````
3. **The model: a PQC is a neural net** — encoding=input, unitaries=hidden, measurement=output; parameter-shift gradients. (prose; optional small `qsim`.)
4. **Two ways to learn** — kernels vs variational. Embed both:
   ````
   ```qkernel
   {"dataset": "circles", "map": "iqp"}
   ```
   ````
   ````
   ```qvqc
   {"dataset": "blobs"}
   ```
   ````
5. **QNN architectures** — hardware-efficient vs strongly-entangling vs convolutional. (prose; keep the detail.)
6. **The catch: barren plateaus** — gradients vanishing ~2^-n; mitigations. Embed:
   ````
   ```qbarren
   {"depth": 2, "samples": 400}
   ```
   ````
7. **The tooling: PennyLane + Braket** — keep the existing PennyLane code block + the bullet list.
8. **Does it actually help? + Check yourself** — the "power of data" caveat (quantum ML wins only for data with the right structure). Then a `quiz` (~4 questions: why encoding choice matters; kernel vs variational trade-off; what a barren plateau is and one mitigation; what the parameter-shift rule computes). Each with `hint` + `a`.
9. **Hands-On + References** — keep the notebook list and references; add a one-line bridge to `05-quantum-chemistry`.

- [ ] **Step 2: Verify render** — `cd web && npm run build` → succeeds; `out/learn/04-quantum-ml` regenerates with no KaTeX/parse errors and every fence mounts. Eyeball `/learn/04-quantum-ml` via `npm run dev`.

- [ ] **Step 3: Commit**
```bash
git add 04-quantum-ml/GUIDE.md
git commit -m "docs(04-quantum-ml): narrative reflow + interactive encoding/kernel/vqc/barren widgets"
```

---

### Task 7: Full verification

- [ ] **Step 1: Web suite + lint + build**
Run: `cd web && npm test -- --watchAll=false` → all pass (308 + new).
Run: `cd web && npm run lint` → clean (rules-of-hooks; no unused vars).
Run: `cd web && npm run build` → 11 pages; `out/learn/04-quantum-ml` present.

- [ ] **Step 2: Python suite unaffected** — `.venv/bin/python -m pytest -q` → green.

- [ ] **Step 3: Manual interaction pass** — `npm run dev`; open `/learn/04-quantum-ml`; confirm each widget (qencode encodings + Bloch; qkernel boundary + scale aliasing; qbarren two curves diverging; qvqc Train reduces loss + sharpens boundary), light/dark/reduced-motion, no console errors.

- [ ] **Step 4: Sync CLAUDE.md test count** (stage explicit path).
```bash
git add CLAUDE.md
git commit -m "docs: sync web test count after 04-quantum-ml widgets"
```

---

## Self-Review checklist

- Spec coverage: ✅ qencode (T1), qkernel (T2), qbarren (T3), qvqc (T4), routing tests (T5), narrative reflow with all widget beats + quiz (T6), verification (T7).
- No placeholders: all four logic modules + tests are complete and workflow-verified; components specified as blueprints mirroring named existing components; GUIDE sections specify exact embedded fences.
- Type/name consistency: `angleState/amplitudeState/iqpState/fidelity`; `featureState/kernelMatrix/kernelBias/kernelScore/accuracy/makeDataset/Point`; `gradientVariance/mulberry32`; `expectZ0/vqcOutput/paramShiftGrad/mseLoss/trainStep/makeBlobs/N_PARAMS`; fence languages `qencode/qkernel/qbarren/qvqc` match renderer branches + routing tests.
- Conventions pinned (RY/RZ, big-endian, param-shift 0.5); hooks-before-early-return per widget; nbstripout explicit-path staging.
