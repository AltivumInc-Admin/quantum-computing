# 03-algorithms Module Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reflow the `03-algorithms` GUIDE into an "interference → speedup" narrative and add four pure-client algorithm widgets — `qgrover`, `qoptim`, `qft`, `qdj` — that run the algorithms the prose describes.

**Architecture:** Each widget is a client React component under `web/src/components/quantum/`, routed by a new `language-*` branch in `markdown-renderer.tsx` (same pattern as the 12 existing fences). Pure quantum logic lives in four small modules (`grover.ts`, `qaoa.ts`, `qft.ts`, `deutsch-jozsa.ts`) built on `math.ts`. No AWS, no SSR — static-export safe. **All algorithm math and every pinned test value below were independently verified (3 adversarial recomputations each) before this plan was written.**

**Tech Stack:** Next.js 16 / React 19, TypeScript, Tailwind v4, Jest + RTL (component tests use a `/** @jest-environment jsdom */` docblock; pure-logic tests run in the default node env), KaTeX.

**Branch:** `feat/03-algorithms-overhaul` (spec already committed there). Run web commands from `web/`.

**CRITICAL repo gotcha:** `.gitattributes` runs `nbstripout`, so notebooks perpetually show "modified" in `git status` (on-disk == HEAD). **Never `git add -A`/`git add .`** — stage explicit paths only.

**Conventions to reuse:** mirror the `not-prose` card chrome + probability-bar markup + parse-error card of `web/src/components/quantum/circuit-lab.tsx`; mirror the JSON-fence error card of `challenge.tsx`; reuse `math.ts` (`Complex`, `Gate2`, `cAdd`, `cMul`, `cAbs2`, `H`, `applyGate1`, `rx`, `basisLabel`).

**RULES-OF-HOOKS (learned from 02-hardware):** call every React hook (`useState`/`useMemo`/`useId`) UNCONDITIONALLY, before any early-return error card. Compute derived values (incl. parse results) in memos that run on every render and guard internally. `npm run lint` enforces this.

---

## File Structure

- `web/src/components/quantum/grover.ts` + `grover-visualizer.tsx` — `qgrover` (Task 1)
- `web/src/components/quantum/qft.ts` + `qft-visualizer.tsx` — `qft` (Task 2)
- `web/src/components/quantum/deutsch-jozsa.ts` + `dj-demo.tsx` — `qdj` (Task 3)
- `web/src/components/quantum/qaoa.ts` + `qaoa-explorer.tsx` — `qoptim` (Task 4)
- `web/src/components/markdown-renderer.tsx` — four new routing branches (Tasks 1–4)
- `web/__tests__/components/quantum/*.test.{ts,tsx}` — unit + render tests (each task)
- `web/__tests__/components/markdown-renderer.fence-routing.test.tsx` — +4 cases (Task 5)
- `03-algorithms/GUIDE.md` — narrative reflow (Task 6)

Build order is simplest-math-first: qgrover, qft, qdj (real or simple), then qaoa (complex state + landscape).

---

### Task 1: `qgrover` — Grover amplitude amplification

**Files:** Create `web/src/components/quantum/grover.ts`, `web/src/components/quantum/grover-visualizer.tsx`; Modify `markdown-renderer.tsx`; Test `web/__tests__/components/quantum/grover.test.ts`, `grover-visualizer.test.tsx`.

- [ ] **Step 1: Write the failing logic test** — `web/__tests__/components/quantum/grover.test.ts`:

```ts
import { uniform, groverIteration, groverHistory, optimalIterations } from "@/components/quantum/grover";

describe("grover", () => {
  it("uniform start has equal amplitudes summing-of-squares to 1", () => {
    const a = uniform(3); // N=8
    expect(a).toHaveLength(8);
    a.forEach((x) => expect(x).toBeCloseTo(1 / Math.sqrt(8), 12));
    expect(a.reduce((s, x) => s + x * x, 0)).toBeCloseTo(1, 12);
  });
  it("N=4: exactly 1 iteration gives P(marked)=1", () => {
    const hist = groverHistory(2, 2, 1); // n=2, marked=2, 1 iter
    const amp = hist[1][2];
    expect(amp * amp).toBeCloseTo(1, 10);
  });
  it("N=8: optimal=2 and P(marked)=121/128 at 2 iterations", () => {
    expect(optimalIterations(3)).toBe(2);
    const hist = groverHistory(3, 5, 2);
    expect(hist[3 - 1][5] ** 2).toBeCloseTo(121 / 128, 10); // hist[2] = after 2 iters
  });
  it("each iteration preserves normalization", () => {
    let a = uniform(3);
    for (let k = 0; k < 5; k++) {
      a = groverIteration(a, 5);
      expect(a.reduce((s, x) => s + x * x, 0)).toBeCloseTo(1, 10);
    }
  });
  it("rejects more than 4 qubits", () => {
    expect(() => groverHistory(5, 0, 1)).toThrow();
  });
});
```
Run: `cd web && npx jest grover.test --watchAll=false` → FAIL.

- [ ] **Step 2: Implement `grover.ts`** (verified: oracle negates marked; diffusion = inversion about the mean = 2|s⟩⟨s|−I):

```ts
/** Grover's search on N = 2^n items, real amplitudes (single marked item). */
export function uniform(n: number): number[] {
  const N = 1 << n;
  return new Array(N).fill(1 / Math.sqrt(N));
}

/** One Grover iteration: oracle (negate marked) then diffusion (reflect about the mean). */
export function groverIteration(amps: number[], marked: number): number[] {
  const a = amps.slice();
  a[marked] = -a[marked];
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  return a.map((x) => 2 * mean - x);
}

/** Amplitude vectors for iterations 0..iterations (inclusive); hist[k] is after k iterations. */
export function groverHistory(n: number, marked: number, iterations: number): number[][] {
  if (n > 4) throw new Error("qgrover supports up to 4 qubits (N <= 16)");
  let a = uniform(n);
  const hist = [a];
  for (let k = 0; k < iterations; k++) {
    a = groverIteration(a, marked);
    hist.push(a);
  }
  return hist;
}

/** Standard near-optimal iteration count: round((pi/4)*sqrt(N) - 0.5). */
export function optimalIterations(n: number): number {
  const N = 1 << n;
  return Math.round((Math.PI / 4) * Math.sqrt(N) - 0.5);
}
```
Run the test → PASS. (Verified exact: N=4/1-iter P=1.0; N=8/2-iter P=121/128=0.9453125; optimalIterations(3)=2.)

- [ ] **Step 3: Build `grover-visualizer.tsx`** — `"use client"` `export function GroverVisualizer({ source }: { source: string })`.
  - Parse JSON `{ "qubits": 3, "marked": 5 }` defensively in a memo; defaults n=3, marked=0; validate n in 2..4 and marked in 0..N-1; on invalid render an error card ("grover error: …", mirror challenge.tsx).
  - State: an `iterations` slider 0..`2*optimalIterations(n)+2` (so the user can over-rotate). Compute `groverHistory(n, marked, maxSlider)` once in a memo; show frame `hist[iterations]`.
  - Render amplitude bars per basis state (`basisLabel(idx, n)`), the marked state highlighted; a success-probability readout `hist[iterations][marked]**2` as a %; and an "optimal = K iterations" note. n + marked `<select>`s.
  - All hooks before the early return. `not-prose` card; header chip "Grover". Reduced-motion: static bars. Emoji-free.

- [ ] **Step 4: Register the fence** in `markdown-renderer.tsx`:
```tsx
import { GroverVisualizer } from "./quantum/grover-visualizer";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qgrover")) {
  return <GroverVisualizer source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 5: Component render test** — `grover-visualizer.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { GroverVisualizer } from "@/components/quantum/grover-visualizer";

describe("GroverVisualizer", () => {
  it("renders Grover header and the optimal-iteration note for N=8", () => {
    render(<GroverVisualizer source={JSON.stringify({ qubits: 3, marked: 5 })} />);
    expect(screen.getByText(/grover/i)).toBeInTheDocument();
    expect(screen.getByText(/optimal/i)).toBeInTheDocument();
  });
  it("renders an error card for an out-of-range marked index", () => {
    render(<GroverVisualizer source={JSON.stringify({ qubits: 2, marked: 9 })} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run + commit (explicit paths)**
Run: `cd web && npx jest grover markdown-renderer --watchAll=false` → PASS.
```bash
git add web/src/components/quantum/grover.ts web/src/components/quantum/grover-visualizer.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/grover.test.ts web/__tests__/components/quantum/grover-visualizer.test.tsx
git commit -m "feat(web): qgrover amplitude-amplification widget"
```

---

### Task 2: `qft` — Quantum Fourier Transform visualizer

**Files:** Create `web/src/components/quantum/qft.ts`, `qft-visualizer.tsx`; Modify `markdown-renderer.tsx`; Test `qft.test.ts`, `qft-visualizer.test.tsx`.

- [ ] **Step 1: Failing logic test** — `web/__tests__/components/quantum/qft.test.ts`:

```ts
import { qft, basisState, periodicState } from "@/components/quantum/qft";

const mag = (c: [number, number]) => Math.hypot(c[0], c[1]);

describe("qft", () => {
  it("QFT of |0> is uniform magnitude 1/sqrt(N)", () => {
    const out = qft(basisState(3, 0)); // N=8
    out.forEach((c) => expect(mag(c)).toBeCloseTo(1 / Math.sqrt(8), 10));
  });
  it("is norm-preserving", () => {
    const out = qft(periodicState(4, 4));
    const norm = out.reduce((s, c) => s + c[0] * c[0] + c[1] * c[1], 0);
    expect(norm).toBeCloseTo(1, 10);
  });
  it("period-r comb -> spikes every N/r, zero elsewhere", () => {
    const N = 16, r = 4; // spikes at multiples of N/r = 4
    const out = qft(periodicState(4, r));
    for (let k = 0; k < N; k++) {
      if (k % (N / r) === 0) expect(mag(out[k])).toBeGreaterThan(0.1);
      else expect(mag(out[k])).toBeLessThan(1e-9);
    }
  });
});
```
Run: `cd web && npx jest qft.test --watchAll=false` → FAIL.

- [ ] **Step 2: Implement `qft.ts`** (verified: forward sign +, 1/√N normalization):

```ts
import type { Complex } from "./math";

/** Quantum Fourier Transform as a DFT: out[k] = (1/sqrt(N)) sum_j amps[j] e^{+2*pi*i*j*k/N}. */
export function qft(amps: Complex[]): Complex[] {
  const N = amps.length;
  const norm = 1 / Math.sqrt(N);
  const out: Complex[] = [];
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let j = 0; j < N; j++) {
      const ang = (2 * Math.PI * j * k) / N;
      const c = Math.cos(ang), s = Math.sin(ang);
      re += amps[j][0] * c - amps[j][1] * s;
      im += amps[j][0] * s + amps[j][1] * c;
    }
    out.push([re * norm, im * norm]);
  }
  return out;
}

export function basisState(n: number, j: number): Complex[] {
  const N = 1 << n;
  const a: Complex[] = Array.from({ length: N }, () => [0, 0] as Complex);
  a[j] = [1, 0];
  return a;
}

/** Normalized comb: equal amplitude on indices j with j mod period === 0. */
export function periodicState(n: number, period: number): Complex[] {
  const N = 1 << n;
  const idx: number[] = [];
  for (let j = 0; j < N; j += period) idx.push(j);
  const amp = 1 / Math.sqrt(idx.length);
  const a: Complex[] = Array.from({ length: N }, () => [0, 0] as Complex);
  for (const j of idx) a[j] = [amp, 0];
  return a;
}
```
Run the test → PASS.

- [ ] **Step 3: Build `qft-visualizer.tsx`** — `"use client"` `export function QftVisualizer({ source }: { source: string })`.
  - Parse JSON `{ "qubits": 4, "input": "period:4" }` or `{ "qubits": 4, "basis": 3 }` defensively; default n=4, period-4 comb; validate n in 2..4. Build the input via `basisState`/`periodicState`; compute `qft(input)`.
  - Render input magnitude bars (left) → output magnitude bars (right), output spikes highlighted; a one-line note "period r → spikes every N/r". `not-prose` card; header chip "Fourier"; all hooks before early return; emoji-free.

- [ ] **Step 4: Register the fence**:
```tsx
import { QftVisualizer } from "./quantum/qft-visualizer";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qft")) {
  return <QftVisualizer source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 5: Component render test** — `qft-visualizer.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { QftVisualizer } from "@/components/quantum/qft-visualizer";

describe("QftVisualizer", () => {
  it("renders the Fourier header for a period input", () => {
    render(<QftVisualizer source={JSON.stringify({ qubits: 4, input: "period:4" })} />);
    expect(screen.getByText(/fourier/i)).toBeInTheDocument();
  });
  it("renders an error card for too many qubits", () => {
    render(<QftVisualizer source={JSON.stringify({ qubits: 6 })} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run + commit (explicit paths)**
Run: `cd web && npx jest qft markdown-renderer --watchAll=false` → PASS.
```bash
git add web/src/components/quantum/qft.ts web/src/components/quantum/qft-visualizer.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/qft.test.ts web/__tests__/components/quantum/qft-visualizer.test.tsx
git commit -m "feat(web): qft Fourier-transform widget"
```

---

### Task 3: `qdj` — Deutsch–Jozsa oracle demo

**Files:** Create `web/src/components/quantum/deutsch-jozsa.ts`, `dj-demo.tsx`; Modify `markdown-renderer.tsx`; Test `deutsch-jozsa.test.ts`, `dj-demo.test.tsx`.

- [ ] **Step 1: Failing logic test** — `web/__tests__/components/quantum/deutsch-jozsa.test.ts`:

```ts
import { djProbabilities, isConstant, ORACLES } from "@/components/quantum/deutsch-jozsa";

describe("deutsch-jozsa", () => {
  it("constant oracle -> P(all-zeros) = 1", () => {
    for (const n of [2, 3]) {
      expect(djProbabilities(n, ORACLES.constant0)[0]).toBeCloseTo(1, 10);
      expect(djProbabilities(n, ORACLES.constant1)[0]).toBeCloseTo(1, 10);
    }
  });
  it("balanced oracle -> P(all-zeros) = 0", () => {
    for (const n of [2, 3]) {
      expect(djProbabilities(n, ORACLES.parity)[0]).toBeCloseTo(0, 10);
      expect(djProbabilities(n, ORACLES.lowbit)[0]).toBeCloseTo(0, 10);
    }
  });
  it("probabilities sum to 1", () => {
    const p = djProbabilities(3, ORACLES.parity);
    expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
  });
  it("isConstant verdict matches the oracle", () => {
    expect(isConstant(djProbabilities(3, ORACLES.constant0))).toBe(true);
    expect(isConstant(djProbabilities(3, ORACLES.parity))).toBe(false);
  });
  it("rejects more than 3 qubits", () => {
    expect(() => djProbabilities(4, ORACLES.constant0)).toThrow();
  });
});
```
Run: `cd web && npx jest deutsch-jozsa.test --watchAll=false` → FAIL.

- [ ] **Step 2: Implement `deutsch-jozsa.ts`** (verified: ancilla-free phase oracle; constant→P0=1, balanced→P0=0):

```ts
import { type Complex, H, applyGate1, cAbs2 } from "./math";

export type Oracle = (x: number) => 0 | 1;

function popcount(x: number): number {
  let c = 0;
  while (x) { c += x & 1; x >>= 1; }
  return c;
}

export const ORACLES: Record<string, Oracle> = {
  constant0: () => 0,
  constant1: () => 1,
  parity: (x) => (popcount(x) % 2) as 0 | 1, // balanced
  lowbit: (x) => (x & 1) as 0 | 1, // balanced
};

/** Deutsch-Jozsa via phase oracle: H^n, amp_x *= (-1)^f(x), H^n; returns |amp|^2. */
export function djProbabilities(n: number, f: Oracle): number[] {
  if (n > 3) throw new Error("qdj supports up to 3 qubits");
  const N = 1 << n;
  let state: Complex[] = Array.from({ length: N }, () => [0, 0] as Complex);
  state[0] = [1, 0];
  for (let q = 0; q < n; q++) state = applyGate1(state, H, q, n);
  for (let x = 0; x < N; x++) if (f(x) === 1) state[x] = [-state[x][0], -state[x][1]];
  for (let q = 0; q < n; q++) state = applyGate1(state, H, q, n);
  return state.map(cAbs2);
}

/** Constant ⇒ all-zeros with certainty; balanced ⇒ never all-zeros. */
export function isConstant(probs: number[]): boolean {
  return probs[0] > 0.5;
}
```
Run the test → PASS.

- [ ] **Step 3: Build `dj-demo.tsx`** — `"use client"` `export function DjDemo({ source }: { source: string })`.
  - Parse JSON `{ "qubits": 3 }` defensively; default n=3; validate n in 2..3.
  - State: selected oracle key (default `constant0`). A `<select>` (label "Oracle") over `Object.keys(ORACLES)` with friendly labels (Constant 0, Constant 1, Balanced: parity, Balanced: lowest-bit). Compute `djProbabilities(n, ORACLES[key])`.
  - Render output probability bars (`basisLabel`) + a verdict chip "Constant" / "Balanced" from `isConstant`. `not-prose` card; header chip "Deutsch–Jozsa"; hooks before early return; emoji-free.

- [ ] **Step 4: Register the fence**:
```tsx
import { DjDemo } from "./quantum/dj-demo";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qdj")) {
  return <DjDemo source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 5: Component render test** — `dj-demo.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DjDemo } from "@/components/quantum/dj-demo";

describe("DjDemo", () => {
  it("defaults to a constant oracle and reads Constant", () => {
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    expect(screen.getByText(/constant/i)).toBeInTheDocument();
  });
  it("switching to a balanced oracle reads Balanced", () => {
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    fireEvent.change(screen.getByLabelText(/oracle/i), { target: { value: "parity" } });
    expect(screen.getByText(/balanced/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run + commit (explicit paths)**
Run: `cd web && npx jest deutsch-jozsa dj-demo markdown-renderer --watchAll=false` → PASS.
```bash
git add web/src/components/quantum/deutsch-jozsa.ts web/src/components/quantum/dj-demo.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/deutsch-jozsa.test.ts web/__tests__/components/quantum/dj-demo.test.tsx
git commit -m "feat(web): qdj Deutsch-Jozsa oracle widget"
```

---

### Task 4: `qoptim` — QAOA / variational landscape

**Files:** Create `web/src/components/quantum/qaoa.ts`, `qaoa-explorer.tsx`; Modify `markdown-renderer.tsx`; Test `qaoa.test.ts`, `qaoa-explorer.test.tsx`.

- [ ] **Step 1: Failing logic test** — `web/__tests__/components/quantum/qaoa.test.ts`:

```ts
import { cutValue, qaoaExpectedCut, qaoaDistribution, qaoaLandscape } from "@/components/quantum/qaoa";

const TRIANGLE: [number, number][] = [[0, 1], [1, 2], [2, 0]];

describe("qaoa", () => {
  it("cutValue counts differing-endpoint edges", () => {
    expect(cutValue(0b000, TRIANGLE)).toBe(0); // all same
    expect(cutValue(0b111, TRIANGLE)).toBe(0); // all same
    expect(cutValue(0b001, TRIANGLE)).toBe(2); // one vertex split off
  });
  it("triangle max cut is 2 (no assignment cuts all 3 edges)", () => {
    let max = 0;
    for (let x = 0; x < 8; x++) max = Math.max(max, cutValue(x, TRIANGLE));
    expect(max).toBe(2);
  });
  it("gamma=beta=0 yields the mean cut over all assignments (= 1.5 for the triangle)", () => {
    expect(qaoaExpectedCut(3, TRIANGLE, 0, 0)).toBeCloseTo(1.5, 10);
  });
  it("distribution sums to 1", () => {
    const d = qaoaDistribution(3, TRIANGLE, 0.7, 0.3);
    expect(d.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
  });
  it("landscape is a res x res grid of finite numbers", () => {
    const L = qaoaLandscape(3, TRIANGLE, 8);
    expect(L).toHaveLength(8);
    expect(L[0]).toHaveLength(8);
    L.flat().forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});
```
Run: `cd web && npx jest qaoa.test --watchAll=false` → FAIL.

- [ ] **Step 2: Implement `qaoa.ts`** (verified: cost phase `e^{-iγ·cut}` + mixer `RX(2β)` on every qubit; γ=β=0 → mean cut = 1.5 for the triangle):

```ts
import { type Complex, cMul, cAbs2, applyGate1, rx } from "./math";

export type Edge = [number, number];

/** Number of edges whose endpoint bits differ (ordering-invariant). */
export function cutValue(x: number, edges: Edge[]): number {
  let c = 0;
  for (const [i, j] of edges) if (((x >> i) & 1) !== ((x >> j) & 1)) c++;
  return c;
}

function verticesIn(edges: Edge[]): number {
  let max = 0;
  for (const [i, j] of edges) max = Math.max(max, i, j);
  return max + 1;
}

/** QAOA p=1 state: |+>^n -> cost-phase e^{-i gamma cut(x)} -> mixer RX(2 beta) on every qubit. */
function qaoaState(n: number, edges: Edge[], gamma: number, beta: number): Complex[] {
  const N = 1 << n;
  const amp0 = 1 / Math.sqrt(N);
  let state: Complex[] = new Array(N);
  for (let x = 0; x < N; x++) {
    const ph = -gamma * cutValue(x, edges);
    state[x] = cMul([amp0, 0], [Math.cos(ph), Math.sin(ph)]);
  }
  for (let q = 0; q < n; q++) state = applyGate1(state, rx(2 * beta), q, n);
  return state;
}

export function qaoaDistribution(n: number, edges: Edge[], gamma: number, beta: number): number[] {
  return qaoaState(n, edges, gamma, beta).map(cAbs2);
}

export function qaoaExpectedCut(n: number, edges: Edge[], gamma: number, beta: number): number {
  const probs = qaoaDistribution(n, edges, gamma, beta);
  let e = 0;
  for (let x = 0; x < probs.length; x++) e += probs[x] * cutValue(x, edges);
  return e;
}

/** Expected cut over a res x res grid, gamma in [0, pi], beta in [0, pi/2]. */
export function qaoaLandscape(n: number, edges: Edge[], res: number): number[][] {
  const grid: number[][] = [];
  for (let gi = 0; gi < res; gi++) {
    const gamma = (Math.PI * gi) / (res - 1);
    const row: number[] = [];
    for (let bi = 0; bi < res; bi++) {
      const beta = (Math.PI / 2) * (bi / (res - 1));
      row.push(qaoaExpectedCut(n, edges, gamma, beta));
    }
    grid.push(row);
  }
  return grid;
}

export { verticesIn };
```
Run the test → PASS.

- [ ] **Step 3: Build `qaoa-explorer.tsx`** — `"use client"` `export function QaoaExplorer({ source }: { source: string })`.
  - Parse JSON `{ "edges": [[0,1],[1,2],[2,0]] }` defensively; default triangle; `n = verticesIn(edges)`; validate n in 2..5 and edge indices in range; error card otherwise.
  - State: `gamma`, `beta` sliders (γ∈[0,π], β∈[0,π/2], step π/60). Compute `qaoaExpectedCut`, `qaoaDistribution`, and `qaoaLandscape(n, edges, 24)` (the landscape in a memo keyed on edges only).
  - Render: a small SVG of the graph; the γ/β sliders + a live "expected cut = X.XX (max = M)" readout; a landscape heatmap (24×24 SVG `<rect>` grid colored by value) with the current (γ,β) point marked and the grid-max cell marked; the bitstring distribution bars (`basisLabel`). `not-prose` card; header chip "QAOA"; SVG `role="img"`+aria-label; all hooks before early return; emoji-free; reduced-motion static.

- [ ] **Step 4: Register the fence**:
```tsx
import { QaoaExplorer } from "./quantum/qaoa-explorer";
```
```tsx
if (code && Array.isArray(className) && className.includes("language-qoptim")) {
  return <QaoaExplorer source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 5: Component render test** — `qaoa-explorer.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { QaoaExplorer } from "@/components/quantum/qaoa-explorer";

describe("QaoaExplorer", () => {
  it("renders the QAOA header and a max-cut readout for the triangle", () => {
    render(<QaoaExplorer source={JSON.stringify({ edges: [[0, 1], [1, 2], [2, 0]] })} />);
    expect(screen.getByText(/qaoa/i)).toBeInTheDocument();
    expect(screen.getByText(/max/i)).toBeInTheDocument();
  });
  it("renders an error card for an out-of-range edge", () => {
    render(<QaoaExplorer source={JSON.stringify({ edges: [[0, 9]] })} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run + commit (explicit paths) + full suite**
Run: `cd web && npx jest qaoa qaoa-explorer markdown-renderer --watchAll=false` → PASS. Then `cd web && npm test -- --watchAll=false` → green.
```bash
git add web/src/components/quantum/qaoa.ts web/src/components/quantum/qaoa-explorer.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/qaoa.test.ts web/__tests__/components/quantum/qaoa-explorer.test.tsx
git commit -m "feat(web): qoptim QAOA/variational-landscape widget"
```

---

### Task 5: Renderer routing tests for the four new fences

**Files:** Modify `web/__tests__/components/markdown-renderer.fence-routing.test.tsx`.

- [ ] **Step 1:** Append four `it(...)` cases mirroring the existing ones (which call `renderFence(lang, body)` against the real `makeComponents().pre()`; the file already has a `mockMatchMedia(false)` `beforeEach`):
  - `qgrover` body `JSON.stringify({ qubits: 3, marked: 5 })` → `/grover/i` present.
  - `qft` body `JSON.stringify({ qubits: 4, input: "period:4" })` → `/fourier/i` present.
  - `qdj` body `JSON.stringify({ qubits: 3 })` → `/deutsch/i` present.
  - `qoptim` body `JSON.stringify({ edges: [[0,1],[1,2],[2,0]] })` → `/qaoa/i` present.

- [ ] **Step 2: Run + commit**
Run: `cd web && npx jest markdown-renderer.fence-routing --watchAll=false` → PASS.
```bash
git add web/__tests__/components/markdown-renderer.fence-routing.test.tsx
git commit -m "test(web): route qgrover/qft/qdj/qoptim fences in renderer"
```

---

### Task 6: Reflow `03-algorithms/GUIDE.md`

**Files:** Modify `03-algorithms/GUIDE.md`.

- [ ] **Step 1: Rewrite to the narrative arc** (preserve the Hands-On notebook list + References verbatim):

1. **Cold open** — "You have superposition, entanglement, measurement. Here's where they buy *speedup* — and the engine is interference." Fold objectives/prereqs into a short callout (blockquote).
2. **The shared trick** — oracles + phase kickback; interference amplifies right answers and cancels wrong ones. Keep the existing `qchallenge` (H-superposition opener).
3. **Deutsch–Jozsa** — one query distinguishes constant vs balanced; Bernstein–Vazirani as a one-line cousin. Embed:
   ````
   ```qdj
   {"qubits": 3}
   ```
   ````
4. **Grover's search** — iterative amplitude amplification; the ~(π/4)√N optimum and over-rotation. Embed:
   ````
   ```qgrover
   {"qubits": 3, "marked": 5}
   ```
   ````
5. **Quantum Fourier Transform** — interference reading periodicity → frequency spikes. Embed:
   ````
   ```qft
   {"qubits": 4, "input": "period:4"}
   ```
   ````
6. **Quantum Phase Estimation** — QFT reading an eigenphase; foundation of Shor + chemistry (prose; keep the T-gate→1/8 example; optionally a small `qsim`).
7. **Variational algorithms & QAOA** — the quantum-circuit + classical-optimizer loop, on MaxCut. Embed:
   ````
   ```qoptim
   {"edges": [[0,1],[1,2],[2,0]]}
   ```
   ````
8. **Amplitude estimation + Check yourself** — Grover generalized; quadratic over Monte Carlo. Then a `quiz` (~4 questions: why DJ needs 1 query; what one Grover iteration does; why QFT reveals period; what QAOA's two angles control). Each with `hint` + `a`.
9. **Hands-On + References** — keep the notebook list and references; add a one-line bridge to `04-quantum-ml`.

- [ ] **Step 2: Verify render** — `cd web && npm run build` → succeeds; `out/learn/03-algorithms` regenerates with no KaTeX/parse errors and every fence mounts. Eyeball `/learn/03-algorithms` via `npm run dev`.

- [ ] **Step 3: Commit**
```bash
git add 03-algorithms/GUIDE.md
git commit -m "docs(03-algorithms): narrative reflow + interactive algorithm widgets"
```

---

### Task 7: Full verification

- [ ] **Step 1: Web suite + lint + build**
Run: `cd web && npm test -- --watchAll=false` → all pass (277 + new).
Run: `cd web && npm run lint` → clean (no `react-hooks/rules-of-hooks`, no unused vars).
Run: `cd web && npm run build` → 11 pages; `out/learn/03-algorithms` present.

- [ ] **Step 2: Python suite unaffected** — `make test` (or `.venv/bin/python -m pytest -q`) → green.

- [ ] **Step 3: Manual interaction pass** — `npm run dev`; open `/learn/03-algorithms`; confirm each widget (qgrover iteration slider peaks then over-rotates; qft shows spikes; qdj verdict flips; qoptim sliders move the heatmap point + distribution), in light/dark/reduced-motion, no console errors.

- [ ] **Step 4: Sync CLAUDE.md test count** (stage explicit path).
```bash
git add CLAUDE.md
git commit -m "docs: sync web test count after 03-algorithms widgets"
```

---

## Self-Review checklist

- Spec coverage: ✅ qgrover (T1), qft (T2), qdj (T3), qoptim (T4), routing tests (T5), narrative reflow with all widget beats + quiz (T6), verification (T7).
- No placeholders: all four logic modules + tests are complete and math-verified; components specified as blueprints mirroring named existing components; GUIDE sections specify exact embedded fences.
- Type/name consistency: `groverHistory(n,marked,iters)→number[][]`, `optimalIterations(n)`, `qft(amps)→Complex[]`, `basisState`/`periodicState`, `djProbabilities(n,Oracle)→number[]` + `ORACLES`/`isConstant`, `cutValue`/`qaoaExpectedCut`/`qaoaDistribution`/`qaoaLandscape`/`verticesIn`; fence languages `qgrover`/`qft`/`qdj`/`qoptim` match renderer branches and routing tests.
- Hooks-before-early-return rule called out per widget (the 02-hardware lesson). nbstripout gotcha called out; explicit-path staging on every commit.
