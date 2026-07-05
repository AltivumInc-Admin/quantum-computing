# Contribute a Rep

A **Rep** is a graded exercise: the learner commits to an answer, the platform
grades it objectively in the browser, and a correct solve enters their
spaced-repetition schedule. Every Rep in the curriculum is data, not code —
which means you can contribute one with a pull request that adds a single JSON
file to this directory.

## How it works

1. Add one file here: `content/reps/<id>.json` (the filename must equal the
   Rep's `id`).
2. Open a pull request. CI validates every Rep in this directory with the
   **same parsers and graders the live widgets use** — shape, solvability,
   distractor sanity, and id uniqueness across the whole curriculum.
3. Maintainers review the pedagogy (placement, prompt clarity, hint quality).
   Accepted Reps are promoted into the matching lesson GUIDE, where they render
   as the live widget and start scheduling reviews for every learner.

## Format

One JSON object per file: the widget's fence spec plus a `kind` envelope.

```json
{
  "kind": "predict",
  "id": "community-ghz-reachable-1",
  "prompt": "Which basis states can this three-qubit GHZ circuit produce?",
  "program": "H 0\nCNOT 0 1\nCNOT 1 2",
  "mode": "nonzero-states",
  "hint": "The first CNOT ties qubit 1 to qubit 0; the second ties qubit 2 to qubit 1 — all three always agree."
}
```

| `kind` | Renders as | Spec fields (see the lesson widgets for details) |
|---|---|---|
| `challenge` | ```` ```qchallenge ```` | `id`, `prompt`, `target.program`, `qubits?`, `starter?`, `allowedGates?`, `hint?` |
| `predict` | ```` ```qpredict ```` | `id`, `prompt`, `program`, `mode` (`top-outcome` \| `nonzero-states`), `hint?` |
| `blochtarget` | ```` ```qblochtarget ```` | `id`, `prompt`, `target.program` (single qubit), `toleranceDeg?`, `blind?`, `hint?` |
| `costestimate` | ```` ```qcostestimate ```` | `id`, `prompt`, `provider` (per-shot QPU), `shots`, `tasks?`, `hint?` — hints may use `{perTask}`/`{perShot}`/`{shots}` placeholders, which resolve from the live pricing table |

## Rules CI enforces

- **`id` starts with `community-`** and matches `community-<topic>-<n>` in
  kebab-case. Ids are permanent localStorage keys: never rename one after a
  learner may have scheduled it.
- **Filename = id** (`community-ghz-reachable-1.json`).
- **Unique everywhere**: no collision with any other contributed Rep or any
  Rep/card id already authored in a lesson GUIDE.
- **Gradeable, not just parseable**: a challenge's reference program must solve
  itself; a bloch target must be a reachable single-qubit state outside the
  |0⟩ start tolerance; a cost estimate's four options must be distinct dollars.

Run the same validation locally: `cd web && npx jest reps-corpus`.
