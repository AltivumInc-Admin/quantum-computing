// Single source of truth for which tier:"py" challenge Reps have REAL,
// in-browser E2E grading coverage.
//
// The Tier-B ("py") path runs a learner's free-form Braket Python in the
// same-origin Pyodide worker (pyodide-grader.ts) and grades the resulting state
// vector. That path cannot execute in jsdom, so a py Rep can only be trusted
// once it is proven end-to-end in a real browser. This list is the contract
// that keeps content and proof in lockstep — it is imported by three places
// that must agree:
//
//   1. rep-schema.ts        — a tier:"py" contribution/fence validates ONLY if
//                             its id appears here (authoring py content without
//                             coverage fails the corpus/schema tests loudly).
//   2. guide-reps.test.ts   — asserts the set of tier:"py" GUIDE fences equals
//                             this list, in BOTH directions (no uncovered py
//                             fence; no manifest id without a shipped fence).
//   3. web/e2e/py-reps.e2e.ts — drives EXACTLY these ids on real Pyodide, a
//                             correct answer to the solved verdict and a wrong
//                             one to the wrong verdict; its case table must map
//                             1:1 to this list.
//
// Adding a py Rep is therefore a three-part edit that cannot half-land: author
// the GUIDE fence, add its id here, add its e2e case. Miss any one and CI fails.
export const PY_REP_E2E_IDS = [
  "found-ghz-py-1",
  "algo-oracle-input-py-1",
  "qml-angle-encode-py-1",
  "chem-hf-ref-py-1",
] as const;

export type PyRepId = (typeof PY_REP_E2E_IDS)[number];

/** True when a tier:"py" Rep id is backed by real in-browser e2e grading. */
export function isPyRepE2ECovered(id: string): boolean {
  return (PY_REP_E2E_IDS as readonly string[]).includes(id);
}
