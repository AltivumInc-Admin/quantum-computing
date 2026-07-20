/**
 * Codegen-contract test for the tutor's "third runtime".
 *
 * web/src/lib/tutor.ts does not implement anything: a prebuild step copies
 * lambda/tutor/tutor-core.mjs verbatim into the gitignored
 * web/src/lib/tutor-core.generated.ts. The behaviour of that module is pinned
 * where it actually runs — lambda/tutor/tutor-core.test.mjs (a required CI job)
 * covers the strip, the heading extraction, the corpus entry and every system
 * prompt guardrail, over synthetic fixtures AND, via
 * web/__tests__/content/tutor-corpus.test.ts, over the real curriculum GUIDEs.
 *
 * What only THIS boundary can check is that the copy is faithful and that the
 * three values crossing the wire to the browser are byte-identical to the ones
 * the Lambda uses. A drifted sentinel means the client renders the endpoint's
 * apology as part of the answer; a drifted cap means the server silently slices
 * a question the textarea let the learner finish typing.
 */
import { readFileSync } from "fs";
import path from "path";
import {
  TUTOR_ERROR_SENTINEL,
  OUT_OF_SCOPE_MESSAGE,
  MAX_QUESTION_CHARS,
  stripGuideForTutor,
} from "@/lib/tutor";

const CORE_SOURCE = readFileSync(
  path.join(__dirname, "../../../lambda/tutor/tutor-core.mjs"),
  "utf-8"
);

/** The initializer of a top-level `export const NAME = …;` in the source module. */
function exportedLiteral(name: string): string {
  const m = new RegExp(`export const ${name} =\\s*([\\s\\S]*?);\\n`).exec(CORE_SOURCE);
  if (!m) throw new Error(`tutor-core.mjs has no exported const ${name}`);
  return m[1].trim();
}

describe("generated tutor-core copy", () => {
  it("is generated from lambda/tutor/tutor-core.mjs, not hand-written", () => {
    const generated = readFileSync(
      path.join(__dirname, "../../src/lib/tutor-core.generated.ts"),
      "utf-8"
    );
    expect(generated).toContain("lambda/tutor/tutor-core.mjs");
    // The banner is the only addition; every export below must be the same code.
    expect(generated).toContain("export const TUTOR_ERROR_SENTINEL");
    expect(generated).toContain("export function stripGuideForTutor");
  });

  it("carries the error sentinel byte-identically", () => {
    expect(exportedLiteral("TUTOR_ERROR_SENTINEL")).toBe(JSON.stringify(TUTOR_ERROR_SENTINEL));
    // Delimited so it can never occur in tutor prose.
    expect(TUTOR_ERROR_SENTINEL).toBe("<<TUTOR-STREAM-ERROR>>");
  });

  it("carries the out-of-scope refusal byte-identically", () => {
    // The panel compares the streamed text against this string to render the
    // refusal in the muted register — an edit on either side breaks that match.
    expect(exportedLiteral("OUT_OF_SCOPE_MESSAGE")).toBe(JSON.stringify(OUT_OF_SCOPE_MESSAGE));
    // The panel only renders inside /learn/<slug>, so the copy must not tell the
    // learner to go open a lesson they are already reading.
    expect(OUT_OF_SCOPE_MESSAGE).not.toMatch(/open a lesson/i);
  });

  it("carries the question cap byte-identically, under the handler's body gate", () => {
    expect(exportedLiteral("MAX_QUESTION_CHARS")).toBe(String(MAX_QUESTION_CHARS));
    expect(MAX_QUESTION_CHARS).toBe(2000);
    // A question at the cap must still clear the 16 KiB body limit, whose
    // overflow path is a different (and much more confusing) response.
    expect(MAX_QUESTION_CHARS * 4).toBeLessThan(16 * 1024);
  });

  it("re-exports a working strip, not a stub", () => {
    // A smoke check that the copy is executable through the TS boundary; the
    // transform's real invariants live in the lambda and content suites.
    expect(stripGuideForTutor("# T\n\nUse `n_qubits` and **bold** text.")).toBe(
      "T\n\nUse n_qubits and bold text."
    );
  });
});
