# Where we stand on the Jupyter notebooks

*2026-09-04 · repo HEAD `1bc469a` · six parallel surveys + adversarial verification*

## 1. Bottom line

The notebook curriculum is in good mechanical shape and just got substantially deeper. All 45 notebooks ship output-free with a complete, CI-gated exercise loop; the PR #264 teaching-depth rewrite added ~4,356 lines of markdown across every notebook without touching a single code cell, and the deployed JupyterLite lab is serving that new prose today (verified by fetching all 45 notebooks from `learner.quantumenv.dev` and diffing against source). I audited the new prose for mathematical correctness — the first time anyone has — and found it sound, with one factual error.

The real open items are not about the rewrite. They are: a **hardware fleet that is stale in both directions** (TN1 is confirmed `RETIRED` by live API and is still taught and asserted-on; three ONLINE devices the curriculum has never heard of), **zero learner telemetry by deliberate design** — meaning "did the rewrite work?" is currently unanswerable — and a **shipped rule-13 violation in the deployed tutor** that this survey turned up incidentally and that is more urgent than anything in the notebooks themselves.

Nothing here is "broken." Several things are wrong.

## 2. What exists

| | Count | Source |
|---|---|---|
| Curriculum notebooks | **45** (6 / 5 / 6 / 6 / 7 / 8 / 7 across sections 00–06) | `find 0*/notebooks/*.ipynb` |
| Exercises | **133** (2–5 per notebook; 14 nb at 2, 20 at 3, 10 at 4, 1 at 5) | scaffold/check/solution triple-count |
| Canonical solutions | **133** in 45 files under `tests/solutions/` — keys match exercise numbers exactly, no orphans | structure gate |
| Asserts in check cells | **630**, all with a guidance message (0 bare) | AST walk |
| Markdown words | **97,593** across notebooks; **27,363** more in the 7 GUIDEs | word census |
| Non-blank code lines | **8,865** | census |
| Browser-runnable | **32 of 45** (06-hybrid-jobs is 0/7) | `content-manifest.json`, generated |
| Estimated learner time | **~62 hours** (180 wpm + 2.5 min/code cell + 12 min/exercise), + 2.5h of GUIDE prose | derived |

No numbering gaps, no planned-but-missing notebook, no placeholder text anywhere in markdown. Every `TODO` in the corpus is the intentional `# TODO: your code here` scaffold line.

**Nobody had the 62-hour figure before.** It matters: this is a semester-length course, which changes what "complete" means (see §5.3).

## 3. What shipped recently

**PR #165 — the exercise loop.** Delivered in full: `docs/exercise-convention.md` defines the three-cell unit (prompt with two hint tiers → scaffold → check), `tests/test_exercise_checks.py` executes every notebook both solved-and-strict and unsolved, `lib/grading.py` is the stdlib-only browser-safe runtime. All 45 notebooks converted; `SKIP_EXECUTION` is empty.

**PR #264 — the teaching-depth rewrite (2026-09-03).** Six prose commits + one math-unwrap fix, touching all 45 notebooks. Verified independently: **zero code cells changed anywhere.** Line totals `+4,363 / −531`. But the work was not uniform, and the announcement papers over that:

| Section | md cells changed | Diff |
|---|---|---|
| 00-prereqs + 01-foundations | **73 of 90 teaching cells (81%)** | +1742 / −173 |
| 02-hardware | 23 of 60 | +574 |
| 03-algorithms | 18 of 62 | +504 |
| 04-quantum-ml | 21 of 71 | +596 |
| 05-quantum-chemistry | 24 of 77 | +646 |
| 06-hybrid-jobs | **11 of 70** | +301 |

Sections 00–01 were a genuine rewrite (prose per notebook ~370 → ~1,734 words). Sections 02–06 were an **enrichment**: a new opening cell plus 1–6 body cells per notebook, leaving **71% of their teaching prose (243 of 340 cells) byte-identical**. Three 06-hybrid-jobs notebooks had *only* their title cell rewritten.

The changelog entry (`web/src/lib/changelog.ts`, id `2026-09-03-notebooks-that-teach`) says *"Every notebook in the curriculum has been rewritten to teach… Each section now says what the code is about to show."* For sections 00–01 that is exactly true. For 02–06 it is not — and the 02-hardware commit message itself is honest about it ("enrichment rather than rewrite") while the learner-facing entry is not.

One genuine stub was fixed: `05-quantum-chemistry/05-ansatz-design.ipynb` shipped 2026-06-18 with a cell literally reading *"Full prose on disk."* and survived 2.5 months. Its companion marker, *"Full table on disk,"* pointed at a GUIDE table that does not exist.

## 4. Verified state

| Dimension | State | RUN vs READ |
|---|---|---|
| **Test harness** | 137 tests, **137 passed** in ~4:25, twice locally. Rest of suite 568 passed. Total 705 — matches CI run `33833346791` on this HEAD (`705 passed in 603.75s`) exactly. | **RUN.** Also **mutation-tested both gates**: corrupting a canonical solution → 1 failure; making a check trivially true → the unsolved gate catches it. Not vacuous. |
| **Exercise conformance** | 133/133 pass all six structural checks; `## Exercises` headers, hint-tier labels, `# Check Exercise N` first lines, adjacency, `with check(...)` — zero defects. | **RUN** (nbformat walk + full pytest). |
| **Browser pipeline** | `build.sh` stages all 45 + `lib/` + qcsim wheel, injects one hidden Pyodide bootstrap cell, runs `jupyter lite build`. Lab kernel is fully same-origin (`disablePyPIFallback: true`). **All 45 deployed notebooks match current source.** Amplify job 17 SUCCEED on the merge commit, 27 min after merge. | **RUN** — curl'd all 45 from `learner.quantumenv.dev` and diffed cell-by-cell. |
| **Notebook execution** | 32 runnable notebooks execute under qcsim (`test_notebook_contract`, 66 passed); **all 45** execute twice each in `test_exercise_checks`, with the 13 non-runnable ones running against the **real Braket SDK**; 3 sampled notebooks run under the real SDK explicitly. | **RUN.** An earlier survey claim that "only 3 of 45 ever touch the real SDK" was **refuted** — it is 16. |
| **Web integration** | No per-notebook page exists. 45 notebooks → 7 `/learn/<slug>` routes, each rendering `GUIDE.md` + a grid of notebook link cards. Manifest matches disk exactly (0 mismatches). Link guard 90/90, pricing-prose guard 7/7, web Jest 2,712 tests, Playwright lab spec 2 passed. | **RUN.** |
| **New prose correctness** | **Sound.** Verified by recomputation: Grover's reflection arithmetic (0.265 mean → 0.884/0.177, P=0.78), ⌊π/4·√8⌋=2 with P>0.94, DJ's (1/8)Σ(−1)^f(x) and the 2^(n−1)+1 bound, QFT's n(n−1)/2+n and 2^(−d) decay, AQFT O(n²)→O(n log n), QPE's φ=1/8=0.001₂, amplitude estimation's sin²((2k+1)θ/2), RDM purity 1.0/0.5, (X⊗X)²=I, native gate sets. **One error** (§5.4). | **RUN** (recomputed; shot-noise claim measured over 20 trials). |
| **Live hardware fleet** | Braket `SearchDevices` across all six regions, read-only. | **RUN** (§5.1). |
| **Learner usage** | `quantum-analytics-daily` scanned. | **RUN** (§5.5). |

**Not verified:** rendered markdown output inside the deployed lab (I read source, not pixels); `06-hybrid-jobs/algorithms/qml_training_job.py` and `vqe_chemistry_job.py` (unread by anyone); whether notebook prose now contradicts GUIDE prose, which nobody compared.

## 5. Open gaps, worst first

### 5.1 The hardware fleet is stale in both directions, and two check cells enforce the staleness — IMPORTANT

TN1 is confirmed `RETIRED` in every region that lists it (us-east-1, us-west-2, eu-west-2), queried live. It is still registered `gate_capable: True` and dispatchable in `lib/hardware/devices.py:85-90`, priced in `lib/utils/cost.py:18`, taught in three notebooks, and shipped to the public site via `02-hardware/GUIDE.md:185,302`, `README.md:584`, and `web/src/components/quantum/{devices.ts:48,cost.ts:14,glossary.ts:212}`.

Worse than prose: `02-hardware/01-device-discovery.ipynb` raw line 589 asserts `_picks[5] == "TN1"` **inside a graded `with check("Exercise 2")` block**, and `tests/solutions/02-hardware/01-device-discovery.py:22` makes `"SV1" if n_qubits <= 34 else "TN1"` the canonical answer. (Correction to an earlier survey claim: this does *not* punish a correct learner — the prompt explicitly instructs that rule — but it teaches and then enforces an obsolete selection rule. The `05-simulator-comparison.ipynb` asserts at lines 292/296 are plain asserts in a teaching cell, not graded.)

The same live query surfaced drift nobody had reported:

- **`Forte-1` — the exact ARN at `devices.py:94`, taught throughout section 02 as the live IonQ machine — is `OFFLINE`.** (OFFLINE is often a calibration window, unlike TN1's RETIRED; re-check before acting.)
- `Forte-Enterprise-1` is ONLINE and appears **nowhere** in the repo.
- IQM `Emerald` and AQT `IBEX Q1` are ONLINE in eu-north-1 and appear nowhere — AQT is an entire modality the course does not know exists.
- Rigetti `Cepheus-1-108Q` is priced *and correctly annotated reference-only* at `cost.ts:16` — the exact pattern the `tn1` entry three lines below is missing.

No guard can catch any of this: `test_pricing_prose` derives its valid amounts *from* `PRICING`, so a stale rate blesses itself forever, and `grep -rn "search-devices"` returns zero hits repo-wide. `01-device-discovery.ipynb` cell #5 carries the comment *"a retyped copy silently goes stale when a device is retired."* That is what happened, in the dict directly below it.

**To close:** mark `tn1` retired (or delete) in `devices.py`/`cost.py`, update the solution + assert, fix GUIDE/README/web copy, and add a nightly job comparing `DEVICES` ARNs to `SearchDevices` status. The audit assigned this a first commit on 2026-08-27; it was not made, and the notebooks were rewritten a week later with the asserts untouched.

### 5.2 There is no learner telemetry — by design, at real product cost — IMPORTANT

`quantum-analytics-daily` (QL-Prod, us-east-2) holds **7 rows**, 2026-08-28 → 09-03: **25 humans, 241 page views, 6 Google sign-ins.** The three zero days precede the `learner.quantumenv.dev` cutover, so that is not a traffic collapse.

More consequential: `lambda/analytics/index.mjs:9` states *"WHAT THIS DELIBERATELY DOES NOT STORE: …paths"*, and the only per-row breakdown is bot-classification verdicts. `notebook-link.tsx` fires no event. **There is no signal anywhere indicating which notebooks or sections anyone opens.** A 62-hour corpus was just rewritten with no way to know whether learners reach section 03, and no way to measure whether the rewrite helped. This is a well-reasoned privacy commitment backed by the published policy — but the cost is unstated, and it is the reason the most important question about this work cannot be answered.

### 5.3 Curriculum scope is undocumented, and there are real holes for a 62-hour course — IMPORTANT

Absent from all 45 notebooks and all 7 GUIDEs: **Trotterization** (zero hits — in a course with an 8-notebook chemistry section), no-cloning, Bell/CHSH, mid-circuit measurement, readout-error mitigation, randomized benchmarking, quantum volume, stabilizers/surface codes, classical shadows. **Shor's is named 13 times as motivation and never taught** — 03-algorithms assembles DJ → Grover → QFT → QPE → QAOA → amplitude estimation, i.e. every component of Shor's, and stops. QEC appears only as passing mentions in 4 notebooks. Teleportation likewise.

Several of these are defensible calls for a Braket-centric NISQ course. But nothing in `PRODUCT.md` or any GUIDE says so, so both learners and reviewers read them as gaps rather than decisions.

### 5.4 One factual error in the new prose — IMPORTANT (single-line fix)

`00-prereqs/notebooks/03-probability-and-measurement.ipynb`: *"At 10 shots the estimate can be off by 0.1 or more; at 100,000 it is correct to three decimals."* Measured, 20 trials at p=0.5, n=100,000: max |error| **0.00273**, mean 0.00111 — **two** decimals. Three decimals needs ~10⁶ shots. It sits two sentences from the correct 1/√shots law it contradicts, in the notebook whose job is teaching shot noise.

### 5.5 A shipped rule-13 violation in the deployed tutor — IMPORTANT, and out of scope

Surfaced incidentally. The production `quantum-tutor` Lambda in QL-Prod (LastModified `2026-08-29T03:21:55Z`) contains a `corpus.json` whose 02-hardware entry still reads: *"a free Workspace account comes with a sponsored budget on IQM Garnet … the platform pays Amazon Braket, you pay nothing."* `GUIDE.md` replaced that with *"Hardware runs are not currently available on the platform"* in `2a06bef` on 2026-08-28 — one day *before* the deploy. `NEXT_PUBLIC_TUTOR_URL` is set on the live app, so learners asking about 02-hardware are grounded on a withdrawn promise today. The Altivum copy carries it too. `deploy-check.mjs` *would* have caught this (it flags exactly those 3 sections) — the deploy went around it. **Rebuild the corpus and redeploy; this is the most urgent item in this document and it is not a notebook problem.**

### 5.6 No guard protects teaching-prose depth — IMPORTANT

Nothing asserts a minimum prose budget, forbids `"on disk"`/TODO/placeholder markers in markdown, or checks that a `## N.` heading carries body text. Confirmed across `tests/`, `web/__tests__`, and both workflows; no guard was added after the rewrite. The `"Full prose on disk"` stub survived 2.5 months because nothing looks. Nothing prevents the next one.

### 5.7 `-m "not slow"` silently drops all notebook execution, and the README recommends it — IMPORTANT

`README.md:548` says *"Run the fast subset locally with `pytest -m \"not slow\"`."* That deselects **126 of 705 tests** across four modules — both exercise-execution gates, `test_notebook_contract`'s live execution, and the real-SDK tier — leaving only static structure checks. pytest prints an unlabeled `(126 deselected)` and nothing else. CI is safe (`make test`, bare). This is the project's own documentation steering developers into a run that verifies almost nothing about notebooks.

### 5.8 The determinism fixture cannot reach the kernels it names — IMPORTANT

`tests/conftest.py:44-67` is autouse and its docstring says it exists *"so the notebook tier cannot flake."* It seeds qcsim's private sampler **in the pytest process**, while every notebook executes in a spawned nbclient kernel whose injected bootstrap never seeds. Proved: three fresh Bell-circuit runs at 200 shots gave different histograms under both qcsim and real Braket. 32 of 133 check cells assert on counts. **No flake observed** — 2 local runs + 1 CI run clean, and sampled tolerances are 7–11σ — so practical risk is low. The defect is that the file asserts a guarantee it does not provide. Fix is one line in each of *two* bootstraps, covering 25 of the 32 cells; the remaining 7 run under real Braket, which exposes no seeding API and is inherently unseedable — say so in the docstring.

### 5.9 All 13 non-runnable notebooks ship into the lab looking runnable — IMPORTANT

`build.sh` globs every `*.ipynb`; `prepare_notebooks.py` injects the Pyodide bootstrap into all 45. So the 13 non-runnable notebooks are published to `/lab/files/`, listed in the lab's contents API, and carry a bootstrap cell that implies they run. Run All on `06-hybrid-jobs/01-first-hybrid-job.ipynb` → `ModuleNotFoundError: braket.aws`, with no recovery (`disablePyPIFallback`). 12 of the 13 carry no warning; several carry prose asserting the **opposite** — e.g. *"Importing braket.aws / braket.jobs is free and needs NO AWS credentials,"* true under the real SDK, false in the lab that file is published into. The portal correctly disables the Run-in-browser chip; the lab file browser — the surface a learner is actually on — does not.

### 5.10 Six GUIDE links are live 404s on the very first lesson — MINOR

`00-prereqs/GUIDE.md:5,9,385` and `GUIDE.es.md:3,5,338` carry `[01-foundations](../01-foundations/GUIDE.md)`. No `a` component override exists in `markdown-components.tsx`, so react-markdown emits the raw href (confirmed by rendering it); under `output: "export"` it resolves to a path that does not exist. Invisible in prerendered HTML because the auth wall ships the markdown in the RSC payload and the anchor is created client-side. The sidebar and prev/next still route correctly, so it is a dead convenience link, not a dead end. `tests/test_notebook_links.py` globs `0*/notebooks/*.ipynb` only — the GUIDEs, i.e. the surface the web app actually renders, have zero link coverage. Note: extending the glob alone would **not** catch this, since the target exists on disk; the guard must assert GUIDE links are rewritten to routes.

### 5.11 Spanish GUIDE widget fences are ungated — MINOR

`guide-reps.test.ts` and `reps-corpus.test.ts` both hardcode `GUIDE.md`. **79 graded fences per locale** (plus ~28 `qcard` and ~30 other kinds) go unvalidated on the Spanish side. Demonstrated, not inferred: a deliberately malformed `qpredict` and an empty-id `quiz` injected into `01-foundations/GUIDE.es.md` left the full web suite green at 226 suites / 2,712 tests. EN/ES ids and per-kind counts match exactly today, so risk is latent — but nothing enforces that, and the ES guides *are* rendered to learners. Same class as audit finding `f025525e9` on the Python side, still open. One-line fix: iterate `["GUIDE.md","GUIDE.es.md"]` in both collectors.

### 5.12 Real-browser coverage is 2 of 32 — MINOR

`lab-pyodide.e2e.ts` boots the real kernel for exactly two notebooks. The other 30 rest on proxies (static AST denylist, headless CPython under qcsim, build-time closure guard). Strong proxies — and `test_lab_build_guards.py`'s own docstring names the failure they cannot see (a missing lock package 404s **same-origin**, invisible to both the third-party-request assertion and the CPython run). A prose-only rewrite is low risk here; a code-cell rewrite would not be.

### 5.13 Local build artifacts are two weeks stale, and the e2e passes on them — MINOR

`web/public/lab/files/`, `web/jupyterlite-build/files/` and `web/out/lab/files/` all hold the exact pre-#264 notebooks. `npm run test:e2e` serves `out/` with no rebuild hook — **I ran it: 2 passed against the stale tree**, because every string the spec asserts survived the rewrite. All three trees are gitignored and rebuilt from scratch by `build.sh` in CI and Amplify, so production is correct. This has bitten before (`docs/instrument-after-dark.md:81`, qcsim 0.2.0 vs 0.3.0). Documented-but-unenforced.

### 5.14 The remainder

- **QAOA hybrid job silently downgrades a billed device run to local simulation** (`qaoa_maxcut_job.py:104-114,139`). Bare `except Exception:` → `LocalSimulator()`; the `hasattr(device,"run")` guard is dead and the local path *always* raises `TypeError` on `s3_destination_folder`, so it always routes through the swallowing handler. Line 139 re-evaluates on a fresh LocalSimulator regardless. Issue **#229, still open**, unchanged since the repo's first commit. Not a notebook, and no notebook imports it — but it is the one place in this repo where a learner can pay for a QPU and be shown noiseless local numbers.
- **Hint-leakage: the two verifications disagree, and I am not resolving it here.** Both agree on the mechanical facts (10 of 133 exercises reproduce some canonical-solution line verbatim in a hint; 0 of 133 hints contain a code fence; nothing tests this). They disagree on whether it is a violation: one holds that in 3 of 4 flagged cases the "leaked" content is in the *prompt*, where the convention mandates it, leaving **one** genuine offender (`04-checkpointing` ex 2); the other, working from full dumps, counts **4–5** hints that reproduce complete solution statements. Both agree `04-checkpointing` ex 2 is the worst. Treat as one confirmed offender plus a style question, not four defects.
- **`# Define:` is unguarded.** All 133 scaffolds carry it by author discipline alone — `grep "Define" tests/ scripts/` is empty.
- **Marker coupling.** `test_checks_do_not_pass_unsolved` keys on the literal `" correct."` rather than importing `CORRECT_MARKER`. Renaming the *identifier* fails loudly (`test_grading.py` imports it); changing the marker's *printed value* goes silent. AST scan of all 399 check cells found **zero** currently exploiting the hole. Preventive only.
- **Issue #228 is fixed in `0108042` and still open**, so the tracker shows 2 curriculum issues when there is 1.
- **`INLINE_MATH` is single-line**, so hard-wrapped `$…$` can be misread as currency. Real, but narrower than reported: at `26ab240^` exactly **one** span broke CI, not nine — only spans opening with a digit can trigger it.
- **Seed prose:** 2 notebooks, 4 stale strings (`01-data-encoding:71,416`; `03-iqm-exploration:99,318`). The 01-data-encoding pair is genuinely false; `03-iqm-exploration:99` is attached to an assert that cannot fail at any seed.
- **Currency `$` escaping is inconsistent** — 4 markdown cells carry an odd number of unescaped `$`, all currency, and only 8 escaped `\$` exist corpus-wide. I did not observe rendered output; asserting inconsistency, not breakage.
- **`filter.nbstripout.clean` runs a repo-tracked script.** I reproduced arbitrary code execution as the real user from a `git status` after checking out a hostile branch. Latent only: the repo has **0 forks** and all 242 PRs are owner-authored. Note the trigger is the *next git command*, not checkout itself.
- **Spanish:** zero `.es.ipynb` exist; notebook card labels are humanized from English filenames and leak untranslated into Spanish aria strings and the workspace. Recorded as an undecided product question in `PRODUCT.md:257-261`, not a defect.
- **Correction to a survey framing:** the notebook prose is *not* "unreachable from the web app." JupyterLite is built into `web/public/lab/` and served same-origin, one click from each lesson page. It is unreachable *by the tutor* — `corpus.json` is GUIDE-only and `<AskTutor />` returns null outside `/learn/<slug>`, so there is no tutor in the lab at all.

## 6. What I'd do next

1. **Rebuild and redeploy the tutor corpus.** A live learner-facing surface advertises a withdrawn sponsorship. Not a notebook task; the most urgent thing this survey found.
2. **Fix the fleet.** Mark `tn1` retired in `devices.py`/`cost.py`, update `tests/solutions/02-hardware/01-device-discovery.py:22` and the two asserts, sweep GUIDE/README/web copy. Then re-check `Forte-1`, and decide whether `Forte-Enterprise-1`, `Emerald` and `IBEX Q1` belong in the curriculum.
3. **Add the fleet guard.** A nightly job comparing `DEVICES` ARNs against `SearchDevices` status. This is the only fix that prevents recurrence — every existing guard derives its truth from the stale table.
4. **Fix the shot-noise sentence** in `00-prereqs/03-probability-and-measurement.ipynb`. One line.
5. **Correct the changelog entry** to say what actually shipped per section, and write down the curriculum's scope boundary (no Shor, no QEC, no Trotter — and why) somewhere a learner can find it.
6. **Decide on telemetry.** Not "add tracking" — decide, explicitly, whether per-section reach is worth a narrow privacy-policy amendment. As it stands the answer is permanently no, by default rather than by choice.
7. **Cheap guards, one sitting:** prose-depth + placeholder-marker check; `# Define:` assertion; GUIDE link resolution *and* route-rewriting; `["GUIDE.md","GUIDE.es.md"]` in both reps collectors; `timeout-minutes` on the python CI job; seed the kernel in both bootstraps; strike the `-m "not slow"` recommendation from `README.md:548` or annotate what it drops.
8. **Warn in-lab** on the 13 non-runnable notebooks — a top markdown cell, or skip the bootstrap injection for them.
9. **Close #228.**