# Interactive Quantum Simulations Embedded in Lessons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace passive prose in `GUIDE.md` with embedded, interactive R3F-based simulations — a draggable Bloch sphere, a drag-drop circuit playground, animated amplitude bars — rendered inline through a fenced-code directive system in the existing markdown renderer.

**Architecture:** Pure-TS state-vector math kernel (no WASM); three client-only React Three Fiber components lazy-loaded via `next/dynamic({ssr:false})`; `react-markdown` `components` override that swaps fenced ```bloch / ```circuit / ```amp blocks for the matching component. Optional scroll-driven gate scrubbing layered on top via CSS `animation-timeline: view()` with `@supports` and `prefers-reduced-motion` guards.

**Tech Stack:** Next.js 16 static export, React 19, Tailwind v4, three, @react-three/fiber, @react-three/drei, react-markdown (already installed).

---

## Objective

Today the curriculum's `GUIDE.md` files explain that the Hadamard gate creates `(|0> + |1>) / √2` and the learner's only feedback is reading the prose. After this plan, every concept gets a tangible playground next to its explanation: drag-rotate a Bloch sphere, drop gates onto a circuit and watch the state evolve, see amplitudes animate as a Bell state forms. The pattern is fenced-code-driven so contributors can add a sim by writing six lines of YAML-lite directive inside their markdown — no React knowledge required.

## Prerequisites

- Node 18+, npm; existing Next.js 16 + React 19 + Tailwind v4 stack already configured.
- Familiarity with React Three Fiber (`meta-skills:web3d-integration-patterns` and `core-3d-animation:react-three-fiber` skills).
- Read: `web/src/components/markdown-renderer.tsx`, `web/src/lib/content.ts`, `web/src/app/globals.css` (the OKLCH `--color-accent` / `--color-warm` palette).
- Decision: which three lessons to retrofit first (recommend `00-foundations`, `02-algorithms`, `03-quantum-ml`).
- Decision: scroll-driven gate scrubbing — ship now or follow-up (recommend follow-up; not on critical path).

## Step-by-Step Implementation

1. Install 3D dependencies
   - [ ] 1.1. From `web/`: `npm install three @react-three/fiber @react-three/drei`
   - [ ] 1.2. `npm install --save-dev @types/three`
   - [ ] 1.3. Run `npm run build` and confirm static export still succeeds.

2. Create the quantum component directory
   - [ ] 2.1. `mkdir -p web/src/components/quantum`
   - [ ] 2.2. Create `web/src/components/quantum/index.ts` (re-exports added later).

3. Build the math kernel
   - [ ] 3.1. Create `web/src/components/quantum/math.ts` exporting:
     - `type Complex = { re: number; im: number }`
     - `type Ket = Complex[]` (length 2^n)
     - `applyGate(state: Ket, gate: number[][], targets: number[], totalQubits: number): Ket`
     - Named gate constants `H`, `X`, `Y`, `Z`, `S`, `T`, `RX(θ)`, `RY(θ)`, `RZ(θ)`, `CNOT`.
     - `blochCoords(singleQubitKet: Ket): { x, y, z }`
     - `probabilities(state: Ket): number[]`

4. Test the math kernel
   - [ ] 4.1. Create `web/src/components/quantum/math.test.ts`.
   - [ ] 4.2. Assert `H|0> = |+>`, `H H |0> = |0>`, `CNOT(|+0>) = (|00> + |11>)/√2`, Bloch of `|+>` is `(1, 0, 0)`.
   - [ ] 4.3. Property test: 100 random gate sequences preserve norm to within 1e-10.
   - [ ] 4.4. `cd web && npm test -- math` → all pass.

5. Build `<BlochSphere>`
   - [ ] 5.1. Create `web/src/components/quantum/bloch-sphere.tsx` with `"use client"`.
   - [ ] 5.2. `<Canvas camera={{position:[2,2,2]}}>` containing wireframe sphere, OKLCH-tinted XYZ axes, a glowing state-vector arrow, and `<OrbitControls enableZoom={false}/>`.
   - [ ] 5.3. Props: `{ state: Ket; size?: number; interactive?: boolean }`.
   - [ ] 5.4. Read `prefers-reduced-motion` via `useReducedMotion()`; if reduced, render a static SVG fallback instead of `<Canvas>`.

6. Build `<CircuitPlayground>`
   - [ ] 6.1. Create `web/src/components/quantum/circuit-playground.tsx`.
   - [ ] 6.2. Layout: horizontal wires for each qubit, palette of draggable gates above wires.
   - [ ] 6.3. Use native HTML5 `draggable` + `dataTransfer.setData("gate", "H")`; no extra DnD library.
   - [ ] 6.4. State updates on each drop using the math kernel; emit `onStateChange(state)` upward.
   - [ ] 6.5. Internal `<AmplitudeBars state={state}/>` and optional linked `<BlochSphere>` slot.

7. Build `<AmplitudeBars>`
   - [ ] 7.1. Create `web/src/components/quantum/amplitude-bars.tsx`.
   - [ ] 7.2. One bar per basis state. Length = `|amp|²` (probability), color hue = phase angle (HSL `(arg(amp) * 180/π)`).
   - [ ] 7.3. CSS transitions on `width` and `background-color` for smooth updates.

8. Build the directive parser
   - [ ] 8.1. Create `web/src/components/quantum/parse-fence.ts`.
   - [ ] 8.2. Parse fence body as YAML-lite: `state: |+>`, `qubits: 2`, `gates: [{at: 0, gate: H}, {at: [0,1], gate: CNOT}]`.
   - [ ] 8.3. Return a typed `Directive` discriminated union: `{ kind: "bloch" | "circuit" | "amp"; ... }`.
   - [ ] 8.4. Unit-test parser with three valid and three malformed inputs; malformed returns null + reason.

9. Wire the markdown renderer
   - [ ] 9.1. Modify `web/src/components/markdown-renderer.tsx`.
   - [ ] 9.2. Pass a `components` prop to `<ReactMarkdown>` overriding `code`:
     ```tsx
     code({ className, children, ...props }) {
       const lang = className?.replace("language-", "");
       if (lang === "bloch") return <BlochFence>{children}</BlochFence>;
       if (lang === "circuit") return <CircuitFence>{children}</CircuitFence>;
       if (lang === "amp") return <AmpFence>{children}</AmpFence>;
       return <code className={className} {...props}>{children}</code>;
     }
     ```
   - [ ] 9.3. The three `*Fence` wrappers parse the body and `next/dynamic`-load the component with `{ ssr: false, loading: () => <SimSkeleton /> }`.

10. Add lazy-load guard
    - [ ] 10.1. Wrap each fence's dynamic-loaded component in `<IntersectionObserver rootMargin="200px">` so the sim only initializes when within ~200px of viewport.
    - [ ] 10.2. Idle placeholder is a 1-line skeleton — keeps initial CLS at 0.

11. Retrofit `00-foundations/GUIDE.md`
    - [ ] 11.1. After the Bloch sphere paragraph (~line 37), insert:
      ```
      ```bloch
      state: |0>
      gates: [H]
      ```
      ```
    - [ ] 11.2. After the H-gate description (~line 56), insert:
      ```
      ```circuit
      qubits: 1
      gates: [{at: 0, gate: H}]
      ```
      ```
    - [ ] 11.3. After the multi-qubit gates section, insert a Bell-state circuit.
    - [ ] 11.4. Run `npm run dev`, visit `/learn/00-foundations`, visually confirm each sim renders and is interactive.

12. Retrofit `02-algorithms/GUIDE.md`
    - [ ] 12.1. Grover oracle playground (3 qubits, parameterized oracle).
    - [ ] 12.2. Deutsch–Jozsa visualization.

13. Retrofit `03-quantum-ml/GUIDE.md`
    - [ ] 13.1. Parameterized `RY(θ)` layer with a slider for θ; live readout of expectation.

14. Optional: scroll-driven gate scrubbing
    - [ ] 14.1. In `web/src/app/globals.css`, add:
      ```css
      @supports (animation-timeline: view()) {
        .quantum-sim[data-scrubbable="true"] {
          animation: scrub-gates linear both;
          animation-timeline: view();
          animation-range: cover 20% cover 80%;
        }
        @keyframes scrub-gates {
          from { --gate-step: 0; }
          to { --gate-step: 1; }
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .quantum-sim[data-scrubbable="true"] { animation: none; }
      }
      ```
    - [ ] 14.2. `<CircuitPlayground>` reads `--gate-step` via `useLayoutEffect` and advances gate-by-gate.

15. Documentation
    - [ ] 15.1. Create `web/src/components/quantum/README.md` documenting fence syntax with three examples.

16. Performance gate
    - [ ] 16.1. Add `bundlewatch` (or simple post-build size check) for `/learn/[section]` route: ≤ 250KB gz.
    - [ ] 16.2. Fail CI if exceeded.

17. Ship
    - [ ] 17.1. Run Lighthouse on `/learn/00-foundations` locally; Performance ≥ 85.
    - [ ] 17.2. Open PR with screenshots; deploy to Amplify preview.
    - [ ] 17.3. Commit with conventional message: `feat(web): embed interactive quantum simulations in lessons`.

## File & Code Changes

| Action | File Path | Description |
|--------|-----------|-------------|
| Create | `web/src/components/quantum/math.ts` | Complex algebra, gates, state evolution, Bloch coords |
| Create | `web/src/components/quantum/math.test.ts` | Math kernel unit + property tests |
| Create | `web/src/components/quantum/bloch-sphere.tsx` | R3F draggable Bloch sphere component |
| Create | `web/src/components/quantum/circuit-playground.tsx` | Drag-drop circuit canvas |
| Create | `web/src/components/quantum/amplitude-bars.tsx` | Phase-colored amplitude histogram |
| Create | `web/src/components/quantum/parse-fence.ts` | Fence-body directive parser |
| Create | `web/src/components/quantum/parse-fence.test.ts` | Parser tests |
| Create | `web/src/components/quantum/index.ts` | Public re-exports |
| Create | `web/src/components/quantum/README.md` | Directive syntax reference |
| Modify | `web/src/components/markdown-renderer.tsx` | Add `components` override for fenced quantum blocks |
| Modify | `web/src/app/globals.css` | Optional scroll-driven animation timeline + reduced-motion guard |
| Modify | `web/package.json` | Add three, @react-three/fiber, @react-three/drei, @types/three |
| Modify | `00-foundations/GUIDE.md` | Insert bloch/circuit/amp fences |
| Modify | `02-algorithms/GUIDE.md` | Insert fences |
| Modify | `03-quantum-ml/GUIDE.md` | Insert fences |

## Testing & Validation

- **Unit:** `math.test.ts` — gate semantics, norm preservation under 100 random sequences, Bloch coords for canonical states.
- **Parser:** `parse-fence.test.ts` — three valid + three malformed directives.
- **Component:** `bloch-sphere.test.tsx` and `circuit-playground.test.tsx` — render without crash; respect `prefers-reduced-motion`; simulated drag adds a gate; `onStateChange` fires with expected state.
- **Manual:**
  - `/learn/00-foundations` shows three working sims.
  - Dropping H on q0 in the circuit playground splits amplitudes 50/50 and points Bloch arrow to +X.
  - Theme toggle re-tints sims.
  - Network throttle Slow 3G — sim loads only when scrolled into view.
- **Rollback:** revert `markdown-renderer.tsx` + `globals.css`; GUIDE.md still renders (fences become plain code blocks).

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bundle bloat tanks LCP | High | High | Lazy-load via `next/dynamic({ssr:false})` + IntersectionObserver; share one `<Canvas>` per page; CI budget ≤ 250KB gz |
| R3F crashes static export | Medium | High | All sims are `"use client"` + `dynamic({ssr:false})`; check `npm run build` after each component |
| Scroll-driven animations unsupported in Safari | High | Low | `@supports (animation-timeline: view())` guard; fall back to manual gate-step click |
| Custom fences confuse markdown contributors | Medium | Medium | One-page README; fences degrade to readable code blocks if JS off |
| Math kernel bugs poison pedagogy | Low | High | Property tests on norm + canonical states; cross-check against numpy.linalg on a one-off harness |
| Reduced-motion users see broken UI | Low | Medium | Static SVG fallback inside `<BlochSphere>` for reduced-motion |

## Dependencies & Order of Operations

- Steps 1–4 (deps + math + tests) gate everything else.
- Steps 5–7 (the three components) parallelize.
- Step 8 (parser) and 9 (renderer wiring) sequential.
- Steps 11–13 (lesson retrofits) parallelize after step 9.
- Step 14 (scroll-driven) is optional follow-up.
- Step 16 (perf gate) wraps everything.

## Estimated Effort

- **Complexity:** Medium
- **Time estimate:** 12–18 working days for one engineer; 7–10 days with two engineers parallelizing components.
- **Files affected:** 9 created, 6 modified.
