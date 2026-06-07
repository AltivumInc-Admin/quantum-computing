# Algorithms Module (03-algorithms) Overhaul — Design Spec

## Overview

Turn `03-algorithms` ("Quantum Algorithms") from a dense catalog of algorithm summaries into a
narrative lesson with the strongest interactive payoffs in the curriculum. Two pieces:
(1) reflow the prose around an "interference → speedup" spine, simplest-to-most-practical, and
(2) add four new algorithm widgets that *run* the algorithms the prose describes — Grover
amplitude amplification, a QAOA/variational landscape, the Quantum Fourier Transform, and
Deutsch–Jozsa.

Single phase, single PR (no rename/plumbing).

## Goals

- Replace the "Classical: O(N) / Quantum: O(√N) / steps 1,2,3" catalog tone with a motivated
  narrative: every quantum algorithm is choreographed interference that amplifies right answers
  and cancels wrong ones — built simplest-to-practical (DJ → Grover → QFT → QPE → QAOA).
- Make the signature ideas interactive: Grover's iterative amplification (`qgrover`), the
  variational loop (`qoptim`), interference reading periodicity (`qft`), and the one-query oracle
  trick (`qdj`).
- Keep the accurate algorithm content; tighten it into the narrative.

## Non-Goals (Out of Scope)

- The six `03-algorithms` notebooks (`.ipynb`) — unchanged.
- Other modules' prose.
- Any live execution / AWS calls from the browser. All widgets are self-contained client-side
  state-vector simulations (notebooks 04–06 are non-browser-runnable, which is fine — the page
  doesn't run them).
- Emoji / decorative ornamentation.

## Constraints

- Static export only; client components, no SSR.
- Widgets are custom fenced code blocks routed by `web/src/components/markdown-renderer.tsx`,
  following the existing pattern (now 12 fences: qsim, qscrub, qchallenge, quiz, runnable, qbloch,
  qshots, qcorr, qnoise, qtopo, qcost, qdevices).
- Reuse `web/src/components/quantum/math.ts` (`Complex`, `Gate2`, `cAdd`, `cMul`, `cConj`,
  `cAbs2`, `H`, `applyGate1`, `rx`, `probabilities`, `basisLabel`). The `qsim` DSL is NOT used —
  these algorithms need operators beyond it (multi-amplitude oracles, diffusion, DFT, cost
  phases), so each widget has a small dedicated logic module.
- Qubit caps for tractability and clarity: `qgrover` N ≤ 16 (n ≤ 4), `qoptim` ≤ 5 vertices,
  `qft` n ≤ 4, `qdj` n ≤ 3.
- All animations respect `prefers-reduced-motion`; controls keyboard-accessible with ARIA.

---

## The Narrative Arc (resequenced: interference → speedup)

Replaces the current order (oracle algorithms → QFT → QPE → variational → amplitude estimation).

| # | Section | Rationale | Widget |
|---|---|---|---|
| 1 | Cold open | "You have superposition, entanglement, measurement. Here's where they buy *speedup* — and the engine is interference." Objectives/prereqs → compact callout. | — |
| 2 | The shared trick | Oracles + phase kickback; how interference amplifies right answers and cancels wrong ones — the move every algorithm reuses. | reuse `qchallenge` (H-superposition opener) |
| 3 | Deutsch–Jozsa | The simplest proof: one query distinguishes constant vs balanced (Bernstein–Vazirani as a one-line cousin). | NEW **qdj** |
| 4 | Grover's search | Iterative amplitude amplification; quadratic speedup; the ~(π/4)√N optimum and over-rotation. The amplification climax. | NEW **qgrover** |
| 5 | Quantum Fourier Transform | Interference reading periodicity → frequency spikes. | NEW **qft** |
| 6 | Quantum Phase Estimation | QFT reading an eigenphase; foundation of Shor + chemistry. | reuse `qsim` / prose |
| 7 | Variational algorithms & QAOA | The NISQ workhorse: quantum circuit + classical-optimizer loop, on MaxCut. The practical climax. | NEW **qoptim** |
| 8 | Amplitude estimation + Check yourself | Grover generalized; quadratic over Monte Carlo. Then a `quiz`. | `quiz` |
| 9 | Hands-On + References | Preserve notebook list + references; bridge to `04-quantum-ml`. | — |

Voice: open each section with motivation; carry the interference through-line; formalism after
intuition; professional, emoji-free.

---

## New Widgets

All live in `web/src/components/quantum/`, register in `markdown-renderer.tsx`, render a graceful
error card on bad input, and ship unit tests (pure logic, node env) + a component render test
(jsdom; `window.matchMedia` polyfilled locally where the widget reads reduced-motion).

### 1. `qgrover` — Grover amplitude amplification (headline)

- **Module `grover.ts`:**
  - `uniform(n): number[]` — real amplitudes all `1/√(2^n)`.
  - `groverIteration(amps, marked): number[]` — oracle (negate `amps[marked]`) then diffusion
    (reflect about the mean: `a[i] → 2·mean − a[i]`). Amplitudes stay real throughout.
  - `groverHistory(n, marked, maxIter): number[][]` — amplitude vectors for iterations 0…maxIter.
  - `optimalIterations(n): number` — `round((π/4)·√(2^n) − 0.5)`.
- **Fence (`qgrover`, JSON):** `{ "qubits": 3, "marked": 5 }` (defaults n=3, marked=0). Validate
  n in 2…4 and marked in range.
- **UI:** n + marked selectors; an iteration slider (0 … beyond optimal); amplitude bars with the
  marked state highlighted; a success-probability readout (`amps[marked]²`) and the "optimal = K"
  note. Drag past the optimum to watch the probability fall (over-rotation). `not-prose` card.
- **Tests:** N=4 (n=2), 1 iteration → `P(marked) = 1` exactly; N=8 optimal = 2 and `P(marked) ≈
  0.945` at 2 iterations; each iteration preserves Σ amps² ≈ 1; rejects n>4.

### 2. `qoptim` — QAOA / variational landscape

- **Module `qaoa.ts`:**
  - `cutValue(bitstring, edges): number` — count edges whose endpoints differ.
  - `qaoaExpectedCut(n, edges, gamma, beta): number` — QAOA p=1: start `|+⟩^n`; apply the cost
    phase `amp_x *= e^{−iγ·cut(x)}` (diagonal); apply the mixer `RX(2β)` on each qubit (reuse
    `rx` + `applyGate1`); return `Σ_x |amp_x|²·cut(x)`.
  - `qaoaDistribution(n, edges, gamma, beta): number[]` — `|amp_x|²` per bitstring.
  - `qaoaLandscape(n, edges, res): number[][]` — expected cut over a γ×β grid (γ∈[0,π], β∈[0,π/2]).
- **Fence (`qoptim`, JSON):** `{ "edges": [[0,1],[1,2],[2,0]] }` (a triangle; n inferred from max
  index + 1). Validate n ≤ 5 and edge indices.
- **UI:** the graph drawn small; γ/β sliders with a live expected-cut readout; a 2D landscape
  heatmap (γ×β) with the current point and the optimum marked; the resulting bitstring
  distribution bars. `not-prose` card; heatmap `<svg>`/canvas with `role="img"` + aria-label.
- **Tests:** γ=β=0 → state stays uniform, expected cut = mean cut over all bitstrings; triangle
  (3-cycle) max cut = 2 and `cutValue` is correct on sample bitstrings; distribution sums to 1.

### 3. `qft` — Quantum Fourier Transform visualizer

- **Module `qft.ts`:**
  - `qft(amps: Complex[]): Complex[]` — `out[k] = (1/√N) Σ_j amps[j]·e^{2πi·jk/N}`.
  - `basisState(n, j): Complex[]` and `periodicState(n, period): Complex[]` (normalized comb on
    `j ≡ 0 mod period`).
- **Fence (`qft`, JSON):** `{ "qubits": 4, "input": "period:4" }` or `{ "qubits": 4, "basis": 3 }`.
  Default n=4, a period-4 comb. Validate n ≤ 4.
- **UI:** input amplitude/magnitude bars → output magnitude bars (frequency domain), with the
  spikes highlighted; a one-line read of "period r → spikes every N/r." `not-prose` card.
- **Tests:** `qft(basisState(n,0))` → uniform magnitude `1/√N`; `qft(periodicState(n,r))` →
  magnitude concentrated at multiples of `N/r`; norm preserved (Σ|out|² ≈ 1).

### 4. `qdj` — Deutsch–Jozsa oracle demo

- **Module `deutsch-jozsa.ts`:**
  - `djProbabilities(n, f): number[]` — start `|0⟩^n`; `H^n`; phase oracle `amp_x *= (−1)^{f(x)}`;
    `H^n`; return `|amp|²`. Amplitudes stay real (reuse `H` + `applyGate1`).
  - Predefined oracles: `constant0`, `constant1`, and balanced examples (e.g. parity `f(x)=
    popcount(x) mod 2`, lowest-bit `f(x)=x&1`).
  - `isConstant(probs): boolean` — `probs[0] > 0.5` (constant ⇒ all-zeros with certainty).
- **Fence (`qdj`, JSON):** `{ "qubits": 3 }` (default). Validate n in 2…3.
- **UI:** an oracle dropdown (Constant 0, Constant 1, Balanced: parity, Balanced: lowest-bit);
  output probability bars; a verdict chip "Constant" / "Balanced" derived from `probs[0]`.
  `not-prose` card.
- **Tests:** constant oracle → `P(0…0) = 1`; balanced (parity) → `P(0…0) = 0`; verdict correct;
  works for n=2 and n=3.

### Widget integration & data flow

1. Author drops a fence into the GUIDE.
2. `pre()` in `markdown-renderer.tsx` routes `qgrover`/`qoptim`/`qft`/`qdj` to the new components
   (alongside the 12 existing fences).
3. Each parses its JSON, computes locally via its logic module, and renders. No network, no SSR.
4. `markdown-renderer.fence-routing.test.tsx` gains four cases.

---

## Testing Strategy

- **Per widget:** pure-logic unit tests (node env) for `grover.ts`, `qaoa.ts`, `qft.ts`,
  `deutsch-jozsa.ts` with the pinned cases above; component render tests (jsdom); four routing
  cases.
- **Content:** `npm run build` renders the reflowed GUIDE with no KaTeX/parse errors and every
  fence mounting; `npm run lint` clean (watch for `react-hooks/rules-of-hooks` — compute memos
  before any early return, the bug pattern that bit the 02-hardware widgets); manual dev-server
  pass per widget in light/dark/reduced-motion.
- **Regression:** full `npm test` green (current 277 + new); `make test` (Python) unaffected.
- Update `CLAUDE.md` web test count.

## Risks & Mitigations

- **Four widgets is the heaviest module yet** → build simplest-first (qdj, qft, then qgrover,
  then qoptim); each is an independent task; the qubit caps keep all math tiny and exactly
  testable.
- **qoptim landscape is the most complex UI** → MVP is a coarse heatmap (e.g. 24×24) + sliders +
  distribution; no live classical-optimizer loop (the prose explains it; the widget shows the
  landscape the optimizer would traverse).
- **rules-of-hooks regressions** → call all hooks unconditionally before any early-return error
  card (verified by lint in CI).
- **nbstripout gotcha** → stage explicit paths; never `git add -A`.

## Build Sequence

1. `qdj` + `deutsch-jozsa.ts` (simplest; real-vector).
2. `qft` + `qft.ts` (DFT on amplitudes).
3. `qgrover` + `grover.ts` (oracle + diffusion; real-vector).
4. `qoptim` + `qaoa.ts` (cost-phase + mixer + landscape heatmap; highest build).
5. Renderer routing tests for the four fences.
6. GUIDE reflow: rewrite `03-algorithms/GUIDE.md` to the narrative arc, embedding the widgets at
   their beats; preserve the notebook list + references.
7. Verify (full test suite, lint, build, manual pass); ship the PR.
