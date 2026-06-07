# 02-hardware Module Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reflow the `02-hardware` GUIDE into a narrative lesson and add four pure-client interactive widgets — `qcost`, `qdevices`, `qtopo`, `qnoise` — that demonstrate cost, the device landscape, connectivity/SWAP overhead, and noise.

**Architecture:** Each widget is a client React component under `web/src/components/quantum/`, routed by a new `language-*` branch in `markdown-renderer.tsx` (same pattern as the eight existing fences). Pure logic lives in small testable modules (`cost.ts`, `topology.ts`, `noise.ts`); `noise.ts` adds a density-matrix + Kraus engine on top of the existing `math.ts` gate matrices. No AWS, no SSR — static-export safe.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Tailwind v4, Jest + React Testing Library (component tests use a `/** @jest-environment jsdom */` docblock and a local `window.matchMedia` polyfill; pure-logic tests run in the default node env), KaTeX.

**Branch:** `feat/02-hardware-overhaul` (already created; the spec is committed there). Run web commands from `web/`.

**CRITICAL repo gotcha:** `.gitattributes` runs `nbstripout`, so ~31 notebooks always show "modified" in `git status` (on-disk bytes equal HEAD). **Never `git add -A`/`git add .`** — stage explicit paths only.

**Reused conventions:** mirror the card chrome + probability-bar markup + parse-error card of `web/src/components/quantum/circuit-lab.tsx`; mirror the JSON-fence error card of `challenge.tsx`; reuse `math.ts` (`Complex`, `Gate2`, gate constants, `rx/ry/rz`, `cAdd/cMul/cConj/cAbs2`, `simulate`, `probabilities`, `basisLabel`, `Op`) and `qsim-dsl.ts` (`parseProgram`, `opsFor`).

---

## File Structure

- `web/src/components/quantum/cost.ts` — pricing table + `estimateCost` (Task 1)
- `web/src/components/quantum/cost-calculator.tsx` — `qcost` widget (Task 1)
- `web/src/components/quantum/devices.ts` — device data (Task 2)
- `web/src/components/quantum/device-table.tsx` — `qdevices` widget (Task 2)
- `web/src/components/quantum/topology.ts` — adjacency + BFS routing (Task 3)
- `web/src/components/quantum/topology-explorer.tsx` — `qtopo` widget (Task 3)
- `web/src/components/quantum/noise.ts` — density-matrix + Kraus engine (Task 4)
- `web/src/components/quantum/noise-visualizer.tsx` — `qnoise` widget (Task 4)
- `web/src/components/markdown-renderer.tsx` — four new routing branches (Tasks 1–4)
- `web/__tests__/components/quantum/*.test.{ts,tsx}` — unit + render tests (each task)
- `web/__tests__/components/markdown-renderer.fence-routing.test.tsx` — +4 cases (Task 5)
- `02-hardware/GUIDE.md` — narrative reflow (Task 6)

---

### Task 1: `qcost` — cost calculator

**Files:**
- Create: `web/src/components/quantum/cost.ts`
- Create: `web/src/components/quantum/cost-calculator.tsx`
- Modify: `web/src/components/markdown-renderer.tsx`
- Test: `web/__tests__/components/quantum/cost.test.ts`, `web/__tests__/components/quantum/cost-calculator.test.tsx`

- [ ] **Step 1: Write the failing logic test**

Create `web/__tests__/components/quantum/cost.test.ts`:

```ts
import { estimateCost, PRICING } from "@/components/quantum/cost";

describe("estimateCost", () => {
  it("IonQ 1000 shots, 1 task = $10.30", () => {
    expect(estimateCost("IonQ", 1000, 1, 1)).toBeCloseTo(10.3, 4);
  });
  it("IQM 1000 shots = $1.745", () => {
    expect(estimateCost("IQM", 1000, 1, 1)).toBeCloseTo(0.3 + 1.45, 4);
  });
  it("SV1 2 minutes = $0.15", () => {
    expect(estimateCost("SV1", 1000, 2, 1)).toBeCloseTo(0.15, 4);
  });
  it("LocalSimulator is free", () => {
    expect(estimateCost("LocalSimulator", 1000, 5, 3)).toBe(0);
  });
  it("scales by task count for per-shot devices", () => {
    expect(estimateCost("IonQ", 1000, 1, 3)).toBeCloseTo(30.9, 4);
  });
  it("throws on unknown provider", () => {
    expect(() => estimateCost("Nope" as keyof typeof PRICING, 1, 1, 1)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest cost.test --watchAll=false` → FAIL (module missing).

- [ ] **Step 3: Implement `cost.ts`**

```ts
// Mirrors lib/utils/cost.py PRICING exactly (single source of truth for rates).
export const PRICING = {
  IonQ: { perTask: 0.3, perShot: 0.01 },
  IQM: { perTask: 0.3, perShot: 0.00145 },
  QuEra: { perTask: 0.3, perShot: 0.01 },
  Rigetti: { perTask: 0.3, perShot: 0.00035 },
  SV1: { perMinute: 0.075 },
  DM1: { perMinute: 0.075 },
  TN1: { perMinute: 0.275 },
  LocalSimulator: { perMinute: 0 },
} as const;

export type Provider = keyof typeof PRICING;

export function estimateCost(provider: Provider, shots: number, minutes: number, tasks = 1): number {
  const p = PRICING[provider];
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  if ("perShot" in p) return tasks * (p.perTask + p.perShot * shots);
  return p.perMinute * minutes * tasks;
}

export function isPerShot(provider: Provider): boolean {
  return "perShot" in PRICING[provider];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest cost.test --watchAll=false` → PASS.

- [ ] **Step 5: Build the component**

Create `web/src/components/quantum/cost-calculator.tsx`: `"use client"` component `export function CostCalculator({ source }: { source: string })`. Behavior:
- Optional JSON body `{ "provider": "IonQ", "shots": 1000 }` to preset; ignore/empty is fine (default provider `IonQ`, shots `1000`, tasks `1`, minutes `1`). Parse defensively; bad JSON → fall back to defaults (do NOT error — the body is optional).
- State: `provider`, `shots`, `tasks`, `minutes`. A `<select>` of `Object.keys(PRICING)`; number inputs for shots + tasks (shown when `isPerShot(provider)`) and minutes (shown otherwise).
- Compute `estimateCost(provider, shots, minutes, tasks)`; render an itemized breakdown (per-task × tasks + per-shot × shots × tasks, or per-minute × minutes × tasks) and a bold total `$X.XX`.
- A muted nudge: "Develop on LocalSimulator (free) first; move to QPU only when validated."
- Header chip "Cost calculator"; `not-prose` rounded-card chrome like `CircuitLab`. Emoji-free; inputs have `<label>`/`aria-label`.

- [ ] **Step 6: Register the fence**

In `web/src/components/markdown-renderer.tsx` add `import { CostCalculator } from "./quantum/cost-calculator";` and, alongside the other `language-*` checks in `pre()`:
```tsx
if (code && Array.isArray(className) && className.includes("language-qcost")) {
  return <CostCalculator source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 7: Component render test**

Create `web/__tests__/components/quantum/cost-calculator.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CostCalculator } from "@/components/quantum/cost-calculator";

describe("CostCalculator", () => {
  it("defaults to IonQ and shows the $10.30 total", () => {
    render(<CostCalculator source={""} />);
    expect(screen.getByText(/\$10\.30/)).toBeInTheDocument();
  });
  it("switching to LocalSimulator shows free", () => {
    render(<CostCalculator source={""} />);
    fireEvent.change(screen.getByLabelText(/device/i), { target: { value: "LocalSimulator" } });
    expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
  });
});
```
(Tune matcher strings to your exact rendered text; keep the two behaviors.)

- [ ] **Step 8: Run + commit**

Run: `cd web && npx jest cost markdown-renderer --watchAll=false` → PASS.
```bash
git add web/src/components/quantum/cost.ts web/src/components/quantum/cost-calculator.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/cost.test.ts web/__tests__/components/quantum/cost-calculator.test.tsx
git commit -m "feat(web): qcost cost-calculator widget"
```

---

### Task 2: `qdevices` — device comparison

**Files:**
- Create: `web/src/components/quantum/devices.ts`
- Create: `web/src/components/quantum/device-table.tsx`
- Modify: `web/src/components/markdown-renderer.tsx`
- Test: `web/__tests__/components/quantum/devices.test.ts`, `web/__tests__/components/quantum/device-table.test.tsx`

- [ ] **Step 1: Write the failing data test**

Create `web/__tests__/components/quantum/devices.test.ts`:
```ts
import { DEVICES, sortDevices } from "@/components/quantum/devices";

describe("devices data", () => {
  it("includes the Braket QPUs, managed sims, and local", () => {
    const names = DEVICES.map((d) => d.model);
    expect(names).toEqual(expect.arrayContaining(["Aria", "Forte", "Garnet", "Aquila", "SV1", "DM1", "TN1", "Local"]));
  });
  it("marks QuEra Aquila as not gate-model (analog)", () => {
    expect(DEVICES.find((d) => d.model === "Aquila")!.gateModel).toBe(false);
  });
  it("sorts by qubits descending", () => {
    const sorted = sortDevices(DEVICES, "qubits", "desc");
    expect(sorted[0].qubits).toBeGreaterThanOrEqual(sorted[sorted.length - 1].qubits);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest devices.test --watchAll=false` → FAIL.

- [ ] **Step 3: Implement `devices.ts`**

```ts
export interface Device {
  technology: string; // "Trapped ion" | "Superconducting" | "Neutral atom" | "Simulator"
  vendor: string;
  model: string;
  qubits: number;
  connectivity: string; // "All-to-all" | "Square lattice" | "Analog" | "—"
  gateModel: boolean;
  cost: string; // human-readable cost model
}

export const DEVICES: Device[] = [
  { technology: "Trapped ion", vendor: "IonQ", model: "Aria", qubits: 25, connectivity: "All-to-all", gateModel: true, cost: "$0.30/task + $0.01/shot" },
  { technology: "Trapped ion", vendor: "IonQ", model: "Forte", qubits: 36, connectivity: "All-to-all", gateModel: true, cost: "$0.30/task + $0.01/shot" },
  { technology: "Superconducting", vendor: "IQM", model: "Garnet", qubits: 20, connectivity: "Square lattice", gateModel: true, cost: "$0.30/task + $0.00145/shot" },
  { technology: "Neutral atom", vendor: "QuEra", model: "Aquila", qubits: 256, connectivity: "Analog", gateModel: false, cost: "$0.30/task + $0.01/shot" },
  { technology: "Simulator", vendor: "AWS", model: "SV1", qubits: 34, connectivity: "—", gateModel: true, cost: "$0.075/min" },
  { technology: "Simulator", vendor: "AWS", model: "DM1", qubits: 17, connectivity: "—", gateModel: true, cost: "$0.075/min (noise)" },
  { technology: "Simulator", vendor: "AWS", model: "TN1", qubits: 50, connectivity: "—", gateModel: true, cost: "$0.275/min" },
  { technology: "Simulator", vendor: "Local", model: "Local", qubits: 25, connectivity: "—", gateModel: true, cost: "Free" },
];

export type SortKey = "qubits" | "model" | "technology";

export function sortDevices(devices: Device[], key: SortKey, dir: "asc" | "desc"): Device[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...devices].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return sign * (av - bv);
    return sign * String(av).localeCompare(String(bv));
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest devices.test --watchAll=false` → PASS.

- [ ] **Step 5: Build the component**

Create `web/src/components/quantum/device-table.tsx`: `"use client"` `export function DeviceTable()` (no props; `qdevices` body ignored). A semantic `<table>` of `DEVICES`; column header `<button>`s toggle `sortDevices` (key + asc/desc) with `aria-sort`; a technology `<select>` filter (All / Trapped ion / Superconducting / Neutral atom / Simulator) narrows rows. Highlight the Aquila (analog, `gateModel === false`) row. Header chip "Devices"; `not-prose` card chrome. Emoji-free.

- [ ] **Step 6: Register the fence**

`import { DeviceTable } from "./quantum/device-table";` and:
```tsx
if (code && Array.isArray(className) && className.includes("language-qdevices")) {
  return <DeviceTable />;
}
```

- [ ] **Step 7: Component render test**

Create `web/__tests__/components/quantum/device-table.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DeviceTable } from "@/components/quantum/device-table";

describe("DeviceTable", () => {
  it("renders every device row", () => {
    render(<DeviceTable />);
    expect(screen.getByText("Aria")).toBeInTheDocument();
    expect(screen.getByText("Aquila")).toBeInTheDocument();
    expect(screen.getByText("SV1")).toBeInTheDocument();
  });
  it("filters by technology", () => {
    render(<DeviceTable />);
    fireEvent.change(screen.getByLabelText(/technology/i), { target: { value: "Trapped ion" } });
    expect(screen.getByText("Aria")).toBeInTheDocument();
    expect(screen.queryByText("Garnet")).toBeNull();
  });
});
```

- [ ] **Step 8: Run + commit**

Run: `cd web && npx jest devices device-table markdown-renderer --watchAll=false` → PASS.
```bash
git add web/src/components/quantum/devices.ts web/src/components/quantum/device-table.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/devices.test.ts web/__tests__/components/quantum/device-table.test.tsx
git commit -m "feat(web): qdevices device-comparison widget"
```

---

### Task 3: `qtopo` — topology + SWAP routing

**Files:**
- Create: `web/src/components/quantum/topology.ts`
- Create: `web/src/components/quantum/topology-explorer.tsx`
- Modify: `web/src/components/markdown-renderer.tsx`
- Test: `web/__tests__/components/quantum/topology.test.ts`, `web/__tests__/components/quantum/topology-explorer.test.tsx`

- [ ] **Step 1: Write the failing logic test**

Create `web/__tests__/components/quantum/topology.test.ts`:
```ts
import { adjacency, shortestPath, swapCost } from "@/components/quantum/topology";

describe("topology", () => {
  it("line(5): 0->4 needs 3 SWAPs", () => {
    expect(swapCost("line", 5, 0, 4).swaps).toBe(3);
  });
  it("all-to-all: any pair needs 0 SWAPs", () => {
    expect(swapCost("all-to-all", 6, 0, 5).swaps).toBe(0);
  });
  it("ring(4): 0->2 needs 1 SWAP (path length 3)", () => {
    expect(swapCost("ring", 4, 0, 2).swaps).toBe(1);
  });
  it("grid(9): 0 and 8 are corners of a 3x3, shortest path length 5 (4 edges)", () => {
    expect(shortestPath(adjacency("grid", 9), 0, 8)!.length).toBe(5);
  });
  it("adjacent qubits need 0 SWAPs", () => {
    expect(swapCost("line", 5, 1, 2).swaps).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest topology.test --watchAll=false` → FAIL.

- [ ] **Step 3: Implement `topology.ts`**

```ts
export type Topology = "all-to-all" | "line" | "ring" | "grid";

export function adjacency(topo: Topology, n: number): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  const link = (a: number, b: number) => {
    if (a !== b && a < n && b < n && !adj[a].includes(b)) {
      adj[a].push(b);
      adj[b].push(a);
    }
  };
  if (topo === "all-to-all") {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) link(i, j);
  } else if (topo === "line") {
    for (let i = 0; i < n - 1; i++) link(i, i + 1);
  } else if (topo === "ring") {
    for (let i = 0; i < n; i++) link(i, (i + 1) % n);
  } else {
    // grid: row-major on a ceil(sqrt(n)) wide lattice
    const w = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      if (i % w !== w - 1) link(i, i + 1); // right neighbor
      link(i, i + w); // down neighbor (link() guards out-of-range)
    }
  }
  return adj;
}

export function shortestPath(adj: number[][], a: number, b: number): number[] | null {
  if (a === b) return [a];
  const prev = new Array<number>(adj.length).fill(-1);
  const seen = new Array<boolean>(adj.length).fill(false);
  const queue = [a];
  seen[a] = true;
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of adj[u]) {
      if (!seen[v]) {
        seen[v] = true;
        prev[v] = u;
        if (v === b) {
          const path = [b];
          for (let x = u; x !== -1; x = prev[x]) path.unshift(x);
          return path;
        }
        queue.push(v);
      }
    }
  }
  return null;
}

export function swapCost(topo: Topology, n: number, a: number, b: number): { path: number[]; swaps: number } {
  const path = shortestPath(adjacency(topo, n), a, b);
  if (!path) return { path: [], swaps: -1 };
  return { path, swaps: Math.max(0, path.length - 2) }; // (edges - 1) = (path.length-1) - 1
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest topology.test --watchAll=false` → PASS.

- [ ] **Step 5: Build the component**

Create `web/src/components/quantum/topology-explorer.tsx`: `"use client"` `export function TopologyExplorer({ source }: { source: string })`. Parse JSON `{ "topology": "grid", "qubits": 9, "gate": [0, 8] }`; on bad/missing fields render an error card ("topology error: …", mirror `challenge.tsx`). Compute `swapCost`. Render an SVG node-edge graph (positions: line/ring on a circle or row; grid on a lattice; all-to-all on a circle), draw all edges faint, highlight the two `gate` qubits, draw the `path` edges bold, and show a readout: "N SWAPs to make q{a} and q{b} adjacent · depth +N". Optional `<select>`s to change the two qubits. Header chip "Connectivity"; `not-prose` card chrome; SVG has `role="img"` + `aria-label`. Reduced motion: static. Emoji-free.

- [ ] **Step 6: Register the fence**

`import { TopologyExplorer } from "./quantum/topology-explorer";` and:
```tsx
if (code && Array.isArray(className) && className.includes("language-qtopo")) {
  return <TopologyExplorer source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 7: Component render test**

Create `web/__tests__/components/quantum/topology-explorer.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TopologyExplorer } from "@/components/quantum/topology-explorer";

describe("TopologyExplorer", () => {
  it("reports the SWAP cost for a line topology", () => {
    render(<TopologyExplorer source={JSON.stringify({ topology: "line", qubits: 5, gate: [0, 4] })} />);
    expect(screen.getByText(/3 SWAP/i)).toBeInTheDocument();
  });
  it("reports 0 SWAPs for all-to-all", () => {
    render(<TopologyExplorer source={JSON.stringify({ topology: "all-to-all", qubits: 5, gate: [0, 4] })} />);
    expect(screen.getByText(/0 SWAP/i)).toBeInTheDocument();
  });
  it("renders an error card for bad JSON", () => {
    render(<TopologyExplorer source={"{ not json"} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
```
(Tune matcher strings to the exact wording you render, e.g. "3 SWAPs".)

- [ ] **Step 8: Run + commit**

Run: `cd web && npx jest topology topology-explorer markdown-renderer --watchAll=false` → PASS.
```bash
git add web/src/components/quantum/topology.ts web/src/components/quantum/topology-explorer.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/topology.test.ts web/__tests__/components/quantum/topology-explorer.test.tsx
git commit -m "feat(web): qtopo connectivity + SWAP-routing widget"
```

---

### Task 4: `qnoise` — noise visualizer (density-matrix engine)

**Files:**
- Create: `web/src/components/quantum/noise.ts`
- Create: `web/src/components/quantum/noise-visualizer.tsx`
- Modify: `web/src/components/markdown-renderer.tsx`
- Test: `web/__tests__/components/quantum/noise.test.ts`, `web/__tests__/components/quantum/noise-visualizer.test.tsx`

- [ ] **Step 1: Write the failing engine test**

Create `web/__tests__/components/quantum/noise.test.ts`:
```ts
import { noisyProbs, fidelityDist } from "@/components/quantum/noise";
import { simulate, probabilities } from "@/components/quantum/math";
import { parseProgram, opsFor } from "@/components/quantum/qsim-dsl";

function ideal(src: string): number[] {
  const p = parseProgram(src);
  return probabilities(simulate(opsFor(p, 0), p.n));
}
function ops(src: string) {
  const p = parseProgram(src);
  return { ops: opsFor(p, 0), n: p.n };
}

describe("noise engine", () => {
  it("p=0 reproduces the ideal distribution (H on 1 qubit)", () => {
    const { ops: o, n } = ops("qubits 1\nH 0");
    const got = noisyProbs(o, n, "depolarizing", 0);
    expect(got[0]).toBeCloseTo(0.5, 8);
    expect(got[1]).toBeCloseTo(0.5, 8);
  });
  it("depolarizing p=0.75 drives one qubit to maximally mixed", () => {
    const { ops: o, n } = ops("qubits 1\nX 0"); // state |1>
    const got = noisyProbs(o, n, "depolarizing", 0.75);
    expect(got[0]).toBeCloseTo(0.5, 6);
    expect(got[1]).toBeCloseTo(0.5, 6);
  });
  it("amplitude damping gamma=1 relaxes |1> to |0>", () => {
    const { ops: o, n } = ops("qubits 1\nX 0");
    const got = noisyProbs(o, n, "amplitude-damping", 1);
    expect(got[0]).toBeCloseTo(1, 6);
    expect(got[1]).toBeCloseTo(0, 6);
  });
  it("bit-flip p=1 flips |0> (identity gate carries the channel)", () => {
    const { ops: o, n } = ops("qubits 1\nI 0");
    const got = noisyProbs(o, n, "bit-flip", 1);
    expect(got[0]).toBeCloseTo(0, 6);
    expect(got[1]).toBeCloseTo(1, 6);
  });
  it("noisy probabilities sum to 1", () => {
    const { ops: o, n } = ops("qubits 2\nH 0\nCNOT 0 1");
    const got = noisyProbs(o, n, "depolarizing", 0.2);
    expect(got.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it("rejects more than 3 qubits", () => {
    expect(() => noisyProbs([], 4, "depolarizing", 0.1)).toThrow();
  });
  it("fidelityDist is 1 for identical distributions", () => {
    expect(fidelityDist([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(1, 8);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx jest noise.test --watchAll=false` → FAIL.

- [ ] **Step 3: Implement `noise.ts`**

```ts
import {
  type Complex, type Gate2, type Op,
  cAdd, cMul, cConj,
  I as I2, X, Y, Z, H, S, T, rx, ry, rz,
} from "./math";

export type CMatrix = Complex[][];
export type ChannelName = "depolarizing" | "amplitude-damping" | "bit-flip";

const zero: Complex = [0, 0];

function zeros(d: number): CMatrix {
  return Array.from({ length: d }, () => Array.from({ length: d }, () => zero as Complex));
}
function identity(d: number): CMatrix {
  const m = zeros(d);
  for (let i = 0; i < d; i++) m[i][i] = [1, 0];
  return m;
}
function kron(a: CMatrix, b: CMatrix): CMatrix {
  const ar = a.length, ac = a[0].length, br = b.length, bc = b[0].length;
  const res: CMatrix = Array.from({ length: ar * br }, () => Array.from({ length: ac * bc }, () => zero as Complex));
  for (let i = 0; i < ar; i++)
    for (let j = 0; j < ac; j++)
      for (let k = 0; k < br; k++)
        for (let l = 0; l < bc; l++)
          res[i * br + k][j * bc + l] = cMul(a[i][j], b[k][l]);
  return res;
}
function matMul(a: CMatrix, b: CMatrix): CMatrix {
  const n = a.length, m = b[0].length, p = b.length;
  const res: CMatrix = Array.from({ length: n }, () => Array.from({ length: m }, () => zero as Complex));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      let s: Complex = [0, 0];
      for (let k = 0; k < p; k++) s = cAdd(s, cMul(a[i][k], b[k][j]));
      res[i][j] = s;
    }
  return res;
}
function dagger(a: CMatrix): CMatrix {
  const r = a.length, c = a[0].length;
  const res: CMatrix = Array.from({ length: c }, () => Array.from({ length: r }, () => zero as Complex));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) res[j][i] = cConj(a[i][j]);
  return res;
}
function addMat(a: CMatrix, b: CMatrix): CMatrix {
  return a.map((row, i) => row.map((v, j) => cAdd(v, b[i][j])));
}
function gate2ToMatrix(g: Gate2): CMatrix {
  return [[g[0][0], g[0][1]], [g[1][0], g[1][1]]];
}
// Expand a 2x2 gate acting on `qubit` (0 = most-significant, matching math.ts) to 2^n.
function expandSingle(g: Gate2, qubit: number, n: number): CMatrix {
  let res: CMatrix = [[[1, 0]]]; // 1x1
  for (let q = 0; q < n; q++) res = kron(res, q === qubit ? gate2ToMatrix(g) : identity(2));
  return res;
}
// Full CNOT operator (big-endian), built as a permutation matrix.
function expandCNOT(control: number, target: number, n: number): CMatrix {
  const d = 1 << n;
  const m = zeros(d);
  const cMask = 1 << (n - 1 - control);
  const tMask = 1 << (n - 1 - target);
  for (let i = 0; i < d; i++) {
    const j = i & cMask ? i ^ tMask : i;
    m[j][i] = [1, 0];
  }
  return m;
}
function conjugate(U: CMatrix, rho: CMatrix): CMatrix {
  return matMul(matMul(U, rho), dagger(U));
}
function scaleGate(g: Gate2, s: number): Gate2 {
  return [
    [[g[0][0][0] * s, g[0][0][1] * s], [g[0][1][0] * s, g[0][1][1] * s]],
    [[g[1][0][0] * s, g[1][0][1] * s], [g[1][1][0] * s, g[1][1][1] * s]],
  ];
}

export function krausFor(channel: ChannelName, p: number): Gate2[] {
  if (channel === "depolarizing") {
    const a = Math.sqrt(1 - p), b = Math.sqrt(p / 3);
    return [scaleGate(I2, a), scaleGate(X, b), scaleGate(Y, b), scaleGate(Z, b)];
  }
  if (channel === "bit-flip") {
    return [scaleGate(I2, Math.sqrt(1 - p)), scaleGate(X, Math.sqrt(p))];
  }
  const g = p; // amplitude damping uses p as gamma
  const K0: Gate2 = [[[1, 0], [0, 0]], [[0, 0], [Math.sqrt(1 - g), 0]]];
  const K1: Gate2 = [[[0, 0], [Math.sqrt(g), 0]], [[0, 0], [0, 0]]];
  return [K0, K1];
}

function applyChannel1(rho: CMatrix, kraus: Gate2[], qubit: number, n: number): CMatrix {
  let out = zeros(1 << n);
  for (const k of kraus) out = addMat(out, conjugate(expandSingle(k, qubit, n), rho));
  return out;
}

function opMatrix(op: Op, n: number): { U: CMatrix; qubits: number[] } {
  const g = op.gate.toUpperCase();
  if (g === "CNOT") return { U: expandCNOT(op.control!, op.target, n), qubits: [op.control!, op.target] };
  const gate: Gate2 =
    g === "RX" ? rx(op.theta ?? 0) : g === "RY" ? ry(op.theta ?? 0) : g === "RZ" ? rz(op.theta ?? 0)
    : g === "X" ? X : g === "Y" ? Y : g === "Z" ? Z : g === "H" ? H : g === "S" ? S : g === "T" ? T : I2;
  return { U: expandSingle(gate, op.target, n), qubits: [op.target] };
}

/** Measurement probabilities after running `ops` with a per-gate single-qubit channel. */
export function noisyProbs(ops: Op[], n: number, channel: ChannelName, p: number): number[] {
  if (n > 3) throw new Error("qnoise supports up to 3 qubits");
  const d = 1 << n;
  let rho = zeros(d);
  rho[0][0] = [1, 0]; // |0...0><0...0|
  for (const op of ops) {
    const { U, qubits } = opMatrix(op, n);
    rho = conjugate(U, rho);
    if (p > 0) {
      const kraus = krausFor(channel, p);
      for (const q of qubits) rho = applyChannel1(rho, kraus, q, n);
    }
  }
  return rho.map((row, i) => row[i][0]); // real part of the diagonal
}

/** Distribution overlap (Bhattacharyya fidelity): 1 when identical, lower as they diverge. */
export function fidelityDist(ideal: number[], noisy: number[]): number {
  let s = 0;
  for (let i = 0; i < ideal.length; i++) s += Math.sqrt(Math.max(0, ideal[i]) * Math.max(0, noisy[i]));
  return s * s;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx jest noise.test --watchAll=false` → PASS.

- [ ] **Step 5: Build the component**

Create `web/src/components/quantum/noise-visualizer.tsx`: `"use client"` `export function NoiseVisualizer({ source }: { source: string })`. Parse the `qsim` circuit with `parseProgram`; render the parse-error card on `program.error` (mirror `circuit-lab.tsx`). If `program.n > 3`, render a friendly card "qnoise supports up to 3 qubits." Compute ideal probs via `probabilities(simulate(opsFor(program, 0), program.n))`. State: `channel` (default `depolarizing`; or read an optional first line `channel <name>` from the body before parsing the circuit) and `p` (slider; range 0–0.75 for depolarizing, 0–1 otherwise). Compute `noisyProbs(opsFor(program,0), program.n, channel, p)` with `useMemo`. Render **ideal vs noisy** probability bars per basis state (`basisLabel`) — two bars or an overlay — plus a `fidelityDist` readout as a percentage. Channel `<select>` + error-rate slider with `<label>`/`aria-label`/`aria-valuetext`. Header chip "Noise"; `not-prose` card chrome. Reduced motion: static bars. Emoji-free.

- [ ] **Step 6: Register the fence**

`import { NoiseVisualizer } from "./quantum/noise-visualizer";` and:
```tsx
if (code && Array.isArray(className) && className.includes("language-qnoise")) {
  return <NoiseVisualizer source={hastText(code as unknown as HastTextNode)} />;
}
```

- [ ] **Step 7: Component render test**

Create `web/__tests__/components/quantum/noise-visualizer.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoiseVisualizer } from "@/components/quantum/noise-visualizer";

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = jest.fn().mockImplementation((q: string) => ({
    matches: reduced, media: q, onchange: null,
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn(),
  }));
}

describe("NoiseVisualizer", () => {
  beforeEach(() => mockMatchMedia(false));
  it("renders ideal/noisy readouts for a Bell pair at p=0 (fidelity 100%)", () => {
    render(<NoiseVisualizer source={"qubits 2\nH 0\nCNOT 0 1"} />);
    expect(screen.getByText(/100/)).toBeInTheDocument(); // fidelity at default p=0
    expect(screen.getByLabelText(/error rate/i)).toBeInTheDocument();
  });
  it("renders a parse-error card for a bad circuit", () => {
    render(<NoiseVisualizer source={"NOTAGATE 0"} />);
    expect(screen.getByText(/parse error/i)).toBeInTheDocument();
  });
});
```
(Default the slider to p=0 so fidelity starts at 100%; tune matcher strings to your wording.)

- [ ] **Step 8: Run + commit**

Run: `cd web && npx jest noise noise-visualizer markdown-renderer --watchAll=false` → PASS.
```bash
git add web/src/components/quantum/noise.ts web/src/components/quantum/noise-visualizer.tsx web/src/components/markdown-renderer.tsx web/__tests__/components/quantum/noise.test.ts web/__tests__/components/quantum/noise-visualizer.test.tsx
git commit -m "feat(web): qnoise noise-visualizer widget + density-matrix engine"
```

---

### Task 5: Renderer routing tests for the four new fences

**Files:**
- Modify: `web/__tests__/components/markdown-renderer.fence-routing.test.tsx`

- [ ] **Step 1: Add routing cases**

Append four `it(...)` cases mirroring the existing ones in that file (which call `renderFence(lang, body)` against the real `makeComponents().pre()`):
- `qcost` (body `""`) → header text `/cost calculator/i` present.
- `qdevices` (body `""`) → `/devices/i` present (or a known device name like `Aria`).
- `qtopo` (body `JSON.stringify({ topology: "line", qubits: 5, gate: [0,4] })`) → `/connectivity/i` present.
- `qnoise` (body `"qubits 1\nH 0"`) → `/noise/i` present.

Use the file's existing `mockMatchMedia(false)` `beforeEach` (qnoise/qtopo need it).

- [ ] **Step 2: Run + commit**

Run: `cd web && npx jest markdown-renderer.fence-routing --watchAll=false` → PASS.
```bash
git add web/__tests__/components/markdown-renderer.fence-routing.test.tsx
git commit -m "test(web): route qcost/qdevices/qtopo/qnoise fences in renderer"
```

---

### Task 6: Reflow `02-hardware/GUIDE.md`

**Files:**
- Modify: `02-hardware/GUIDE.md`

- [ ] **Step 1: Rewrite to the narrative arc**

Reflow into these sections (energize prose, keep the accurate device facts, embed widgets at their beats). Preserve the existing **Hands-On Exercises** notebook list and the **References** section verbatim.

1. **Cold open** — "You built flawless circuits on an ideal simulator. Real machines are noisy, sparsely wired, slow, and metered. This module is about meeting reality." Fold Learning Objectives + Prerequisites into a short callout (blockquote), not the opener.
2. **Why there's no single best quantum computer** — the trade-off space; the axes that matter (connectivity, fidelity, coherence, speed, qubit count).
3. **Noise — the defining reality of NISQ** — fidelity, depolarizing, amplitude damping, decoherence. Embed:
   ````
   ```qnoise
   qubits 2
   H 0
   CNOT 0 1
   ```
   ````
   Narrate: at error rate 0 the Bell peaks are clean; push the slider and watch them rot toward noise; try amplitude damping vs depolarizing.
4. **Connectivity — the wiring constraint** — all-to-all vs nearest-neighbor; the SWAP tax. Embed:
   ````
   ```qtopo
   {"topology": "grid", "qubits": 9, "gate": [0, 8]}
   ```
   ````
   Contrast IonQ's all-to-all (0 SWAPs) with a lattice.
5. **The three hardware families** — IonQ (trapped ion), IQM (superconducting), QuEra (neutral-atom/analog). Tighten the existing vendor content into prose framed against the axes from section 2 (don't delete the specifics: native gates, qubit counts, strengths/trade-offs). Embed:
   ````
   ```qdevices
   ```
   ````
6. **The simulator ladder — your defense** — Local → SV1 (exact) → DM1 (noise) → TN1 (scale). Keep the existing simulator details and the workflow recommendation. Embed a `qsim` (e.g. the Bell pair) as the "what you debug locally" anchor.
7. **Cost — the discipline** — per-task/per-shot/per-minute; tie to the project's cost-awareness rules. Embed:
   ````
   ```qcost
   ```
   ````
8. **Choosing a device** — a short decision flow (the workflow recommendation as a numbered list) + a `quiz` (~4 questions: which device for dense-connectivity QAOA; why develop on Local first; what DM1 adds over SV1; what a square-lattice topology costs a distant CNOT). Each with `hint` + `a`.
9. **Hands-On Exercises + References** — keep the existing notebook list and references; add a one-line bridge to `03-algorithms`.

- [ ] **Step 2: Verify it renders**

Run: `cd web && npm run build` → succeeds; `out/learn/02-hardware` regenerates with no KaTeX/parse errors and every fence mounts. Eyeball `/learn/02-hardware` via `npm run dev`.

- [ ] **Step 3: Commit**

```bash
git add 02-hardware/GUIDE.md
git commit -m "docs(02-hardware): narrative reflow + interactive noise/topology/cost/devices widgets"
```

---

### Task 7: Full verification

- [ ] **Step 1: Web suite + lint + build**

Run: `cd web && npm test -- --watchAll=false` → all pass (243 + new tests).
Run: `cd web && npm run lint` → clean (no unused vars; if a helper param is unused, remove it).
Run: `cd web && npm run build` → 11 pages; `out/learn/02-hardware` present.

- [ ] **Step 2: Python suite unaffected**

Run: `make test` → green (no Python touched).

- [ ] **Step 3: Manual interaction pass**

`cd web && npm run dev`; open `/learn/02-hardware`; confirm each widget mounts and behaves (qnoise slider degrades the Bell pair; qtopo shows the SWAP path; qcost totals update; qdevices sorts/filters), in light + dark + reduced-motion, no console errors.

- [ ] **Step 4: Sync CLAUDE.md test count if it changed**

Update the `npm test` count in `CLAUDE.md` (stage explicit path only).
```bash
git add CLAUDE.md
git commit -m "docs: sync web test count after 02-hardware widgets"
```

---

## Self-Review checklist (run before finishing)

- Spec coverage: ✅ qcost (T1), qdevices (T2), qtopo (T3), qnoise + density-matrix engine (T4), routing tests (T5), narrative reflow with all widget beats + quiz (T6), verification + count sync (T7).
- No placeholders: pure-logic modules (`cost.ts`, `devices.ts`, `topology.ts`, `noise.ts`) and their tests are complete; components specified as blueprints that mirror named existing components; GUIDE sections specify exact embedded fences.
- Type/name consistency: `estimateCost(provider, shots, minutes, tasks)`, `sortDevices(devices, key, dir)`, `swapCost(topo, n, a, b) → {path, swaps}`, `noisyProbs(ops, n, channel, p) → number[]`, `fidelityDist(ideal, noisy)`, channel names `depolarizing|amplitude-damping|bit-flip`, fence languages `qcost|qdevices|qtopo|qnoise` — all consistent across tasks, tests, and renderer branches.
- nbstripout gotcha called out; every commit stages explicit paths.
