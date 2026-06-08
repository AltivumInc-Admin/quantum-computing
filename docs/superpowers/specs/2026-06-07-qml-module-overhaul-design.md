# Quantum Machine Learning Module (04-quantum-ml) Overhaul — Design Spec

## Overview

Turn `04-quantum-ml` ("Quantum Machine Learning") from a dense concept catalog into a narrative
lesson — "machine learning where the model *is* a quantum circuit" — with four interactive widgets
covering the field's most important visual ideas: data encoding, the quantum-kernel decision
boundary, live variational-classifier training, and barren plateaus.

Single phase, single PR (no rename/plumbing).

**All QML math AND the behavioral feasibility of each widget were verified up front by a 12-agent
adversarial workflow** (4 widgets × 3 lenses). That verification corrected real defects and pinned
the make-or-break parameters; they are baked into this spec.

## Goals

- Replace the catalog tone with the spine: encode classical data into a quantum feature space →
  a PQC is a neural net → two ways to learn (kernels vs variational) → the barren-plateau wall →
  PennyLane tooling → does it actually help. Build from `03-algorithms`' variational machinery.
- Make the iconic QML ideas interactive: `qencode`, `qkernel`, `qvqc`, `qbarren`.
- Keep the accurate QML content; tighten it into the narrative.

## Non-Goals (Out of Scope)

- The seven `04-quantum-ml` notebooks (`.ipynb`) — unchanged.
- Other modules' prose.
- Any live AWS/PennyLane execution from the browser. All widgets are self-contained client-side
  state-vector simulations (notebooks 01–07 are non-browser-runnable, which is fine).
- Emoji / decorative ornamentation.

## Constraints

- Static export only; client components, no SSR. Widgets are custom fenced code blocks routed by
  `web/src/components/markdown-renderer.tsx` (now 16 fences).
- Reuse `web/src/components/quantum/math.ts` (`Complex`, `cAdd`, `cMul`, `cConj`, `cAbs2`, `H`,
  `ry`, `rz`, `applyGate1`, `applyCNOT`, `basisLabel`). All sims are ≤2 qubits except `qbarren`
  (≤8 qubits, ≤256 amplitudes — still trivial).
- **Conventions (load-bearing — wrong signs silently change results):** `RY(t)=exp(-i t Y/2)=
  [[cos t/2, -sin t/2],[sin t/2, cos t/2]]`; `RZ(t)=diag(e^{-it/2}, e^{+it/2})`; big-endian
  (qubit 0 = MSB, amplitude index `q0*2+q1`); parameter-shift gradient `= (1/2)[f(θ+π/2) −
  f(θ−π/2)]` (keep the 1/2). Web widgets mirror `lib/ml/feature_maps.py` / `classifiers.py`.
- All animations respect `prefers-reduced-motion`; controls keyboard-accessible with ARIA;
  **all React hooks called unconditionally before any early return** (the 02-hardware lesson).

---

## The Narrative Arc (resequenced)

| # | Section | Beat | Widget |
|---|---|---|---|
| 1 | Cold open | "ML where the model *is* a quantum circuit" — `03`'s variational engine becomes a learner. Objectives/prereqs → callout. | — |
| 2 | Getting data in: encoding | basis / angle / amplitude / IQP / re-uploading; the choice fixes the feature space. | NEW **qencode** |
| 3 | The model: a PQC is a neural net | encoding=input, unitaries=hidden, measurement=output; parameter-shift gradients. | reuse `qsim` / prose |
| 4 | Two ways to learn | quantum **kernels** (compute K → classical SVM) and **variational** (train end-to-end). | NEW **qkernel** + NEW **qvqc** |
| 5 | QNN architectures | hardware-efficient vs strongly-entangling vs convolutional. | prose |
| 6 | The catch: barren plateaus | gradients vanishing ~2^-n; the wall and its mitigations. | NEW **qbarren** |
| 7 | The tooling: PennyLane + Braket | differentiable QC, one-line device switching. | keep code block |
| 8 | Does it actually help? + Check yourself | the "power of data" caveat. | `quiz` |
| 9 | Hands-On + References | preserve notebook list + references; bridge to `05-quantum-chemistry`. | — |

Voice: motivation-first; carry the "model is a circuit" through-line; formalism after intuition;
professional, emoji-free.

---

## New Widgets

All in `web/src/components/quantum/`, registered in `markdown-renderer.tsx`, error-card on bad
input, unit tests (node) + component render tests (jsdom) + a renderer routing test each.

### 1. `qencode` — data encoding (medium)

- **Module `encoding.ts`:**
  - `angleState(x0, x1): Complex[]` — `ry(x0)⊗ry(x1)` applied to `|00⟩` (2 qubits).
  - `amplitudeState(features): Complex[]` — `v/‖v‖`; **guard ‖v‖<1e-9 → fall back to |0…0⟩**;
    a 2-feature point is **1 qubit** (N=2), not 2 (zero-pad to next power of two otherwise).
  - `iqpState(x0, x1, reps=2): Complex[]` — per rep on `|00⟩`: `H⊗H`; `RZ(2x0)·RZ(2x1)`; ZZ block
    `CNOT(0→1); RZ(2(π−x0)(π−x1)) on q1; CNOT(0→1)` (this `CX·RZ(2φ)·CX` realizes `exp(−iφ Z⊗Z)`,
    matching `lib/ml/feature_maps.py`). Use one consistent sign convention throughout.
  - `fidelity(a, b): number` = `|Σ_k conj(a_k)·b_k|²`.
- **Fence (`qencode`, JSON):** `{ "x": [0.6, 0.9], "encoding": "angle" }`; default angle, x=[0.5,0.5].
- **UI:** two feature sliders (x0,x1 ∈ [−π,π]); an encoding selector (Angle / Amplitude / IQP);
  show the resulting state (amplitude bars + Dirac), per-qubit Bloch (angle/amplitude), and a live
  norm=1 readout. `not-prose` card; header chip "Encoding".
- **Tests:** `angleState(π,0)` → qubit0 = |1⟩; angle self-kernel = 1 and the **closed form
  `fidelity(angleState(x), angleState(x')) = ∏ cos²((xᵢ−x'ᵢ)/2)`** (great cross-check); amplitude
  norm=1 and zero-vector guard; iqp state norm=1; all fidelities in [0,1].

### 2. `qkernel` — quantum kernel decision boundary (medium-high)

- **Module `kernel.ts`:**
  - `featureState(x0, x1, map, scale): Complex[]` — `map ∈ {angle, iqp}` (reuse `encoding.ts`),
    angles scaled by `scale`.
  - `kernelMatrix(points, map, scale): number[][]` — `K_ij = fidelity(φ(xᵢ), φ(xⱼ))` (exact, no
    shots). Symmetric, `K_ii=1`, `K∈[0,1]`.
  - `kernelScore(x, train, labels, map, scale, bias): number` — `Σ_i yᵢ K(x, xᵢ) + bias`
    (Parzen / kernel-mean; α≡1). **`bias` is REQUIRED** = `−mean_j(Σ_i yᵢ K(xⱼ, xᵢ))` (centers the
    threshold; without it class imbalance breaks the demo — measured acc 0.65–0.75 → fixed).
  - `predict = sign(kernelScore)`.
  - Toy datasets: `circles` (inner r∈[0,0.35] label −1, outer r∈[0.75,1.0] label +1, noise 0.08)
    and `xor` (centers (±0.6,±0.6), diagonal pairs share a label, noise ~0.1).
- **Fence (`qkernel`, JSON):** `{ "dataset": "circles", "map": "iqp" }`.
- **UI:** the 2D dataset scattered; the decision boundary over a grid (sign of `kernelScore`, ~40×40
  cells); a **feature-scale slider 0.3–2.0** (default ≈ `(π/2)/max|x|`) — pushing it high visibly
  aliases/degrades accuracy (a teaching beat); a map toggle (angle vs IQP); a one-line accuracy
  readout vs a linear (nearest-mean) baseline (~chance on these sets). Angle map suits XOR; IQP
  suits circles. `not-prose` card; header chip "Quantum kernel".
- **Tests:** `kernelMatrix` symmetric + unit diagonal + ∈[0,1]; the required bias centers the
  score; quantum kernel beats the linear baseline on at least one toy set (accuracy assertion with
  a fixed seed).

### 3. `qvqc` — variational classifier live training (highest)

- **Module `vqc.ts`:**
  - State sim: 2 qubits; `expectZ0(state)` = `(|a00|²+|a01|²) − (|a10|²+|a11|²)` (unit-tested:
    `|00⟩→+1`, X on q0 → −1).
  - `vqcOutput(x, theta, bias): number` — encode `RY(s·x0)q0, RY(s·x1)q1` (data, not trainable);
    ansatz **L=2 blocks, each `CNOT(0→1); RY(θ)q0; RY(θ)q1; RZ(θ)q0; RZ(θ)q1`, plus a final
    `RY(θ)q0`** (so q0's last gate before Z₀ is non-diagonal and every param is live) → 9 params;
    return `expectZ0 + bias`.
  - `paramShiftGrad(...)` — per angle param `j`: `0.5·(f(θⱼ+π/2) − f(θⱼ−π/2))` (keep the 0.5).
  - `trainStep(theta, bias, data, lr)` — MSE loss `mean_k (f_k − y_k)²`, `y∈{−1,+1}`; gradient
    `dL/dθⱼ = mean_k 2(f_k − y_k)·gradⱼ`, `dL/dbias = mean_k 2(f_k − y_k)`; one GD update. `lr≈0.3`.
  - Small random init `θ ~ U(−0.1, 0.3)`; dataset = two Gaussian blobs at (±0.7,±0.7), σ≈0.35,
    N≈30, features clipped to [−π,π] (separable; converges in tens of steps). Feature scale `s≈1`.
- **Fence (`qvqc`, JSON):** `{ "dataset": "blobs" }` (optional; default blobs).
- **UI:** the dataset; a **Train** button that runs ~40 GD steps (animating, or step-batched), the
  evolving decision boundary, a live loss curve, and accuracy. A Reset button (re-inits θ). Reduced
  motion: no animation, run to completion on click. `not-prose` card; header chip "VQC".
- **Tests:** `expectZ0` endianness (`|00⟩→1`, X q0 → −1); parameter-shift matches a finite-diff
  gradient on a known circuit (≈ to 1e-4); training reduces MSE loss over 30 steps on the blobs
  (final loss < initial); `vqcOutput ∈ [−1+bias, 1+bias]` range sanity.

### 4. `qbarren` — barren plateaus (medium-high)

- **Module `barren.ts`:**
  - Ansatz: init `RY(π/4)` on every qubit (McClean expressivity seed); then `L` layers of
    `[RY(θ_q) on every qubit] + [CZ ring: CZ(q, (q+1) mod n) for all q]`. (CZ is diagonal: negate
    amplitudes where both bits are 1.)
  - Costs (both diagonal in Z): `global = ⟨Z⊗…⊗Z⟩` (eigenvalue = product of ±1 per qubit);
    `local = ⟨Z₀⟩`.
  - `gradSample(n, L, cost, rng)` — random `θ ~ U(0,2π)`; parameter-shift gradient `0.5·(C(θ_p+π/2)
    − C(θ_p−π/2))` of ONE fixed probed param (qubit 0, layer 0 — must be in q0's causal cone for
    the local curve, else structural zero).
  - `gradientVariance(n, L, cost, samples): number` — variance over `samples` random θ.
- **Fence (`qbarren`, JSON):** `{ "qubits": [2,8], "depth": 2, "samples": 400 }` (defaults).
- **UI:** a log-scale plot of `Var(∂C/∂θ)` vs n (n=2..8) with **two curves: global (steep,
  ~2^-n) and local (≈flat at shallow depth)** — the dramatic contrast; a **depth slider** with a
  callout that increasing depth makes even the local cost plateau (Cerezo 2021); ~400 samples per n.
  `not-prose` card; SVG plot `role="img"`+aria-label; header chip "Barren plateaus".
- **Tests:** at L=2, `gradientVariance(global)` decreases markedly from n=2 to n=6 (assert the n=6
  variance is a small fraction of n=2's); local variance stays within a small band across n at L=2
  (assert it does NOT collapse like global); the probed local param is in q0's cone (variance > a
  floor, not a structural zero); use a seeded rng for determinism.

### Integration & data flow

`pre()` in `markdown-renderer.tsx` routes `qencode`/`qkernel`/`qvqc`/`qbarren` to the new
components (alongside the 16 existing fences); each parses its JSON, computes locally, renders.
`markdown-renderer.fence-routing.test.tsx` gains four cases.

---

## Testing Strategy

- Per widget: pure-logic unit tests (node) with the verified pinned/qualitative checks above;
  component render tests (jsdom, `matchMedia` polyfilled where reduced-motion is read); four routing
  cases.
- Content: `npm run build` renders the reflowed GUIDE (no KaTeX/parse errors, every fence mounts);
  `npm run lint` clean (rules-of-hooks); manual dev pass per widget.
- Regression: full `npm test` green (current 308 + new); `make test` (Python) unaffected.
- Update `CLAUDE.md` web test count.

## Risks & Mitigations

- **Heaviest module; the ML behaviors are subtle** → already de-risked by the verification workflow.
  Build simplest-first (qencode, qkernel, then qbarren, then qvqc). Caps keep all sims tiny.
- **qvqc training cost in-browser** → 2 qubits, 9 params, ~30 points, ~40 steps; param-shift is
  9·2·30·40 ≈ 22k tiny 2-qubit sims — fast. Run on click, not on mount.
- **qbarren effect can vanish** if the ansatz isn't expressive or depth is wrong → use the McClean
  seed + L≥2 + the global-vs-local contrast at fixed shallow depth, exactly as verified.
- **Sign/convention bugs** → conventions pinned above; angle-kernel closed form and `expectZ0`
  endianness are unit-tested as guards.
- **rules-of-hooks / nbstripout** → hooks before early return; stage explicit paths, never `git add -A`.

## Build Sequence

1. `qencode` + `encoding.ts` (foundational; reused by qkernel).
2. `qkernel` + `kernel.ts` (kernel matrix + boundary).
3. `qbarren` + `barren.ts` (variance vs n).
4. `qvqc` + `vqc.ts` (training loop; highest build).
5. Renderer routing tests for the four fences.
6. GUIDE reflow to the narrative arc, embedding the widgets; preserve notebook list + references.
7. Verify (full suite, lint, build, manual pass); ship the PR.
