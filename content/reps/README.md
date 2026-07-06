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
   **Promotion is a move, not a copy**: the promotion PR pastes the fence into
   the GUIDE and deletes the file here in the same commit — the id travels with
   the Rep, and the uniqueness gate enforces exactly that.

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
| `challenge` | ```` ```qchallenge ```` | `id`, `prompt`, `target.program`, `qubits?`, `starter?`, `allowedGates?`, `hint?` — contributions are TS-graded only (no `tier` field) |
| `predict` | ```` ```qpredict ```` | `id`, `prompt`, `program`, `mode?` (`top-outcome` \| `nonzero-states`, defaults `top-outcome`), `hint?` |
| `blochtarget` | ```` ```qblochtarget ```` | `id`, `prompt`, `target.program` (single qubit), `toleranceDeg?`, `blind?`, `hint?` |
| `costestimate` | ```` ```qcostestimate ```` | `id`, `prompt`, `provider` (per-shot QPU), `shots`, `tasks?`, `hint?` — hints may use `{perTask}`/`{perShot}`/`{shots}` placeholders, which resolve from the live pricing table |
| `debug` | ```` ```qdebug ```` | `id`, `prompt`, `broken` (`{ "program": "..." }` — the buggy circuit prefilled in the editor), `target` (`{ "program": "..." }`), `qubits?`, `allowedGates?`, `hint?` — the broken circuit must NOT already prepare the target (nothing to fix), and the target must not be the |0…0⟩ start state (deleting every gate would solve it) |
| `expect` | ```` ```qexpect ```` | `id`, `prompt`, `program` (concrete circuit — no slider theta), `observable` (a Pauli string of PAULI-qubit pairs, e.g. `"Z 0"` or `"Z 0 Z 1"`; one factor per site), `qubits?`, `hint?` — the four displayed values must be distinct on the 2-decimal grid |

Unknown or misspelled keys are rejected loudly (the widgets would silently
ignore them), and a Rep file is capped at 64 KB.

## Rules CI enforces

- **`id` starts with `community-`** and matches `community-<topic>-<n>` in
  kebab-case. Ids are permanent localStorage keys: never rename one after a
  learner may have scheduled it.
- **Filename = id** (`community-ghz-reachable-1.json`).
- **Unique everywhere**: no collision with any other contributed Rep or any
  Rep/card id already authored in a lesson GUIDE.
- **Gradeable, not just parseable**: a challenge's reference program must solve
  itself — and the *untouched editor must not* (no identity targets, no starter
  equal to the solution); a top-outcome prediction must have a real answer (not
  an all-outcomes tie); a bloch target must sit outside the |0⟩ start
  tolerance; a cost estimate's four options must be distinct dollars.

Run the same validation locally: `cd web && npm ci && npx jest reps-corpus`.
