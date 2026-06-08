# 05-quantum-chemistry Module Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reflow `05-quantum-chemistry/GUIDE.md` into a captivating narrative and add four numerically honest VQE widgets (qjw, qham, qvqe, qpes) driven by a real committed H2 fixture.

**Architecture:** Pure-client React widgets rendered from markdown fences; all chemistry math in the already-built, tested `chemistry.ts`/`jw.ts` kernel reading one committed fixture (`__fixtures__/h2_dissociation.json`). Big-endian conventions match `math.ts`/qcsim.

**Tech Stack:** Next.js 16 static export, React 19, Tailwind v4, Jest, PennyLane (offline fixture generator only).

---

## Status of foundations (DONE — committed)

- `scripts/gen_h2_fixture.py` + `web/src/components/quantum/__fixtures__/h2_dissociation.json` — real PennyLane DHF data, 49 R points, 15 JW coeffs + tapered (c0,cz,cx) + STO-3G FCI + RHF. Commit `eae7028`.
- `web/src/components/quantum/chemistry.ts` + `jw.ts` + their tests (18 tests, green). Commit `ea5d07b`. Verified invariants: `exactGround(15-term JW H)=FCI` ∀R; tapered `c0−hypot(cz,cx)=FCI`; `HF≥FCI`; equilibrium −1.1373 Ha @ 0.75 Å.

Kernel API available to all components (import from `./chemistry` / `./jw`):
`pauliExpectation, hamiltonianExpectation, energy1q, oneQubitHamiltonian, pauliMatrix, hamiltonianMatrix, eighSymmetric, exactGround, prepareAnsatz, vqeEnergy, vqeGridSearch, vqeGradientDescent, loadH2Curve, h2OneQubit, jwHamiltonian, H2Point, H2Curve` and `jwString, jwTransform, hfOccupation, occupationToBitstring, occupationIndex, electronCount`.

The fixture is imported once in a tiny shared module (Task 1) so components do not each re-read it.

---

## Shared conventions (ALL components)

Follow `vqc-trainer.tsx` and `qaoa-explorer.tsx` exactly:
1. `"use client"`; ALL hooks (`useState/useMemo/useId`) called unconditionally at top; parse/error early-return AFTER all hooks. Expensive computation in `useMemo` keyed on the parse result.
2. Pure `parseSource(source)` → discriminated union `{ok:true,...}|{ok:false,error}`. Empty source → sensible default (HF state / equilibrium R). `JSON.parse` in try/catch; validate ranges.
3. Widget-specific `ErrorCard` with prefix (`qjw error:` etc.) using shared card classes (`rounded-card`, border, dark surface `color-mix`, `shadow-(--shadow-resting)`, `font-mono`).
4. Every SVG: `role="img"` + descriptive `aria-label` stating live numbers; decorative SVG text `aria-hidden`. Sliders: `useId` for `htmlFor`/`id`, `aria-label`, `aria-valuetext` in physical units.
5. Reduced motion: pair every transition/animation with `motion-reduce:transition-none`.
6. Numbers: `tabular-nums`, fixed `toFixed`. Colors via tokens (`var(--accent)`, `color-mix in oklab`, `dark:`), never hardcoded hex.
7. No emojis anywhere. No AWS/SSR calls.
8. Each new fence: a routing test in `markdown-renderer.fence-routing.test.tsx` and (for any new pure logic) a unit test. (Kernel already tested; components need routing tests + optional light render tests.)

---

## Task 1: Shared fixture module

**Files:** Create `web/src/components/quantum/h2-data.ts`

- [ ] **Step 1:** Implement and verify it loads.

```ts
import raw from "./__fixtures__/h2_dissociation.json";
import { loadH2Curve, type H2Curve } from "./chemistry";

// Single parsed instance of the committed H2 dissociation fixture, shared by the
// qham/qvqe/qpes widgets so they always agree.
export const H2: H2Curve = loadH2Curve(raw);
```

- [ ] **Step 2:** Confirm `resolveJsonModule` is on (it is, tsconfig.json:12) and `npm run build` still compiles. Commit.

---

## Task 2: `qjw` — EncodingExplorer-style Jordan-Wigner widget

**Files:** Create `web/src/components/quantum/jw-explorer.tsx`

Fence body (optional JSON): `{ "modes": 4, "electrons": 2, "mode": 0, "dagger": true }`. Empty → default `{modes:4, electrons:2, mode:0, dagger:true}` (H2).

Component `JwExplorer({ source }: { source: string })`:
- Parse → `{modes, electrons, mode, dagger}`; clamp `mode ∈ [0,modes-1]`, `modes ∈ [1,6]`.
- State: selected `mode` (click a mode), `dagger` toggle (creation vs annihilation).
- Render: (a) the HF occupation row from `hfOccupation(electrons,modes)` as labeled qubit cells `|1100⟩`; (b) for the selected operator, `jwTransform(mode,modes,dagger)` → show the Pauli string as a row of boxes (Z on lower modes, X/Y on the mode, I above), with the `(X ∓ iY)/2` formula and a one-line plain-English note ("the Z-string counts the parity of all lower-occupied orbitals"). 
- SVG/markup `role="img"` + aria-label naming the current operator and its Pauli string. Mode buttons keyboard-accessible.
- `ErrorCard` prefix `qjw error:`.

---

## Task 3: `qham` — Hamiltonian + tapering keystone widget

**Files:** Create `web/src/components/quantum/hamiltonian-explorer.tsx`

Fence body (optional): `{ "R": 0.75, "tapered": false }`. Empty → equilibrium R, untapered.

Component `HamiltonianExplorer({ source })`:
- Import `H2` from `./h2-data`. State: `R` (slider over `H2.points` range), `tapered` toggle.
- Nearest fixture point for R (or interpolate display coeffs): show the **15 weighted Pauli strings** (`H2.jwTerms` + that point's `jw` coeffs) as a sorted bar list (coefficient magnitude bars, term label in mono). Bond-length slider re-weights live.
- `tapered` toggle: fold to the single-qubit `H = c0·I + cz·Z + cx·X` using `h2OneQubit(R, H2.points)`; animate/much-fewer terms; show the qubit-budget readout: **4 qubits / 15 terms → 1 qubit / 3 terms**, plus a one-line projection ("H2O in STO-3G needs 14 qubits before tapering/active space"). 
- Visible **"STO-3G minimal basis"** badge + a `title`/note citing the provenance.
- SVG bars `role="img"` + aria-label (e.g. "H2 Hamiltonian, 15 Pauli terms at R=0.75 Å; largest coefficient Z on qubit 2, −0.51"). Slider a11y per conventions.
- `ErrorCard` prefix `qham error:`.

---

## Task 4: `qvqe` — single-qubit VQE energy landscape

**Files:** Create `web/src/components/quantum/vqe-explorer.tsx`
**Renderer fence:** `qvqe` (NOT `qvqc`).

Fence body (optional): `{ "R": 0.75 }`. Empty → equilibrium.

Component `VqeExplorer({ source })`:
- Import `H2`, `h2OneQubit`, `energy1q`, `exactGround`, `oneQubitHamiltonian`, `vqeGradientDescent`, and `ry`/`blochVector` from math for the Bloch readout.
- State: `theta` (slider −π…π), `R` (optional small slider, default equilibrium), optimizing flag.
- Compute `{c0,cz,cx}=h2OneQubit(R,H2.points)`. Draw `E(θ)=energy1q(...)` as a sinusoid curve over θ; a moving dot at current θ; a horizontal **variational floor** at `exactGround(oneQubitHamiltonian(c0,cz,cx)).energy` = `c0−hypot(cz,cx)`. Live energy readout in Ha.
- A small Bloch indicator: `⟨Z⟩=cos θ`, `⟨X⟩=sin θ` (reuse `blochVector(prepareAnsatz([theta]))` or compute directly) — show the state vector swinging in the X–Z plane.
- "Optimize" button: animate `vqeGradientDescent` from current θ to the floor (step through `history`, respect reduced motion → jump to result). Caption: floor = exact ground energy *because the 1-qubit ansatz is exact for tapered H2* (do not over-generalize).
- SVG `role="img"` + aria-label with current θ, E(θ), and the floor. Slider a11y.
- `ErrorCard` prefix `qvqe error:`.

---

## Task 5: `qpes` — potential energy surface (payoff)

**Files:** Create `web/src/components/quantum/pes-explorer.tsx`

Fence body (optional): `{ "mark": 0.75 }`. Empty → mark equilibrium.

Component `PesExplorer({ source })`:
- Import `H2`. Build three curves over `H2.points`: VQE/FCI = `fci` (state VQE points lie on it; optionally overlay sparse VQE dots from `c0−hypot`), `hf`, and label FCI as **"STO-3G FCI"**.
- Plot E vs R (axes labeled, Å and Ha). Mark: equilibrium (min FCI, `H2.equilibrium`), well depth (dissociation `fci` − min `fci`), dissociation asymptote (right-edge `fci`). A draggable/scrubber `mark` point shows E values at that R and (optionally) links to the qvqe sinusoid conceptually (caption only — no cross-component coupling).
- Teaching callout: the HF–FCI gap (static correlation) widens as the bond breaks; RHF fails to dissociate. **"STO-3G minimal basis"** badge + note that minimal-basis FCI ≠ experimental exact PES.
- SVG `role="img"` + aria-label (equilibrium R, well depth, dissociation energy). 
- `ErrorCard` prefix `qpes error:`.

---

## Task 6: Renderer wiring + routing tests (controller, serial)

**Files:** Modify `web/src/components/markdown-renderer.tsx`; `web/__tests__/components/markdown-renderer.fence-routing.test.tsx`

- [ ] Add 4 imports after `import { VqcTrainer } ...`:
```ts
import { JwExplorer } from "./quantum/jw-explorer";
import { HamiltonianExplorer } from "./quantum/hamiltonian-explorer";
import { VqeExplorer } from "./quantum/vqe-explorer";
import { PesExplorer } from "./quantum/pes-explorer";
```
- [ ] Add 4 `pre()` branches after the `language-qvqc` branch:
```ts
if (code && Array.isArray(className) && className.includes("language-qjw")) {
  return <JwExplorer source={hastText(code as unknown as HastTextNode)} />;
}
if (code && Array.isArray(className) && className.includes("language-qham")) {
  return <HamiltonianExplorer source={hastText(code as unknown as HastTextNode)} />;
}
if (code && Array.isArray(className) && className.includes("language-qvqe")) {
  return <VqeExplorer source={hastText(code as unknown as HastTextNode)} />;
}
if (code && Array.isArray(className) && className.includes("language-qpes")) {
  return <PesExplorer source={hastText(code as unknown as HastTextNode)} />;
}
```
- [ ] Add 4 routing tests (use distinctive header text each widget renders):
```ts
it("routes a qjw fence to the Jordan-Wigner widget", () => {
  renderFence("qjw", JSON.stringify({ modes: 4, electrons: 2 }));
  expect(screen.getByText(/jordan-wigner/i)).toBeInTheDocument();
});
it("routes a qham fence to the Hamiltonian widget", () => {
  renderFence("qham", JSON.stringify({ R: 0.75 }));
  expect(screen.getByText(/hamiltonian/i)).toBeInTheDocument();
});
it("routes a qvqe fence to the VQE widget", () => {
  renderFence("qvqe", JSON.stringify({ R: 0.75 }));
  expect(screen.getByText(/^vqe/i)).toBeInTheDocument();
});
it("routes a qpes fence to the energy-surface widget", () => {
  renderFence("qpes", JSON.stringify({ mark: 0.75 }));
  expect(screen.getByText(/energy surface|dissociation/i)).toBeInTheDocument();
});
```
(Match the exact header strings each component renders.)
- [ ] Run full `npx jest`; fix routing-test text to match component headers. Commit.

---

## Task 7: GUIDE reflow (controller, inline)

**Files:** Modify `05-quantum-chemistry/GUIDE.md`

- [ ] Keep H1 `# Quantum Chemistry & Biochemistry`. Add a captivating 1–2 sentence intro paragraph (drives the landing-card summary; markdown-light).
- [ ] Reflow into the through-line: electronic-structure problem → second quantization → **Jordan-Wigner** (embed `qjw`) → the **H2 Hamiltonian** + symmetry tapering (embed `qham`) → **VQE** + variational principle (embed `qvqe`) → **dissociation curve / PES** (embed `qpes`) → ansatz design (keep the existing `qscrub`) → basis sets & active space → applications (with real energy scales: equilibrium −1.137 Ha, well depth 0.20 Ha, the correlation-energy gap).
- [ ] Preserve verbatim: Learning Objectives (6), Prerequisites (3), Hands-On (8 notebooks — descriptions accurate per the workflow summaries), Scripts (3), all References (AWS, 6 videos, 5 papers). Keep the "next module" pointer to `06-hybrid-jobs`.
- [ ] No emojis. Commit.

---

## Task 8: README fix + manifest check + CLAUDE sync (controller)

**Files:** Modify `README.md`, `CLAUDE.md`; run manifest validator.

- [ ] Fix stale numbering in `README.md`: chemistry → **05**, hybrid → **06** (flowchart ~line 79, table ~line 98). Verify the `05-quantum-chemistry/` layout line is correct.
- [ ] Run `.venv/bin/python scripts/validate_runnable.py --write-manifest`; confirm no unintended diff to `web/src/lib/content-manifest.json` (H1 unchanged → expect no-op). If it changes, inspect and include only legitimate updates.
- [ ] After all tests pass, update `CLAUDE.md` web test count to the new total. Commit.

---

## Task 9: Full verification + PR (controller)

- [ ] `cd web && npx jest` — all green (kernel + routing + existing).
- [ ] `npm run lint` — clean.
- [ ] `npm run build` — static export, 11 pages.
- [ ] `cd .. && .venv/bin/python -m pytest -q` — unchanged (142 passed).
- [ ] Push branch; open PR `feat(web): 05-quantum-chemistry overhaul — VQE narrative + qjw/qham/qvqe/qpes`. Watch CI. Present green PR; merge after user approval.

## Self-Review notes
- Spec coverage: all four widgets + README fix + preservation list covered (Tasks 2–8).
- No placeholders: kernel code is real and committed; component contracts specify props, parse, render, a11y.
- Type consistency: components consume the exact exported kernel signatures listed under "Status of foundations".
- Fence-name check: `qvqe` used everywhere (not `qvqc`).
