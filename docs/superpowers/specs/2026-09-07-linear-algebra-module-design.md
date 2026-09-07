# Linear Algebra Module (`00-linear-algebra`) — Design

**Date:** 2026-09-07
**Status:** Approved design, ready for an implementation plan
**Scope:** A new first curriculum section teaching linear algebra from zero, ending
where `00-prereqs` begins. This spec covers the module's first four notebooks and the
full platform wiring. The module is explicitly expected to grow; see
[Designed to grow](#designed-to-grow).

---

## 1. Why this module exists

`00-prereqs` is described in its own GUIDE as "the on-ramp module. If you have no
quantum background, start here." It opens notebook 02 with inner products, the
conjugate transpose, unitary matrices and tensor products — every one of which
assumes the learner can already multiply two matrices by hand. A learner who cannot
has no entry point in the curriculum today.

This module is the step below the on-ramp. It assumes high-school algebra and
nothing else, teaches the mechanics of matrix arithmetic by hand, verifies every
answer with NumPy, and hands the learner to `00-prereqs` able to read
`M.conj().T` and know what it does.

**Scope boundary with `00-prereqs`.** This module owns: linear equations, matrices,
addition, subtraction, scalar multiplication, multiplication, transposition,
submatrices, and the algebraic properties of those operations. `00-prereqs` keeps:
complex numbers, inner products, the conjugate transpose, norms, unitarity, tensor
products, Dirac notation, probability, and the Bloch sphere. Nothing moves between
them; no `00-prereqs` notebook is edited except for one cross-link (see §7.5).

---

## 2. Decisions settled during design

| # | Decision | Resolution |
|---|---|---|
| 1 | Placement | **New section, first.** Directory `00-linear-algebra`, inserted ahead of `00-prereqs`. No existing slug, URL, or saved learner progress changes. |
| 2 | Practice style | **Both.** Hand-computed exercises whose answers NumPy verifies, then one "now let NumPy do it" exercise closing each notebook. |
| 3 | Quantum content | **A closer per notebook.** Pure math in the body; one short "where this shows up in quantum" section at the end, requiring no quantum knowledge. |
| 4 | Web widgets | **Existing widgets only** (`qcard`, `quiz`, `runnable`). A dedicated matrix-drill widget is queued as its own spec; see §11. |
| 5 | Spanish | **Full parity from day one:** `GUIDE.es.md`, plus `es` title, summary, pitch, glossary label, and changelog entry. |
| 6 | Notebook split | **Four notebooks**, one per group in the source outline. |
| 7 | Section hue | **Prepend a new hue**, keeping the six existing hues at their current positions, so every existing section keeps its color identity. |
| 8 | Start target | **Derive from the first section.** The workspace start valve and the empty runbook dashboard stop hardcoding `00-prereqs`; button copy becomes section-neutral. |
| 9 | Title | `# Linear Algebra: The Math Behind Quantum Computing`. The text before the colon is engraved on the home dial, so the dial reads "Linear Algebra". |
| 10 | Displayed numbers | **Accept the shift.** `00-prereqs` displays as `01` while its URL stays `/learn/00-prereqs`; the badge is enumeration position, not the slug. |

---

## 3. Content architecture

### 3.1 Shape shared by all four notebooks

Every notebook follows the `00-prereqs` rhythm — **Plain English → Code → Notation →
Self-check** — and ships browser-runnable (marker in the first markdown cell), with
`numpy` as its only import. That keeps the whole module reachable from the in-browser
lab with no install, no AWS account, and no quantum SDK.

Cell layout, in order:

1. **Title cell** (markdown): H1, one paragraph of motivation, `**Objectives:**`
   bullets, `**Reference:** See [../GUIDE.md](../GUIDE.md).`, then the
   browser-runnable marker as the final line.
2. **Import cell**: `import numpy as np` and print options only.
3. **Teaching cells**: alternating markdown and code, in the four-beat rhythm.
4. **Drill cell**: one cell wiring up the practice generator (§4).
5. **Exercises**: the three-cell unit from `docs/exercise-convention.md`, repeated.
6. **Solutions cell**: the visible worked-answers cell that both on-ramp sections
   carry, below every check cell.
7. **Where this shows up in quantum**: markdown, no quantum prerequisites.
8. **Summary**: what was learned, what comes next.

**Two exercise styles.** *Hand exercises* fix the operands in the notebook, ask the
learner to type the result as a literal, and check by recomputing from those operands
with NumPy — the learner's arithmetic is graded, not their typing of a NumPy call.
*NumPy exercises* close each notebook and ask for the call itself, checking shape and
values. Every check asserts shape before values, so a wrong-shape answer gets
"not yet" guidance instead of a broadcasting error.

**Notation discipline.** Mathematics is written one-based (`a_ij`, row index first);
NumPy is zero-based. Every notebook names that mismatch explicitly the first time an
index appears, and the drill printer labels rows and columns one-based to match the
paper work.

### 3.2 Notebook 01 — `01-linear-equations.ipynb` (6 exercises)

**Arc.** What makes an equation linear, with examples and non-examples (`x²`, `xy`,
`sin x` are out). One unknown, then two unknowns by substitution and by elimination,
then three by elimination. The three possible outcomes — exactly one solution, none,
infinitely many — shown geometrically as two lines that cross, run parallel, or lie
on top of each other. The reveal that closes the notebook: strip the unknowns away
and the coefficients form a grid, which is the object the next three notebooks are
about. Checking a solution means substituting it back, which is quietly the
row-times-column product of notebook 03.

**Exercises.** Classify linear vs non-linear; solve a two-unknown system by
substitution; solve one by elimination; identify a system with no solution and one
with infinitely many; solve a three-unknown system; then the NumPy closer —
assemble a coefficient grid and a right-hand-side column and verify a solution by
substitution.

**Checks.** Solution checks substitute the learner's values back into the original
equations rather than comparing against a stored answer, so any correct method
passes. The classification exercise checks a list of booleans or labels.

**Quantum closer.** A qubit's two probabilities must sum to 1. That is a linear
constraint, and every measurement statistic the curriculum later computes is a
linear expression in those amplitudes' squared magnitudes.

### 3.3 Notebook 02 — `02-matrices-add-subtract.ipynb` (8 exercises)

**Arc.** A matrix is a grid with a shape. Anatomy: rows before columns, the entry
`a_ij`, square vs rectangular, the row vector as 1×n and the column vector as n×1,
the zero matrix, the identity previewed by name, and what equality of two matrices
means. Addition and subtraction entry by entry, and the same-shape rule that governs
both. Scalar multiplication, which the properties in notebook 04 need. In NumPy:
`np.array`, `.shape`, `A[i, j]`, and a deliberate shape-mismatch `ValueError`
triggered on purpose so the learner recognizes it later.

**Exercises.** Read shapes and named entries off a printed matrix; add two 2×2
matrices by hand; add two 2×3 matrices by hand; subtract two 3×3 matrices by hand;
compute a scalar multiple by hand; fill in a compatibility table saying which of
several pairs can be added; build the zero and identity matrices of a given size;
then the NumPy closer — compute `A + B - 2C` with NumPy and confirm it matches the
hand result.

**Quantum closer.** A single-qubit state is a 2×1 column of numbers. The plus sign
in a superposition is exactly the addition just learned, and scaling a state by a
number is the scalar multiplication just learned.

### 3.4 Notebook 03 — `03-matrix-multiplication.ipynb` (12 exercises)

The heaviest notebook, matching "a lot of practice multiplying matrices" in the
source outline.

**Arc.** Matrix times column vector first, because it is one dot product per row and
because it is the shape every quantum gate application takes. Worked examples: the
identity leaves a vector alone; the swap matrix exchanges its entries. Then matrix
times matrix, taught as "each column of the result is A times the corresponding
column of B", with every dot product written out longhand for one 2×2 case before
any shortcut. The shape rule — (m×n)(n×p) gives m×p, and the inner dimensions must
match — with rectangular examples whose two orders give different result shapes.
Then the properties that will be reused: multiplication is associative and
distributive but **not** commutative, the identity is the multiplicative 1, and a
zero matrix annihilates. In NumPy: `@` versus `*` as the central trap, plus the 1-D
versus 2-D vector distinction that silently changes what `@` returns.

**Exercises.** Three matrix-times-vector products by hand (identity, swap, general);
three 2×2 by 2×2 products by hand; a 3×3 by 3×1; a 3×3 by 3×3; both orders of a
rectangular pair, giving different shapes; a which-products-are-defined table over
several shape pairs; `AB` and `BA` for a pair where they differ, plus a statement of
what that shows; then the NumPy closer — verify every hand result, and check
associativity on a random triple with `np.allclose`.

**Quantum closer.** A quantum gate is a matrix; applying it to a state is exactly
this product. `X` is the swap matrix from the first worked example, and it turns
`|0>` into `|1>`. Two gates applied in sequence is a matrix product, and because
matrix multiplication does not commute, the order in which gates are applied changes
the physics.

### 3.5 Notebook 04 — `04-transpose-submatrix-properties.ipynb` (10 exercises)

**Arc.** Transposition as a flip across the main diagonal: 2×2, then 2×3 (where the
shape changes), then a column becoming a row. Each of the five properties from the
source table — `(Aᵀ)ᵀ = A`, `(cA)ᵀ = cAᵀ`, `(AB)ᵀ = BᵀAᵀ`, `(A+B)ᵀ = Aᵀ+Bᵀ`, and
`Aᵀ = A` as the definition of symmetric — is stated in words, verified by hand on a
small case, then verified by NumPy. The reversal in the product rule gets its own
worked counterexample showing that `AᵀBᵀ` is generally something else. Symmetric
matrices, including the two constructions that are always symmetric: `A + Aᵀ` and
`A Aᵀ`. Submatrices two ways: by deleting a row and a column (the classical minor,
one-based), and by slicing a block in NumPy (zero-based, half-open) — the two
conventions named against each other on purpose. Finally the arithmetic laws that
hold, and two that famously fail: `AB = AC` does not imply `B = C`, and `AB = 0` does
not imply that `A` or `B` is zero, each with an explicit counterexample.

**Exercises.** Transpose a 2×3 by hand; transpose a column vector; verify the
product rule by hand on a 2×2 pair; verify the sum rule by hand; classify a set of
matrices as symmetric or not; build a symmetric matrix from a given one; extract a
submatrix by deleting a specified row and column; extract a block by slicing;
produce a counterexample to a stated false law; then the NumPy closer — a property
suite that checks all five transpose properties on random matrices with
`np.allclose`.

**Quantum closer.** The dagger `†` in `M.conj().T` is this transpose plus a
conjugation of the imaginary parts, and `00-prereqs` picks it up exactly there. The
order reversal in `(AB)ᵀ = BᵀAᵀ` is why undoing a sequence of gates runs the
sequence backwards. Symmetric is the real-number cousin of Hermitian. And the 4×4
matrix of CNOT has the `X` gate sitting in its lower-right block, which is a
submatrix.

---

## 4. The drill generator — `lib/linalg_drills.py`

"A lot of practice" cannot mean a fixed number of exercises. Each notebook gets a
practice cell backed by one new module in the shared library, which the browser lab
already stages verbatim, so drills work identically in JupyterLite and locally.

**API.**

```python
from lib.linalg_drills import drill

d = drill("multiply", level=2, seed=7)   # deterministic from the seed
d.show()                                  # pretty-prints the problem for paper work
d.check(my_answer)                        # per-entry feedback; returns a bool
d.reveal()                                # the worked answer, shown only on request
```

- `kind` is one of `"add"`, `"subtract"`, `"scale"`, `"multiply"`, `"matvec"`,
  `"transpose"`, `"submatrix"`, or `"defined"` (a shape-compatibility question).
- `level` runs 1 to 3: small non-negative 2×2 entries, then negatives and 3×3, then
  rectangular shapes including deliberately undefined products.
- `seed` is optional; omitted, the module draws one and prints it, so a learner can
  always reproduce a problem they got wrong.
- `check` reports which entries are wrong and by how many, never the correct values;
  `reveal` is the only path to the answer.
- Entries are small integers, so paper arithmetic stays the point.

**Constraints.** Standard library plus NumPy only (the lab's Pyodide closure carries
`numpy` and `matplotlib` and nothing else). No dependency on `lib.grading`; drills
are practice, not graded exercises. Its own unit test file, `tests/test_linalg_drills.py`,
covers determinism under a fixed seed, correct answers for each kind, the undefined
case, per-entry feedback, and level shape ranges.

---

## 5. The web lesson (`00-linear-algebra/GUIDE.md`)

Rendered at `/learn/00-linear-algebra`. Structure follows the `00-prereqs` skeleton
exactly, because the platform derives titles, summaries, tables of contents and
metadata from it:

1. `# Linear Algebra: The Math Behind Quantum Computing`
2. Intro paragraph immediately after the H1 — this becomes the catalog card summary
   (first 300 characters) and the page meta description, so it must read as a
   standalone description of the module.
3. `## Learning Objectives`
4. `## Prerequisites` — high-school algebra, and explicitly no AWS, no quantum SDK,
   no calculus.
5. `## Who should skip this module` — if `A @ B`, "transpose", and "shape mismatch"
   are all familiar, go straight to Prerequisites.
6. `## Setup` — the same 90-second, no-AWS install as `00-prereqs`.
7. `## Concepts`, with `### 1.` through `### 4.` mirroring the four notebooks. Each
   carries worked examples in KaTeX, `qcard` flashcards, and at least one live
   `runnable` NumPy fence.
8. `## Hands-On Exercises` — the numbered notebook list in the house row format.
9. `## Self-Assessment`
10. `## References`
11. `## Check yourself` — one `quiz` fence, five questions.

**Widget budget.** Roughly 10 to 12 `qcard` flashcards spread across the four
concept sections (definitions, the shape rule, `@` versus `*`, each transpose
property, symmetric, submatrix), and 4 to 6 `runnable` fences: `@` versus `*` side
by side, a deliberate shape-mismatch error, a matrix-times-vector application, the
five transpose properties verified at once, and a symmetric-matrix construction.
No graded circuit widgets — nothing in this module is a circuit, and those widget
kinds are graded by circuit and pricing kernels that have nothing to say here.

**Fence ids.** Every id in this section is prefixed `linalg-`, kebab-case. Ids are
permanent per-learner storage keys for the review queue, so they are never renamed
or reused after merge, and they must appear byte-identically in `GUIDE.es.md`.

**Two authoring traps, both real.** Text inside a flashcard or quiz field renders
only backtick code spans, so matrices are written there as NumPy literals rather
than as KaTeX. And the prose guard reads a `$` followed by a bare number and a space
as a currency figure, so `$2 x + 3 y = 8$` trips it while `$2x + 3y = 8$` does not.

---

## 6. Spanish parity

`GUIDE.es.md` ships with the module: the same headings in the same order, the same
fence tokens in the same positions, byte-identical fence ids, and untranslated
notebook filenames. Alongside it: the `es` section title and summary, the `es` gate
pitch, the `es` glossary short label ("Álgebra Lineal"), and the `es` changelog
entry. Notebooks stay English, matching every other section.

Note for whoever implements it: the platform silently serves the English GUIDE when
the Spanish one is missing, and a malformed Spanish fence ships as an error card with
CI green. Fence-id parity between the two files is therefore verified by hand — count
`"id"` occurrences in both — not by a test.

---

## 7. Platform wiring

Most of the catalog derives from the generated content manifest, so the section
appears in the home grid, the sidebar, previous/next navigation, the sitemap, search
metadata, the gate modal, and the in-browser lab with no code change at all. What
follows is everything that does need an edit. A dry run that stubbed this section in
a throwaway worktree produced exactly ten failing web tests and two failing analytics
tests; both sets are enumerated below.

### 7.1 Content and harness

- New directory `00-linear-algebra/` holding `GUIDE.md`, `GUIDE.es.md`, and
  `notebooks/` with the four notebooks.
- One canonical solutions file per notebook under `tests/solutions/00-linear-algebra/`,
  keyed by exercise number.
- `lib/linalg_drills.py` and `tests/test_linalg_drills.py`.
- Register `"00-linear-algebra"` as the **first** entry of the section list in
  `scripts/validate_runnable.py`. This is the only hand-maintained enumeration of
  sections, and it drives manifest order, the browser-runnable contract scan, the
  runnable-fence test, and lab staging. Omitting it fails silently: the notebooks
  still run under pytest while the manifest, the lab, and the web catalog never see
  the section.
- Regenerate the content manifest after the directory, GUIDE, and notebooks all
  exist, and commit it. Never hand-edit it.
- `docs/exercise-convention.md` currently says the visible solutions cell is a
  `00-prereqs` affordance; widen that to both on-ramp sections.
- Add `tests/test_linear_algebra.py`, mirroring the existing prereqs presence test:
  the GUIDE exists, every notebook parses, and each carries at least one check cell.
  Without it, nothing notices if a notebook disappears.

### 7.2 Web catalog, i18n, glossary

- Add the slug to the glossary's section type and short-label map — a compile-time
  requirement, not just a test.
- English and Spanish locales each gain a section title and summary, a gate pitch,
  and a glossary short label. One hardcoded sample string in the tutor mock names
  section `03` and shifts to `04`.
- Add the English pitch fallback in the pitch table.
- Prepend the new hue to the section hue array, leaving the existing six in place.
  A contrast test parses that array and requires every hue to clear 4.5:1 in both
  themes, which is what picks the exact value.
- Derive the workspace start valve and the empty runbook dashboard's start link from
  the first manifest section instead of the hardcoded prereqs path, and make the
  button copy section-neutral in both locales.
- Add a changelog entry in both locales announcing the new section.

### 7.3 Tests that must be updated

The dry run failed exactly these, and each failure is a pinned expectation rather
than a defect:

- Section list: length 7 becomes 8; the first slug becomes `00-linear-algebra`;
  `03-algorithms` moves from index 3 to 4.
- Manifest: same length and first-slug pins.
- Sidebar: link count, the order of the first three links, the last link, and the
  progress bar's maximum value, which was pinned to 7.
- Workspace: section count and the total runnable-notebook count.
- Previous/next navigation: the first section now has only a next link, and prereqs
  gains a previous one.
- Glossary: a test name and comment that say "the 7 curriculum slugs".
- Analytics Lambda: the section index test now expects the new slug at 0 and prereqs
  at 1.

### 7.4 Analytics, changelog guard, tutor corpus

- The analytics Lambda carries its own hardcoded section list and notebook allowlist.
  Both need the new section and all four notebook stems, or page views on the new
  lesson are dropped and the "furthest section reached" measure is wrong.
- The changelog guard's learner-visible path list needs the new directory. It fails
  open: without the entry, a future PR touching only this module merges unannounced.
- The tutor corpus is rebuilt from the GUIDEs at deploy time. Until the tutor is
  redeployed, asking it about this lesson returns its out-of-scope message.

### 7.5 Prose and cross-links

README, PRODUCT.md, and CLAUDE.md each state "seven sections" and give notebook
counts; all become eight sections with the new totals. The `00-prereqs` GUIDE gains
a pointer down to this module for anyone who finds `A @ B` unfamiliar, and notebook
04's summary hands off to `00-prereqs`.

### 7.6 Atomicity

One pull request. A manifest that lists a section whose notebooks do not exist breaks
the lab build; a section-list edit without the regenerated manifest fails the drift
check in three places. Directory, GUIDE, both locales, notebooks, solutions,
registration, regenerated manifest, glossary type, i18n, test pins, analytics
allowlist and changelog entry land together.

---

## 8. Testing and verification

**Automated, in CI.** Every exercise is executed twice by the existing harness: once
with its canonical solution injected, where every check must report correct, and once
untouched, where no check may report correct. That second run is what makes an
exercise real — a check that passes without the learner doing anything is caught. On
top of that: the browser-runnable contract scan and a full execution of every
notebook under the lab kernel, the notebook link and hygiene checks, the manifest
sync check, the runnable-fence execution test, the quiz corpus test, the locale-parity
test, the contrast test over the hue array, lint, and the new drill-module unit tests.

**By hand, before the PR is called done.** Three things CI cannot see:

1. Every hand-computed exercise answer is worked on paper independently of the
   solution file, because a wrong canonical answer and a wrong check agree with each
   other and pass.
2. The Spanish GUIDE is compared against the English one for heading order, fence
   count, and identical ids, since nothing enforces it.
3. The rendered lesson page is loaded in both themes and both languages, confirming
   the flashcards, the runnable fences and the quiz render, and that the new hue
   looks right beside the existing six.

**Explicitly not claimed.** Green tests are not proof the lesson works. The
verification that matters is running the four notebooks end to end in the deployed
in-browser lab, and loading the deployed lesson page. Both happen after merge, on the
Amplify deploy, and are listed as rollout steps rather than assumed.

---

## 9. Rollout

Merging the PR ships the notebooks, the lesson page, and the lab, because Amplify
deploys from the main branch and rebuilds the lab from the manifest. Two follow-ups
are deploys, not merges, and each needs an explicit go-ahead:

1. **Redeploy the analytics Lambda** to QL-Prod through the org-admin profile chain.
   Until then, page views on the new lesson are dropped by its allowlist.
2. **Rebuild and deploy the tutor corpus.** Until then, the lesson tutor answers
   "out of scope" on this section.

Post-deploy verification: open the new lesson on the live site, run all four
notebooks in the deployed lab, and confirm the tutor answers a question about
matrix multiplication.

---

## 10. Designed to grow

This module is a first installment. The four notebooks cover the source outline
exactly, and the structure anticipates more: notebooks are numbered with room after
04, the drill generator takes a `kind` argument rather than hardcoding four
operations, the GUIDE's concept sections are one per notebook so a fifth appends
cleanly, and the title carries no number or count that a later addition would
falsify. Determinants, inverses, eigenvalues and eigenvectors, vector spaces, and
linear independence are the natural next entries; none is in scope now.

---

## 11. Out of scope

- **The matrix-drill web widget.** An on-page grid where a learner types a product
  and gets instant per-entry feedback, the browser analogue of the notebook drill
  generator. Queued as its own spec, deliberately after this content exists so the
  drill shapes are known rather than guessed.
- **Moving any `00-prereqs` content.** Its six notebooks are pinned by a test and
  stay exactly as they are.
- **Complex numbers.** They belong to `00-prereqs`, which teaches them where the
  conjugate transpose needs them. Every matrix in this module has real integer
  entries.
- **Determinants, inverses, eigenvalues.** Future installments; see §10.
