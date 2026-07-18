import type { Metadata } from "next";
import { Challenge } from "@/components/quantum/challenge";
import { getPyChallengeFences } from "@/lib/py-challenge-fences";

/**
 * E2E fixture that mounts EVERY shipped tier:"py" Rep (the ids in
 * src/lib/py-reps.ts), each rendered from the REAL GUIDE fence source, so
 * web/e2e/py-reps.e2e.ts can grade each one for real — a correct free-form
 * Braket-Python answer to the solved verdict, a wrong one to the wrong verdict —
 * against real Pyodide + the real qcsim wheel. The coverage manifest maps 1:1 to
 * what this page mounts and what the e2e drives.
 *
 * Like the single-challenge fixture (../py-challenge), this page is unlinked from
 * navigation, excluded from the sitemap allowlist (src/app/sitemap.ts), noindex'd
 * here (deliberately NOT robots-disallowed — a Disallow would hide the noindex
 * from crawlers), and mounts every Challenge persist={false} so no visitor (or
 * the e2e itself) ever mints qc:* keys.
 */

export const metadata: Metadata = {
  title: "Pyodide py-Rep fixtures",
  robots: { index: false, follow: false },
};

export default function PyRepsFixturePage() {
  const fences = getPyChallengeFences();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Shipped tier:&quot;py&quot; Rep E2E fixtures
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Each shipped py Rep, rendered from its real GUIDE fence and graded with
        real Pyodide + the qcsim wheel, in-browser. Not part of the curriculum.
      </p>
      {fences.map(({ id, source }) => (
        // persist={false}: grading works, but no qc:* keys are ever written.
        <section key={id} data-testid={`py-rep-${id}`} className="mt-4">
          <Challenge source={source} persist={false} />
        </section>
      ))}
    </main>
  );
}
