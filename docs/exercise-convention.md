# Notebook Exercise Convention

Every curriculum notebook carries exercises in one uniform, machine-checkable
format. This document is the single source for that format; it is enforced by
`tests/test_exercise_checks.py` (structure + solutions verification) and
consumed by authors (human or agent) converting or adding exercises.

## The three-cell unit

Each exercise is exactly three cells, in this order:

### 1. Prompt cell (markdown)

```markdown
### Exercise N — <short title>

<Prompt prose: what to build and what "done" looks like. Name the variables
the check expects.>

<details><summary>Hint 1 — nudge</summary>

<Conceptual pointer: which idea from the notebook applies, and why. Never
code.>

</details>
<details><summary>Hint 2 — approach</summary>

<Concrete approach: the steps or functions to reach for — still not the
answer. Pseudo-code is acceptable here; copy-pasteable solutions are not.>

</details>
```

Rules:
- Hints steer, they do not solve. Anything that previously spelled out the
  answer in scaffold comments belongs in Hint 2 at most — rewritten as an
  approach, not as the answer.
- Both hint tiers are mandatory. Jupyter, JupyterLite, and GitHub all render
  `<details>` natively.
- Blank lines inside `<details>` blocks are required for markdown rendering.

### 2. Scaffold cell (code)

```python
# Exercise N: <one-line goal>
# Define: <the exact variable name(s) the check below inspects>

# TODO: your code here
```

Rules:
- First line MUST match `# Exercise N:` — the harness keys on it.
- The `# Define:` line names the check's contract explicitly.
- The scaffold stays minimal; steering lives in the hints, not in commented
  pseudo-code.
- **Fresh names only**: the variables the check inspects must not be defined
  anywhere else in the notebook (teaching cells included). The harness
  executes the unsolved notebook and fails if any check passes on its own.

### 3. Check cell (code)

```python
# Check Exercise N -- run after your attempt.
from lib.grading import check

with check("Exercise N"):
    assert <property of the learner's result>, "<guidance, not the answer>"
```

Rules:
- First line MUST match `# Check Exercise N` — the harness keys on it.
- The check cell is the NEXT code cell after its scaffold.
- Checks are **property-based**: they verify observable properties of the
  result (counts distribution, norm, dimensions, sign structure, an energy
  below a bound) — never string-compare the learner's source and never
  reconstruct the full solution to diff against.
- Assert messages guide ("counts should only ever contain all-0s or all-1s"),
  they do not reveal.
- `check` prints; it never raises for the learner. Under
  `QL_GRADING_STRICT=1` (the harness) every failure is fatal.

## Section header

The exercise block sits under a `## Exercises` header (numbered notebooks use
`## N. Exercises`). The prereqs notebooks keep their appended `### Solutions`
cell — visible worked answers are that section's deliberate on-ramp — but use
the same three-cell unit above.

## Canonical solutions

Every exercise has a canonical solution in
`tests/solutions/<section>/<notebook-stem>.py`:

```python
SOLUTIONS = {
    1: """
ghz5 = ghz_state(5)
ghz5_counts = device.run(ghz5, shots=1000).result().measurement_counts
""",
    2: """...""",
}
```

Rules:
- Keys are the exercise numbers; values are executable snippets that assume
  the notebook's namespace up to (and including) the scaffold cell.
- Solutions must satisfy the runnable contract for browser-runnable notebooks
  (no denylisted imports, `statevector()` helper — see
  `scripts/validate_runnable.py`).
- The harness inserts each solution directly before its check cell and
  executes the whole notebook strictly: a wrong solution OR a wrong check
  fails CI. It then executes the notebook unsolved and fails if any check
  reports success.

## Verifying locally

```bash
# structure + solutions coverage (fast)
.venv/bin/pytest tests/test_exercise_checks.py -k "structure" -q
# full execution for one notebook (slow)
.venv/bin/pytest tests/test_exercise_checks.py -k "01-first-circuit" -q
```

Edit notebooks with `nbformat` (never raw JSON string surgery): it preserves
cell ids and format versions, and keeps `nbstripout` diffs clean. Notebooks
are committed output-free.
