import type { Metadata } from "next";
import { RunnableEditor } from "@/components/quantum/runnable-editor";

/**
 * E2E fixture for the inline runnable code editor — the ONLY page that mounts
 * RunnableEditor outside a lesson GUIDE. It exists so
 * `web/e2e/runnable-editor.e2e.ts` can drive the real path a learner takes on
 * 01-foundations (Monaco boots from the self-hosted, version-stamped
 * /monaco/<version>/vs → the learner edits Python → Run → the shared worker-hosted
 * Pyodide runtime executes it against the real qcsim wheel) in a real browser.
 *
 * Why a fixture instead of the lesson page: every /learn/* route sits behind the
 * sign-up wall (auth-wall.tsx exempts /e2e-fixtures/*), and the lesson's own
 * approach gate + surrounding widgets would make the spec a test of the lesson
 * rather than of the editor. The `source` below is the GUIDE fence verbatim —
 * `tests/test_guide_runnable_fences.py` is what keeps the shipped fences
 * themselves honest.
 *
 * Unlinked from navigation, excluded from the sitemap allowlist
 * (src/app/sitemap.ts), and noindex'd here (deliberately NOT robots-disallowed —
 * a Disallow would hide the noindex from crawlers). RunnableEditor writes no
 * qc:* keys, so there is no persist flag to disable.
 */

export const metadata: Metadata = {
  title: "Runnable editor fixture",
  robots: { index: false, follow: false },
};

// Verbatim copy of the ```runnable fence in 01-foundations/GUIDE.md — the single
// runnable fence that ships to learners today.
const SOURCE = `from braket.circuits import Circuit

# Entangle two qubits: a Hadamard on q0, then a CNOT controlled by q0.
circuit = Circuit().h(0).cnot(0, 1)

# Inspect the resulting state vector (amplitudes of |00>, |01>, |10>, |11>).
print(circuit.state_vector())`;

export default function RunnableEditorFixturePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Runnable editor E2E fixture
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Exercises the ```runnable fence path (self-hosted Monaco + real Pyodide
        and the qcsim wheel, in-browser). Not part of the curriculum.
      </p>
      <RunnableEditor source={SOURCE} />
    </main>
  );
}
