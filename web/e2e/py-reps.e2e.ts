import { test, expect } from "@playwright/test";
import { PY_REP_E2E_IDS } from "../src/lib/py-reps";

/**
 * End-to-end proof that EVERY shipped tier:"py" Rep grades for real in the
 * browser. The fixture page (/e2e-fixtures/py-reps) mounts each Rep from its
 * real GUIDE fence; here we drive each one through Challenge → runPy → gradePy
 * on real Pyodide + the real qcsim wheel: a correct free-form Braket-Python
 * answer must reach the solved verdict, a wrong-but-valid one must surface the
 * Rep's own hint (a "wrong" verdict, not an error).
 *
 * The case table below MUST map 1:1 to src/lib/py-reps.ts — the same manifest
 * rep-schema.ts and guide-reps.test.ts gate content on. The `SOLVED` string and
 * each `wrongText` are the grader's real outputs (pyodide-grader.ts returns the
 * spec hint on a mismatch), so a grading-semantics change is caught here.
 *
 * Also asserts the whole flow is fully same-origin (Pyodide from /pyodide/, the
 * wheel from /lab/files/wheels/) and boots the interpreter exactly once — every
 * Rep shares the one cached runtime.
 */

const FIXTURE = "/e2e-fixtures/py-reps.html";

// The grader's exact solved literal (pyodide-grader.ts).
const SOLVED = "Correct — verified against the reference state vector.";

const IMPORT = "from braket.circuits import Circuit\n";

interface Case {
  /** A correct free-form Braket-Python solution. */
  solution: string;
  /** A valid circuit that is NOT the target — must grade "wrong", not "error". */
  wrong: string;
  /** A distinctive substring of the Rep's hint (shown on a wrong verdict). */
  wrongText: string;
}

const CASES: Record<(typeof PY_REP_E2E_IDS)[number], Case> = {
  "found-ghz-py-1": {
    solution: `${IMPORT}circuit = Circuit().h(0).cnot(0, 1).cnot(1, 2)`,
    wrong: `${IMPORT}circuit = Circuit().h(0).cnot(0, 1)`,
    wrongText: "chain the entanglement down the line",
  },
  "algo-oracle-input-py-1": {
    solution: `${IMPORT}circuit = Circuit().h(0).x(1).h(1)`,
    wrong: `${IMPORT}circuit = Circuit().h(0).h(1)`,
    wrongText: "the minus sign the oracle kicks its answer onto",
  },
  "qml-angle-encode-py-1": {
    solution: `${IMPORT}circuit = Circuit().ry(0, 0.6).ry(1, 0.9)`,
    // Features swapped between the qubits — a valid 2-qubit state, but not x.
    wrong: `${IMPORT}circuit = Circuit().ry(0, 0.9).ry(1, 0.6)`,
    wrongText: "one RY per qubit",
  },
  "chem-hf-ref-py-1": {
    solution: `${IMPORT}circuit = Circuit().x(0).x(1)`,
    wrong: `${IMPORT}circuit = Circuit().h(0).x(1)`,
    wrongText: "single occupation state",
  },
};

test("the case table maps 1:1 to the e2e-coverage manifest", () => {
  expect(Object.keys(CASES).sort()).toEqual([...PY_REP_E2E_IDS].sort());
});

test("every shipped tier:py Rep grades solve/wrong for real, one boot, fully same-origin", async ({
  page,
  baseURL,
}) => {
  // A cold runner boots Pyodide once (~seconds) then grades every Rep off the
  // cached runtime; still give generous headroom for shared-CI contention.
  test.setTimeout(300_000);

  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const bootFetches: string[] = [];
  page.on("request", (req) => {
    const u = req.url();
    if (/^https?:/.test(u) && new URL(u).origin !== origin) {
      external.push(`${req.method()} ${u}`);
    }
    if (u.includes("pyodide.asm.wasm")) bootFetches.push(u);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[fixture console error]", m.text());
  });
  page.on("pageerror", (e) => console.log("[fixture page error]", e.message));

  await page.goto(FIXTURE);

  for (const id of PY_REP_E2E_IDS) {
    const { solution, wrong, wrongText } = CASES[id];
    const scope = page.locator(`[data-testid="py-rep-${id}"]`);
    // The py-tier caption proves this Rep parsed as tier:"py" (would reroute to
    // gradeTs and "pass" without booting Pyodide otherwise).
    await expect(scope.getByText("graded with real qcsim in your browser")).toBeVisible();

    const editor = scope.getByLabel("Your circuit");
    const check = scope.getByRole("button", { name: "Check" });
    // persist={false} renders no schedule/metric note, so the verdict is the
    // only role="status" node in this Rep's scope.
    const verdict = scope.getByRole("status").first();

    // Correct free-form Braket Python → the grader's exact solved literal.
    await editor.fill(solution);
    await check.click();
    await expect(verdict).toContainText(SOLVED, { timeout: 150_000 });

    // Wrong-but-valid → the Rep's own hint (a "wrong" verdict, not an "error").
    await editor.fill(wrong);
    await check.click();
    await expect(verdict).toContainText(wrongText, { timeout: 60_000 });
  }

  // One interpreter across every Rep — the getPyodide() singleton is shared.
  expect(
    bootFetches,
    `expected exactly 1 Pyodide boot across all Reps, saw ${bootFetches.length}:\n${bootFetches.join("\n")}`
  ).toHaveLength(1);

  // Boot + every grade made zero third-party requests.
  expect(external, `grader made third-party requests:\n${external.join("\n")}`).toEqual([]);
});
