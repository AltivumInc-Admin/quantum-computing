# Phase 0 — Renumber Curriculum 00→06 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename six curriculum directories so each prefix matches its catalog index and there is a single `00`, with every reference, test, generated artifact, and redirect updated to match.

**Architecture:** The curriculum catalog is generated from one explicit list (`SECTION_DIRS` in `scripts/validate_runnable.py`); `web/src/lib/sections.ts`, section hues, the "Run in browser" gate, and the JupyterLite staging in `build.sh` all derive from the regenerated manifest. So the rename is: move the directories, update that one list, regenerate the manifest, then fix the hand-written references (cross-links in GUIDEs, slugs in web tests, dev scripts, docs) and add Amplify console redirects. `00-prereqs` keeps its name; the other six shift up by one.

**Tech Stack:** Python (catalog/notebook scripts, pytest), Next.js 16 static export (Jest tests, `npm run build`), Bash (`build.sh`), AWS Amplify Hosting (redirects).

**Rename map (apply everywhere as full-string replacements — all six suffixes are distinct, so substitutions never collide):**

| Old | New |
|---|---|
| `00-foundations` | `01-foundations` |
| `01-hardware` | `02-hardware` |
| `02-algorithms` | `03-algorithms` |
| `03-quantum-ml` | `04-quantum-ml` |
| `04-quantum-chemistry` | `05-quantum-chemistry` |
| `05-hybrid-jobs` | `06-hybrid-jobs` |

`00-prereqs` is unchanged. **Do not** edit historical records under `docs/superpowers/plans/` or `docs/superpowers/specs/` (except today's spec, which already uses new names).

**Run all commands from the repo root** `/Users/cperez/Desktop/local/altivum-dev/quantum` unless stated. The working branch is `chore/renumber-modules-00-06` (already created).

---

### Task 1: Move directories and update the catalog source

**Files:**
- Rename (git mv): `00-foundations/`, `01-hardware/`, `02-algorithms/`, `03-quantum-ml/`, `04-quantum-chemistry/`, `05-hybrid-jobs/`
- Modify: `scripts/validate_runnable.py:46-54`
- Regenerate: `web/src/lib/content-manifest.json`, `web/src/lib/runnable-manifest.json`

- [ ] **Step 1: Move the six directories (preserves history)**

```bash
git mv 00-foundations 01-foundations
git mv 01-hardware 02-hardware
git mv 02-algorithms 03-algorithms
git mv 03-quantum-ml 04-quantum-ml
git mv 04-quantum-chemistry 05-quantum-chemistry
git mv 05-hybrid-jobs 06-hybrid-jobs
```

- [ ] **Step 2: Update `SECTION_DIRS`**

Replace the list in `scripts/validate_runnable.py` (lines 46-54) with:

```python
SECTION_DIRS = [
    "00-prereqs",
    "01-foundations",
    "02-hardware",
    "03-algorithms",
    "04-quantum-ml",
    "05-quantum-chemistry",
    "06-hybrid-jobs",
]
```

- [ ] **Step 3: Regenerate the manifests**

Run: `python scripts/validate_runnable.py --write-manifest`
Expected: exits 0; `git diff web/src/lib/content-manifest.json` shows each `slug`/`dirName` updated (e.g. `00-foundations`→`01-foundations`) with `index` values 0–6 unchanged and titles unchanged (titles come from each GUIDE's H1).

- [ ] **Step 4: Verify the scan passes**

Run: `python scripts/validate_runnable.py`
Expected: exits 0, no "section directory not found" or contract violations.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: renumber curriculum directories 00->06"
```

---

### Task 2: Fix cross-links inside the GUIDE files

**Files (post-rename paths):**
- Modify: `00-prereqs/GUIDE.md`
- Modify: `02-hardware/GUIDE.md`, `03-algorithms/GUIDE.md`, `04-quantum-ml/GUIDE.md`, `05-quantum-chemistry/GUIDE.md`, `06-hybrid-jobs/GUIDE.md`
- (`01-foundations/GUIDE.md` has no cross-links; the command below is a harmless no-op there and it is rewritten in Phase 1 regardless.)

These files contain prose references and Markdown links to sibling modules by old name (e.g. `00-prereqs/GUIDE.md` links to `../00-foundations/GUIDE.md`; `02-algorithms/GUIDE.md` says "Completed: 00-foundations, 01-hardware"; `01-hardware/GUIDE.md` references `01-hardware/scripts/...`).

- [ ] **Step 1: Apply the rename map to the GUIDE files**

```bash
for f in 00-prereqs/GUIDE.md 01-foundations/GUIDE.md 02-hardware/GUIDE.md 03-algorithms/GUIDE.md 04-quantum-ml/GUIDE.md 05-quantum-chemistry/GUIDE.md 06-hybrid-jobs/GUIDE.md; do
  perl -pi -e 's/00-foundations/01-foundations/g; s/01-hardware/02-hardware/g; s/02-algorithms/03-algorithms/g; s/03-quantum-ml/04-quantum-ml/g; s/04-quantum-chemistry/05-quantum-chemistry/g; s/05-hybrid-jobs/06-hybrid-jobs/g;' "$f"
done
```

- [ ] **Step 2: Verify no stale links remain in the GUIDEs**

Run: `grep -rn "00-foundations\|01-hardware\|02-algorithms\|03-quantum-ml\|04-quantum-chemistry\|05-hybrid-jobs" 0*-*/GUIDE.md`
Expected: no matches.

- [ ] **Step 3: Spot-check the prereqs links resolve**

Run: `grep -n "01-foundations" 00-prereqs/GUIDE.md`
Expected: the `../01-foundations/GUIDE.md` link targets and "ready for `01-foundations`" prose now appear. Confirm `../01-foundations/GUIDE.md` exists: `ls 01-foundations/GUIDE.md` → file listed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: fix module cross-links after renumber"
```

> **Blast-radius addendum (found by the Task 6 gate during execution):** cross-links also live OUTSIDE the GUIDEs — apply the same rename map to these tracked files, which the original Task 2 scope missed:
> - `00-prereqs/notebooks/06-bloch-sphere-playground.ipynb` and `01-foundations/notebooks/05-circuit-composition.ipynb` (notebook "Next section" links)
> - `06-hybrid-jobs/algorithms/qaoa_maxcut_job.py` (`source_module` string)
> - `06-hybrid-jobs/containers/Dockerfile` + `06-hybrid-jobs/containers/build_and_push.sh` (COPY / `docker build -f` paths)
> - `Makefile` (pip-compile container paths)
>
> Authoritative sweep for any tracked stale reference: `git grep -n "00-foundations\|01-hardware\|02-algorithms\|03-quantum-ml\|04-quantum-chemistry\|05-hybrid-jobs" -- ':!docs/superpowers/*'` must return empty. Validate `.ipynb` edits with `python -c "import json; json.load(open(<nb>))"`.

---

### Task 3: Update the web test suite slugs/URLs

**Files:**
- Modify: `web/__tests__/components/section-progress.test.tsx`
- Modify: `web/__tests__/components/transition-link.test.tsx`
- Modify: `web/__tests__/components/sidebar.test.tsx`
- Modify: `web/__tests__/components/notebook-link.test.tsx`
- Modify: `web/__tests__/components/prev-next.test.tsx`
- Modify: `web/__tests__/components/section-card.test.tsx`
- Modify: `web/__tests__/lib/content.test.ts`
- Modify: `web/__tests__/lib/sections.test.ts`
- Modify: `web/__tests__/lib/manifest.test.ts`
- Modify: `web/__tests__/lib/progress-store.test.ts`

These hardcode slugs/dirs/URLs (e.g. `slug="00-foundations"`, `/learn/02-algorithms`, `sections[6].slug` `05-hybrid-jobs`, the GitHub blob URL `.../00-foundations/notebooks/...`). `00-prereqs` references (e.g. `sections[0].slug` `00-prereqs`, sidebar `links[0]`) stay.

- [ ] **Step 1: Run the suite first to capture the pre-change baseline**

Run (from repo root): `cd web && npm test -- --watchAll=false; cd ..`
Expected: failures appear only after the manifest changed in Task 1 — note which test files fail so you can confirm they pass after this task.

- [ ] **Step 2: Apply the rename map to all listed test files**

```bash
cd web
for f in __tests__/components/section-progress.test.tsx __tests__/components/transition-link.test.tsx __tests__/components/sidebar.test.tsx __tests__/components/notebook-link.test.tsx __tests__/components/prev-next.test.tsx __tests__/components/section-card.test.tsx __tests__/lib/content.test.ts __tests__/lib/sections.test.ts __tests__/lib/manifest.test.ts __tests__/lib/progress-store.test.ts; do
  perl -pi -e 's/00-foundations/01-foundations/g; s/01-hardware/02-hardware/g; s/02-algorithms/03-algorithms/g; s/03-quantum-ml/04-quantum-ml/g; s/04-quantum-chemistry/05-quantum-chemistry/g; s/05-hybrid-jobs/06-hybrid-jobs/g;' "$f"
done
cd ..
```

- [ ] **Step 3: Re-check the index-based assertions still mean what they should**

Open `web/__tests__/lib/sections.test.ts` and `web/__tests__/lib/manifest.test.ts`. Confirm the substitutions produced:
- `expect(sections[0].slug).toBe("00-prereqs");` (unchanged — correct, still index 0)
- `expect(sections[6].slug).toBe("06-hybrid-jobs");` (was `05-hybrid-jobs`)
- `isNotebookRunnable("02-hardware", "01-device-discovery.ipynb")` (was `01-hardware`)

These are correct because the manifest order (indices 0–6) is unchanged by the rename; only the names moved.

- [ ] **Step 4: Run the web suite — expect green**

Run: `cd web && npm test -- --watchAll=false; cd ..`
Expected: all suites pass (the count matches the pre-change total, currently 217).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(web): update slugs/URLs after renumber"
```

---

### Task 4: Update dev/build scripts and the lab gitignore

**Files:**
- Modify: `scripts/generate_notebooks.py` (hardcoded notebook paths for all six modules)
- Modify: `web/jupyterlite-build/.gitignore` (per-section `files/<dir>/` ignore patterns)

`build.sh` derives sections from the regenerated manifest, so it needs no edit. `web/jupyterlite-build/prepare_notebooks.py` globs `files/` and hardcodes nothing — no edit.

- [ ] **Step 1: Apply the rename map to `generate_notebooks.py`**

```bash
perl -pi -e 's/00-foundations/01-foundations/g; s/01-hardware/02-hardware/g; s/02-algorithms/03-algorithms/g; s/03-quantum-ml/04-quantum-ml/g; s/04-quantum-chemistry/05-quantum-chemistry/g; s/05-hybrid-jobs/06-hybrid-jobs/g;' scripts/generate_notebooks.py
```

- [ ] **Step 2: Update the lab gitignore patterns**

Replace the per-section block in `web/jupyterlite-build/.gitignore` so the patterns are:

```gitignore
.venv/
.cache/
files/00-prereqs/
files/01-foundations/
files/02-hardware/
files/03-algorithms/
files/04-quantum-ml/
files/05-quantum-chemistry/
files/06-hybrid-jobs/
files/lib/
files/wheels/*.whl
files/overrides.json
.jupyterlite.doit.db
```

- [ ] **Step 3: Verify no old names remain in these files**

Run: `grep -n "00-foundations\|01-hardware\|02-algorithms\|03-quantum-ml\|04-quantum-chemistry\|05-hybrid-jobs" scripts/generate_notebooks.py web/jupyterlite-build/.gitignore`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: update notebook generator + lab gitignore after renumber"
```

---

### Task 5: Update top-level docs

**Files:**
- Modify: `README.md` (prose at lines ~102 and ~132; directory tree at lines ~260-265)
- Modify: `CLAUDE.md` (lines ~6, ~7, ~21)

- [ ] **Step 1: Apply the rename map to README.md and CLAUDE.md**

```bash
perl -pi -e 's/00-foundations/01-foundations/g; s/01-hardware/02-hardware/g; s/02-algorithms/03-algorithms/g; s/03-quantum-ml/04-quantum-ml/g; s/04-quantum-chemistry/05-quantum-chemistry/g; s/05-hybrid-jobs/06-hybrid-jobs/g;' README.md CLAUDE.md
```

- [ ] **Step 2: Fix the CLAUDE.md structure line to cover the real range**

In `CLAUDE.md`, the "Structure" bullet currently reads (after Step 1) `01-foundations/ through 06-hybrid-jobs/`. Change it to include the primer:

Replace `- \`01-foundations/\` through \`06-hybrid-jobs/\` — Progressive learning sections`
with `- \`00-prereqs/\` through \`06-hybrid-jobs/\` — Progressive learning sections`

- [ ] **Step 3: Add the primer row to the README directory tree (accuracy fix)**

In `README.md`, the directory tree begins at `01-foundations/`. Add a row directly above it:

```
├── 00-prereqs/              # Math, NumPy, qubit intuition — zero-to-ready primer (6)
├── 01-foundations/          # Qubits, gates, entanglement, Braket basics (5)
```

- [ ] **Step 4: Verify**

Run: `grep -n "00-foundations\|01-hardware\|02-algorithms\|03-quantum-ml\|04-quantum-chemistry\|05-hybrid-jobs" README.md CLAUDE.md`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: update README + CLAUDE module numbering"
```

---

### Task 6: Full verification

- [ ] **Step 1: Python tests**

Run: `make test`
Expected: all pass (no test references a renamed dir; `00-prereqs` tests unaffected).

- [ ] **Step 2: Catalog scan**

Run: `python scripts/validate_runnable.py`
Expected: exits 0.

- [ ] **Step 3: Web build emits the renamed pages**

Run: `cd web && npm run build; cd ..`
Expected: build succeeds; output includes `out/learn/01-foundations/`, `out/learn/02-hardware/`, `out/learn/03-algorithms/`, `out/learn/04-quantum-ml/`, `out/learn/05-quantum-chemistry/`, `out/learn/06-hybrid-jobs/`, and `out/learn/00-prereqs/`. Page count unchanged (currently 11).

```bash
ls web/out/learn
```

- [ ] **Step 4: Lab staging follows the rename (optional local check)**

Run: `cd web/jupyterlite-build && bash build.sh; cd ../..`
Expected: succeeds; `web/public/lab/files/` contains the renamed section dirs. (These are gitignored; nothing to commit.)

- [ ] **Step 5: Repo-wide stale-reference sweep (excluding historical records)**

Run:
```bash
grep -rn "00-foundations\|01-hardware\|02-algorithms\|03-quantum-ml\|04-quantum-chemistry\|05-hybrid-jobs" \
  --include='*.py' --include='*.ts' --include='*.tsx' --include='*.md' --include='*.json' --include='*.sh' --include='*.yml' \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=out --exclude-dir=.venv \
  --exclude-dir=jupyterlite-build . | grep -v "docs/superpowers/plans/2026-05" | grep -v "docs/superpowers/specs/2026-05"
```
Expected: no matches. (Hits inside `docs/superpowers/{plans,specs}/2026-05-*` are historical records and are intentionally left alone.)

- [ ] **Step 6: Lint**

Run: `cd web && npm run lint; cd ..`
Expected: clean.

---

### Task 7: Amplify Console redirects (manual deployment step — not a code change)

Amplify Hosting redirects are configured in the console, not in the repo (`customHttp.yml` is headers-only). Internal navigation derives from the manifest and already points to new slugs, so nothing inside the app breaks; these 301s only protect external/bookmarked links to the six old URLs.

- [ ] **Step 1: Add redirects in the Amplify Console**

In **Amplify Console → app `d1ao02to23x85y` → Hosting → Rewrites and redirects → Manage redirects (JSON editor)**, add these rules *above* any existing catch-all/SPA rule:

```json
[
  { "source": "/learn/00-foundations", "target": "/learn/01-foundations", "status": "301", "condition": null },
  { "source": "/learn/01-hardware", "target": "/learn/02-hardware", "status": "301", "condition": null },
  { "source": "/learn/02-algorithms", "target": "/learn/03-algorithms", "status": "301", "condition": null },
  { "source": "/learn/03-quantum-ml", "target": "/learn/04-quantum-ml", "status": "301", "condition": null },
  { "source": "/learn/04-quantum-chemistry", "target": "/learn/05-quantum-chemistry", "status": "301", "condition": null },
  { "source": "/learn/05-hybrid-jobs", "target": "/learn/06-hybrid-jobs", "status": "301", "condition": null }
]
```

- [ ] **Step 2: Verify after the branch deploys**

After the PR merges and Amplify deploys, request an old URL and confirm a 301 to the new path:
```bash
curl -sI https://quantum.altivum.ai/learn/00-foundations | grep -i "location\|HTTP/"
```
Expected: `301` with `location: .../learn/01-foundations`.

---

### Task 8: Push and open the PR

- [ ] **Step 1: Push the branch and open the PR** (only after Tasks 1–6 verifications are green)

```bash
git push -u origin chore/renumber-modules-00-06
gh pr create --title "refactor: renumber curriculum directories 00->06" --body "Resolves the duplicate-00 collision. Renames 00-foundations->01-foundations and shifts 01-05 up by one; 00-prereqs unchanged. Manifest/tests/docs/lab-staging updated; Amplify console redirects added separately (see plan Task 7). No prose rewrites — that is Phase 1."
```

Expected: PR opens; the 3 branch-protection CI checks run and pass.
