# Linear Algebra Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `00-linear-algebra`, a new first curriculum section that teaches linear algebra from zero and hands the learner to `00-prereqs`.

**Architecture:** Four browser-runnable NumPy notebooks carrying 36 exercises, backed by one new shared library module for unbounded practice drills, a lesson GUIDE in English and Spanish, and the platform wiring that registers a section. The section is inserted first in the enumeration, so no existing slug, URL, or saved learner progress changes.

**Tech Stack:** Python 3 + NumPy + nbformat; pytest with the existing exercise harness; Next.js/TypeScript for the catalog; CloudFormation-free (no AWS work in this plan).

**Spec:** `docs/superpowers/specs/2026-09-07-linear-algebra-module-design.md`

## Status — 2026-09-07

**Tasks 1 through 9 are complete and committed** on `feat/linear-algebra-module`.

| Gate | Result |
|---|---|
| Python suite (`pytest tests/`) | 924 passed |
| Exercise harness, the four new notebooks | 12 passed (structure, solved, unsolved) |
| Web suite | 228 suites, 2767 tests passed |
| Analytics Lambda | 87 passed |
| Drill generator | 110 passed |
| `make guards`, ruff, ESLint | clean |
| Static build | succeeds, `/learn/00-linear-algebra` renders, no KaTeX errors |

Two things remain, both from Task 10 and neither blocking:

1. **Run the four notebooks in the deployed browser lab after merge.** Green tests
   are not proof the lesson works; this is.
2. **Open the PR.**

The two post-merge deploys named at the end of this plan are still blocked on the
AWS Lambda outage.

---

## Global Constraints

- Every notebook imports **numpy only**. No braket, boto3, qiskit, cirq, pennylane, openfermion, pyscf. No `.state_vector()`, `.probability()`, `.expectation()`, `.amplitude()`, `.density_matrix()`, `.add_result_type()`.
- Every matrix in the module has **small integer entries**. No complex numbers; those belong to `00-prereqs`.
- **Exercise unit is exactly three cells**: prompt markdown (`### Exercise N — title`, two `<details>` blocks whose summaries contain `Hint 1` and `Hint 2`, blank lines inside each), scaffold code (first line `# Exercise N: …`, then `# Define: …`, then `# TODO: your code here`, nothing else), check code (first line `# Check Exercise N …`, contains `from lib.grading import check` and `with check("Exercise N"):`). The check must be the next **code** cell after its scaffold.
- **Fresh names**: every name a check inspects is undefined everywhere else in the notebook. Teaching cells use `A`, `B`, `M`, `v`, so checks never inspect those.
- **Unsolved must fail**: every reference to a learner-defined name sits inside the `with check(...)` block. The string `" correct."` appears nowhere in any notebook.
- **Checks assert shape first** with `np.asarray(x).shape == (...)`, then values with `np.allclose` recomputed from the notebook's own givens. Assert messages guide and are **factually true** of the actual matrices.
- **Currency trap**: a `$` followed by a bare number then a space fails `tests/test_pricing_prose.py`. Write `$2x + 3y = 8$`, never `$2 x + 3 y = 8$`. No bare dollar amounts anywhere.
- Cell 0 is markdown ending with `<!-- browser-runnable -->` as its last line; cell 1 is imports only.
- Fence ids are prefixed `linalg-`, unique, and **byte-identical** between `GUIDE.md` and `GUIDE.es.md`.
- No emoji anywhere.

## Settled content decisions

These resolve contradictions the draft review surfaced. They are the authority; where a draft disagrees, the draft is wrong.

1. **The five transpose properties are the source table's five**: `(A^T)^T = A`, `(cA)^T = cA^T`, `(AB)^T = B^T A^T`, `(A+B)^T = A^T + B^T`, and `A^T = A` as the definition of **symmetric**. `(A-B)^T = A^T - B^T` may appear as a corollary but is never counted among the five.
2. **Always-symmetric constructions are `A + A.T` and `A @ A.T`** — integer arithmetic, no division. The average `(M + M.T) / 2` is mentioned once as the normalized variant.
3. **Antisymmetric matrices are out of scope.** The GUIDE roadmap row must not promise them.
4. **Inverses, determinants and eigenvalues are future additions to this module**, never "the next part of this section".

## File structure

| File | Responsibility |
|---|---|
| `lib/linalg_drills.py` | Seeded, deterministic practice-problem generator. Stdlib + numpy only; staged verbatim into the browser lab. **Already written; 110 tests pass.** |
| `tests/test_linalg_drills.py` | Unit tests for the generator. **Already written and green.** |
| `00-linear-algebra/GUIDE.md` / `GUIDE.es.md` | The lesson page in both locales. **Drafted; needs the corrections in Task 6.** |
| `00-linear-algebra/notebooks/0{1..4}-*.ipynb` | The four teaching notebooks, 36 exercises total. |
| `tests/solutions/00-linear-algebra/0{1..4}-*.py` | One canonical-answer file per notebook. |
| `tests/test_linear_algebra.py` | Presence test mirroring `tests/test_prereqs.py`. |

---

### Task 1: Land the drill generator

**Files:** `lib/linalg_drills.py`, `tests/test_linalg_drills.py`

**Interfaces produced:** `drill(kind, level=1, seed=None)` returning an object with `show()`, `check(answer) -> bool`, `reveal()`. Kinds: `add`, `subtract`, `scale`, `multiply`, `matvec`, `transpose`, `submatrix`, `defined`. Levels 1-3.

- [x] **Step 1: Run the suite**

```bash
.venv/bin/python -m pytest tests/test_linalg_drills.py -q
```

Expected: 110 passed.

- [x] **Step 2: Lint**

```bash
.venv/bin/python -m ruff check lib/linalg_drills.py tests/test_linalg_drills.py
.venv/bin/python -m ruff format --check lib/linalg_drills.py tests/test_linalg_drills.py
```

Expected: clean, already formatted.

- [x] **Step 3: Commit**

```bash
git add lib/linalg_drills.py tests/test_linalg_drills.py
git commit -m "feat(linalg): add the seeded practice-drill generator"
```

---

### Tasks 2-5: The four notebooks

One task per notebook, each identical in shape. Build with `nbformat`, never raw JSON.

**Per-notebook steps:**

- [x] **Step 1: Write the notebook and its solutions file** from the reviewed draft, applying every fix listed for it below.
- [x] **Step 2: Structure gate**

```bash
.venv/bin/python -m pytest tests/test_exercise_checks.py -q -k "structure and <stem>"
```

Expected: PASS. This checks the three-cell unit, the hint tiers, and that `SOLUTIONS` keys match the scaffolds.

- [x] **Step 3: Solved gate** — every canonical answer must satisfy its check under strict grading.

```bash
.venv/bin/python -m pytest tests/test_exercise_checks.py -q -k "canonical and <stem>"
```

- [x] **Step 4: Unsolved gate** — no check may pass, and the notebook must still execute cleanly.

```bash
.venv/bin/python -m pytest tests/test_exercise_checks.py -q -k "unsolved and <stem>"
```

- [x] **Step 5: Commit.**

**Task 2 — `01-linear-equations.ipynb`, 6 exercises.** Fixes required by review:
- The proportionality claim is **false as written**. `4x + 5` and `y = 4 - 2x` are linear but not proportional. State the rule as "every unknown appears alone, to the first power" and confine doubling to the homogeneous example.
- The drill cell's commented answer `[11, 1]` is wrong: `drill("matvec", level=1, seed=7)` yields `A = [[5, 3], [4, 5]]`, `v = [3, 4]`, so the product is `[27, 32]`. Recompute or drop the commented answer.
- Level 2 draws 2x2 **or** 3x3, so the prose claiming it "brings in a third equation" is wrong roughly 38% of the time. Describe it as "larger and signed".
- Exercise 5's Hint 2 calls the reduced pair "an Exercise 3 problem"; no coefficient pair is equal and opposite there, so straight addition does not work. Rewrite the hint to say the pair must be scaled first.

**Task 3 — `02-matrices-add-subtract.ipynb`, 8 exercises.** Fixes required by review:
- **Fresh-names violation, CI-fatal**: Exercise 8 reuses `A`, `B`, `C`, all bound by teaching cells. Rename to exercise-scoped names.
- The claim that mismatched grids always raise is **false**: `np.zeros((1,5)) + np.zeros((5,1))` broadcasts to `(5, 5)`. Use only genuinely incompatible pairs such as `(3,2) + (2,3)`, and say that some mismatches broadcast instead of raising.
- The one-based to zero-based bullet says `A[i, j]`; the correct counterpart of `a_ij` is `A[i-1, j-1]`, as the notebook's own cheat sheet states.
- The identity matrix belongs to notebook 03 per the GUIDE roadmap; fix the forward reference.
- The quantum closer cites Exercise 4 as addition; Exercise 4 is subtraction.
- The drill seed makes an all-zero guess report every entry as its own value, handing over the answer. Pick a seed whose entries are not trivially recoverable.
- **The solutions file is missing entirely.** Without it `test_structure` fails at once.

**Task 4 — `03-matrix-multiplication.ipynb`, 12 exercises.** Fixes required by review:
- Three assert messages describe matrix features that do not exist: Exercise 5 names a zero in the bottom row of `P = [[2, 0], [1, 3]]` (there is none), Exercise 6 calls a zero **entry** a zero **column**, and Exercise 9 claims a bottom-right sum has every term nonzero when one term is zero. Rewrite all three to be true of the actual matrices.
- Exercise 10's check hardcodes the full answer key in the cell the learner reads. Recompute the expected shapes from the notebook's givens instead.
- The drill seed 11 yields `A = [[0, 0], [4, 2]]` with a zero first row and a vector whose entries are equal, so it demonstrates nothing. Choose a non-degenerate seed.

**Task 5 — `04-transpose-submatrix-properties.ipynb`, 10 exercises.** Fixes required by review:
- Apply settled decisions 1 through 4 above; the draft contradicts all four.
- Exercise 10 is the only check with no shape assert, so a wrong-shaped answer raises `ValueError` instead of reporting "not yet". Add the shape assert.
- Exercise 9's canonical answer reuses the exact three matrices from a teaching cell four cells earlier, so it asks for recall rather than work. Use different matrices.

---

### Task 6: Correct and land the GUIDE in both locales

**Files:** `00-linear-algebra/GUIDE.md`, `00-linear-algebra/GUIDE.es.md`

- [x] **Step 1: Apply the corrections.** Settled decisions 1 through 3 (the five properties, the symmetric construction, drop antisymmetric). Soften the claim that `A @ B` and `A * B` always differ, since they coincide for the identity. Fix the two Spanish points: `es como miras` reads as a word-for-word mapping, and the same predicate takes feminine agreement in one card and masculine in another. Apply each change to **both** files.
- [x] **Step 2: Verify fence and id parity**

```bash
grep -c '"id"' 00-linear-algebra/GUIDE.md 00-linear-algebra/GUIDE.es.md
diff <(grep -o '"id":"[^"]*"' 00-linear-algebra/GUIDE.md) <(grep -o '"id":"[^"]*"' 00-linear-algebra/GUIDE.es.md)
grep -c '^```' 00-linear-algebra/GUIDE.md 00-linear-algebra/GUIDE.es.md
```

Expected: identical counts, and an empty diff.

- [x] **Step 3: Parse every fence body**

```bash
.venv/bin/python - <<'PY'
import json, re, pathlib
for f in ["00-linear-algebra/GUIDE.md", "00-linear-algebra/GUIDE.es.md"]:
    t = pathlib.Path(f).read_text()
    for tok in ("qcard", "quiz"):
        for m in re.finditer(r"^```" + tok + r"\n(.*?)\n```", t, re.S | re.M):
            json.loads(m.group(1))
    print(f, "fences parse")
PY
```

- [x] **Step 4: Commit.**

---

### Task 7: Register the section

**Files:** `scripts/validate_runnable.py`, `web/src/lib/content-manifest.json`, `tests/test_linear_algebra.py`

This is the edit that makes the browser-runnable marker, the manifest, the lab staging and the runnable-fence test see the section at all. Omitting it fails silently.

- [x] **Step 1:** Insert `"00-linear-algebra"` as the **first** entry of `SECTION_DIRS`.
- [x] **Step 2:** Regenerate the manifest. Never hand-edit it.

```bash
.venv/bin/python scripts/validate_runnable.py --write-manifest
```

- [x] **Step 3:** Add `tests/test_linear_algebra.py` mirroring `tests/test_prereqs.py`: the GUIDE exists, all four notebooks parse, each carries at least one check cell, and the notebook count is four.
- [x] **Step 4: Gates**

```bash
.venv/bin/python -m pytest tests/test_content_manifest.py tests/test_notebook_contract.py \
  tests/test_guide_runnable_fences.py tests/test_notebook_links.py \
  tests/test_pricing_prose.py tests/test_linear_algebra.py -q
```

- [x] **Step 5: Commit.**

---

### Task 8: Web catalog, i18n and glossary

**Files:** `web/src/lib/glossary.ts`, `web/src/lib/sections.ts`, `web/src/lib/section-pitch.ts`, `web/src/lib/workspace.ts`, `web/src/lib/changelog.ts`, `web/src/lib/changelog-es.ts`, `web/src/components/runbook-dashboard.tsx`, `web/src/i18n/locales/en.ts`, `web/src/i18n/locales/es.ts`

- [x] **Step 1:** Add the slug to the `SectionSlug` union and `SECTION_SHORT_LABEL` (`"Linear Algebra"`). This is a compile-time requirement, not just a test.
- [x] **Step 2:** Add the eleven glossary terms this section owns: linear equation, matrix, shape, entry, identity matrix, zero matrix, scalar multiplication, matrix multiplication, transpose, symmetric matrix, submatrix. Do not re-home any existing prereqs term.
- [x] **Step 3:** English and Spanish locales: section title and summary, gate pitch, glossary short label. Spanish title `Álgebra Lineal: Las Matemáticas Detrás de la Computación Cuántica`, short label `Álgebra Lineal`. Fix the tutor sample string whose hand-written index shifts from 03 to 04.
- [x] **Step 4:** `section-pitch.ts` gains the English fallback pitch.
- [x] **Step 5: Hue.** Prepend one new hue to `sectionHue`, leaving the existing six at their current positions so no existing section changes color. **Measure, do not guess** — the contrast test reads the array and evaluates real colors:

```bash
cd web && npx jest token-contrast -t "inline-code chip"
```

Try 330 first, then 120; keep the first that passes in both themes.

- [x] **Step 6:** Derive the start link from the first manifest section in `workspace.ts` and `runbook-dashboard.tsx` instead of hardcoding `/learn/00-prereqs`, and make the CTA copy section-neutral in both locales.
- [x] **Step 7:** Add the changelog entry in both locales, id `2026-09-07-linear-algebra`, kind `new`, href `/learn/00-linear-algebra`.
- [x] **Step 8: Update the pinned tests.** Section count 7 becomes 8; first slug becomes the new one; `03-algorithms` moves to index 4; sidebar link order, last link and the progress bar's `aria-valuemax` pin; the workspace runnable-notebook total rises by four; previous/next gains a neighbour; the glossary test's "7 slugs" wording.

```bash
cd web && npm test
```

- [x] **Step 9: Commit.**

---

### Task 9: Analytics, changelog guard and prose

**Files:** `lambda/analytics/curriculum.mjs`, `lambda/analytics/curriculum.test.mjs`, `scripts/changelog/rules.mjs`, `README.md`, `PRODUCT.md`, `CLAUDE.md`, `docs/exercise-convention.md`, `00-prereqs/GUIDE.md`

- [x] **Step 1:** Analytics: insert the slug first in `SECTION_SLUGS` and add all four notebook stems to `NOTEBOOKS`. Without this, page views on the new lesson are dropped and the furthest-section measure is wrong. Update its test pin.

```bash
cd lambda/analytics && npm test
```

- [x] **Step 2:** Add the directory to `LEARNER_VISIBLE` in the changelog rules and fix the "seven curriculum directories" comment. This guard **fails open**: without the entry a future PR touching only this module merges unannounced.
- [x] **Step 3:** Prose: README, PRODUCT.md and CLAUDE.md each say "seven sections" and give notebook counts. Eight sections; four more notebooks, all browser-runnable. README line 118 must name both on-ramp modules.
- [x] **Step 4:** Widen `docs/exercise-convention.md` so the visible solutions cell covers both on-ramp sections.
- [x] **Step 5:** Add the cross-link in `00-prereqs/GUIDE.md` pointing down to this module for anyone who finds `A @ B` unfamiliar.
- [x] **Step 6: Commit.**

---

### Task 10: Full verification

- [x] **Step 1: The whole Python suite**

```bash
make test
```

- [x] **Step 2: Lint and drift guards**

```bash
make lint
make guards PYTHON=.venv/bin/python
```

`PYTHON` defaults to `python3`, which on this machine is an unrelated interpreter.

- [x] **Step 3: Web suite and build**

```bash
cd web && npm test && npm run lint && npm run build
```

- [ ] **Step 4: Hand checks CI cannot do.** Work at least one hand-computed answer per notebook on paper, independently of the solutions file: a wrong canonical answer and a matching wrong check agree with each other and pass. Load the built lesson page in both themes and both languages and confirm the flashcards, runnable fences and quiz render, and that the new hue sits well beside the existing six.
- [ ] **Step 5: Open the PR.**

## Verification

The module is done when `make test`, `make lint`, the web suite, the web build and the analytics Lambda tests are all green, **and** the four notebooks have been run end to end in the deployed browser lab after merge. Green tests are not proof the lesson works; the lab run is.

Two deploys follow the merge and are **not** part of this plan: the analytics Lambda, and the tutor corpus rebuild. Both are blocked on the current AWS Lambda outage.
