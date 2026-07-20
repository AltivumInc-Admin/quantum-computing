import type { Metadata } from "next";
import { Challenge } from "@/components/quantum/challenge";
import { TimeoutOverride } from "./timeout-override";

/**
 * E2E fixture for the Tier-B (Pyodide) grader path — specifically its VERDICT
 * and WATCHDOG SEMANTICS, on a synthetic spec that no lesson ships. (The sibling
 * fixture ../py-reps covers the other half: every shipped tier:"py" Rep, mounted
 * from its real GUIDE fence. This page is no longer the only tier:"py" mount —
 * four py Reps have shipped since PR #167.) It exists so
 * `web/e2e/challenge-py-grader.e2e.ts` (the
 * three-verdict grading proof) and `web/e2e/py-grader-timeout.e2e.ts` (the
 * watchdog kill-and-reboot proof, which shortens the run timeout via
 * `?timeoutMs=` — see TimeoutOverride) can drive Challenge → runPy → gradePy
 * against real Pyodide + the real qcsim wheel without publishing py-tier content
 * into a lesson GUIDE. Unlinked from navigation, excluded from the sitemap
 * allowlist (src/app/sitemap.ts), noindex'd here (deliberately NOT
 * robots-disallowed — a Disallow would hide the noindex from crawlers), and
 * mounted persist={false} so no visitor ever mints qc:* keys.
 * Keep the spec in lockstep with both e2e specs' assertions.
 */

export const metadata: Metadata = {
  title: "Pyodide grader fixture",
  robots: { index: false, follow: false },
};

const SPEC = JSON.stringify({
  tier: "py",
  id: "e2e-bell-py",
  prompt:
    "Prepare the Bell state (|00⟩ + |11⟩)/√2 in free-form Braket Python. Assign your circuit to `circuit`.",
  target: { program: "H 0\nCNOT 0 1" },
  starter: "from braket.circuits import Circuit\ncircuit = Circuit()",
  hint: "Start from Circuit().h(0) and entangle with .cnot(0, 1).",
});

export default function PyChallengeFixturePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Pyodide grader E2E fixture
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Exercises the tier:&quot;py&quot; grading path (real Pyodide + the qcsim
        wheel, in-browser). Not part of the curriculum.
      </p>
      {/* persist={false}: grading works, but no qc:* keys are ever written —
          a visitor (or the e2e itself) must not mint a phantom card that the
          additive cross-device sync would replicate forever. */}
      <TimeoutOverride />
      <Challenge source={SPEC} persist={false} />
    </main>
  );
}
