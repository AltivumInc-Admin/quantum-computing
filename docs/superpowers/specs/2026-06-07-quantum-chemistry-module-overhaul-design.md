# 05-quantum-chemistry Module Overhaul — Design

**Date:** 2026-06-07
**Status:** Approved (design + scope: 4 widgets + README fix)
**Module:** `05-quantum-chemistry` (web GUIDE lesson only; notebooks/scripts untouched except the new fixture generator)

## Goal

Transform `05-quantum-chemistry/GUIDE.md` from a dry, bullet-heavy reference into a
captivating, connected narrative with four numerically honest interactive widgets,
following the same pattern as the 02/03/04 overhauls.

## The Through-Line

One idea carries the whole module: **a molecule becomes a finite operator you can
minimize.** Each concept is introduced because the previous one demanded it:

fermions → qubits (Jordan-Wigner) → a concrete weighted-Pauli Hamiltonian →
symmetry collapses it → VQE minimizes it → sweep geometry to draw a chemical bond.

The reframe the math actually delivers: **H₂ in STO-3G symmetry-tapers to a single
qubit**, so VQE for a real molecule is a single-qubit (Bloch-sphere) energy
landscape — and because a 1-qubit ansatz spans the space, VQE is *exact* and the
dissociation curve comes out perfect.

## What Is Preserved

- The 8 notebooks (`01-molecular-hamiltonians` … `08-hybrid-chemistry-job`) and their
  Hands-On descriptions (kept accurate to each notebook's purpose).
- The 3 scripts (`hamiltonians.py`, `ansatz.py`, `vqe_runner.py`).
- All references: AWS docs, 6 video resources, 5 papers.
- Learning Objectives (6) and Prerequisites (3).
- The H1 `# Quantum Chemistry & Biochemistry` (so the generated manifest/title stay
  valid; manifest drift check is run regardless).

## Honesty Architecture (Keystone)

A single committed fixture is the source of truth for all data widgets so they can
never disagree:

- `scripts/gen_h2_fixture.py` — checked-in, reproducible. Uses PennyLane differentiable
  Hartree-Fock (no PySCF). For each bond length R (0.30–2.70 Å, 49 points) records:
  the 15 Jordan-Wigner coefficients (big-endian, aligned to `jwTerms`), the Z2-tapered
  single-qubit `(c0, cz, cx)`, the STO-3G FCI energy (lowest eigenvalue of the 4-qubit
  JW Hamiltonian), and the restricted Hartree-Fock energy `⟨1100|H|1100⟩`.
- `web/src/components/quantum/__fixtures__/h2_dissociation.json` — the generated data.

Verified invariants (pinned by tests): at equilibrium R=0.75 Å,
`c0 − √(cz²+cx²) = FCI = −1.137117 Ha`; `exactGround(15-term JW H) = FCI` at every R;
HF ≥ FCI at every R (variational), with the HF–FCI gap widening as the bond breaks
(the static-correlation story — RHF fails to dissociate). Everything is labeled
**"STO-3G minimal basis"** with a visible provenance note; the lesson states plainly
that minimal-basis FCI is not the experimental exact PES and that VQE lands *on* the
STO-3G-FCI curve (not below it).

## Widgets

All pure-client, static-export safe, emoji-free, following the rules-of-hooks /
SVG(`role=img`+`aria-label`) / error-card / `motion-reduce` / `tabular-nums` / token-color
conventions established by `vqc-trainer.tsx` and `qaoa-explorer.tsx`. Each gets a routing
test and a pure-math unit test.

### 1. `qjw` — Jordan-Wigner mapping (the fermion → qubit on-ramp)
Toggle the fermionic spin-orbital occupation (default HF `|1100⟩` for H₂); the widget
maps occupation → computational-basis qubit string, and for a chosen creation/annihilation
operator renders the JW image: an `X`/`Y` term dressed by a trailing `Z`-string (parity of
lower-index modes). Pure combinatorics; logic in `jw.ts`. Big-endian to match `math.ts`.

### 2. `qham` — H₂ Hamiltonian + symmetry tapering (the keystone)
Shows the H₂ electronic Hamiltonian as 15 weighted Pauli strings on 4 qubits; a
bond-length slider re-weights the coefficients from the fixture; a "taper" toggle folds
the 4-qubit operator to the symmetry-reduced single qubit `H = c0·I + cz·Z + cx·X`.
Includes a compact qubit-budget readout (4 qubits / 15 terms → 1 qubit / 3 terms, with a
one-line projection of why active-space + tapering matter for larger molecules — this
absorbs the active-space idea). "STO-3G minimal basis" badge.

### 3. `qvqe` — single-qubit VQE energy landscape
Drag θ on an RY(θ) ansatz; `E(θ) = c0 + cz·cosθ + cx·sinθ` traces a sinusoid, the energy
readout updates, the Bloch vector swings (`⟨Z⟩=cosθ`, `⟨X⟩=sinθ`), and a horizontal
**variational floor** sits exactly at the minimum `c0 − √(cz²+cx²) = E₀`. An "optimize"
button runs 1-D gradient descent to the minimum. States the floor=E₀ equality holds
*because the 1-qubit ansatz is exact for tapered H₂* — does not over-generalize.
Fence is `qvqe` (NOT `qvqc`, which already routes to the existing VQC trainer).

### 4. `qpes` — potential energy surface (the payoff)
Sweep bond length R → the dissociation curve `E₀(R) = c0(R) − √(cz(R)²+cx(R)²)` from the
fixture; overlay the real RHF and STO-3G-FCI curves; mark equilibrium (R=0.75 Å), well
depth (≈0.20 Ha), and the dissociation asymptote. VQE points land exactly on the FCI
curve (stated explicitly). Shows the HF–FCI gap (static correlation) widening as the bond
breaks. Closing widget.

## New Kernel Modules

### `web/src/components/quantum/chemistry.ts`
Reuses `math.ts` (`Complex`, `applyGate1`, `ry`, `zeroState`, complex arithmetic).
Adds:
- `PauliString` (length-n over `{I,X,Y,Z}`, big-endian), `PauliTerm`, `Hamiltonian`.
- `pauliExpectation(state, pauli)` → real `⟨ψ|P|ψ⟩`.
- `hamiltonianExpectation(state, H)` → `Σ cᵢ⟨Pᵢ⟩`.
- `energy1q(c0, cz, cx, theta)` → closed-form sinusoid.
- `pauliMatrix(pauli)` / `hamiltonianMatrix(H)` → dense via Kronecker product.
- `eighSymmetric(m)` → real-symmetric Jacobi eigensolver (ascending) for small matrices.
- `exactGround(H)` → smallest eigenpair.
- `H2Point` type + `loadH2Curve(json)` (validating loader) + `h2OneQubit(R, curve)`
  (linear interpolation of `(c0,cz,cx)` at R).
- `vqeGradientDescent` / `vqeGridSearch` over the 1-qubit ansatz (history for plotting).

### `web/src/components/quantum/jw.ts`
The Jordan-Wigner transform for `qjw`: occupation ↔ bitstring, and
`a_p` / `a_p†` → `Z`-string + `(X ∓ iY)/2` factor. ~40 lines, unit-tested against the
known H₂ term structure.

## Integration & Blast-Radius

- `markdown-renderer.tsx`: 4 new imports + 4 `pre()` branches (`language-qjw|qham|qvqe|qpes`),
  inserted after the existing `qvqc` branch.
- `markdown-renderer.fence-routing.test.tsx`: 4 new routing cases.
- `scripts/validate_runnable.py --write-manifest` re-run to confirm no manifest drift
  (H1 unchanged → expected no-op; CI `tests/test_notebook_contract.py` enforces sync).
- **README fix (in scope):** `README.md` still numbers chemistry as "04" and hybrid as
  "05" (stale from the Phase-0 renumber). Correct the flowchart + table rows to
  chemistry=05, hybrid=06. (The `06-hybrid-jobs` prereq "00 through 04" is left for the
  06 overhaul.)
- `CLAUDE.md` web test count synced after new tests land.

## Testing

- `chemistry.test.ts`: `⟨Z⟩` on RY(θ)|0⟩ = cosθ, `⟨X⟩` = sinθ, `⟨Y⟩` = 0; `energy1q`
  matches the generic Pauli path; `energy1q` min = `c0 − hypot(cz,cx)` at `θ*=atan2(−cx,−cz)`;
  `exactGround` of `c0 I + cz Z + cx X` = `c0 ± hypot`; `eighSymmetric` reconstruction
  `V diag(λ) Vᵀ ≈ M`; `vqeGradientDescent` energy monotonically → `exactGround`; fixture
  invariant `exactGround(15-term JW H@R=0.75) ≈ FCI` and `c0−hypot ≈ FCI`; `loadH2Curve`
  validates shape + strictly-increasing R.
- `jw.test.ts`: occupation↔bitstring round-trip; JW Z-string length/placement for sample
  operators; HF state `|1100⟩` index.
- 4 routing tests.
- Full `npm test`, `npm run lint`, `npm run build` (11 pages), and `pytest` (unchanged)
  green before PR.

## Out of Scope

- No live in-browser SCF/UCCSD solver (infeasible/dishonest for static export).
- No changes to notebooks or `hamiltonians.py`/`ansatz.py`/`vqe_runner.py`.
- The `06-hybrid-jobs` overhaul (next module).
