/**
 * The contribute-a-Rep CI gate: every JSON file in content/reps/ must be a
 * valid, GRADEABLE Rep (validated by the same parsers + grading kernels the
 * live widgets use), correctly named, and collision-free against every Rep or
 * card id already authored in a lesson GUIDE. This test runs in the Web CI
 * job, so a contribution PR fails loudly before review instead of shipping a
 * broken exercise.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { validateRep } from "@/lib/rep-schema";

const REPO_ROOT = path.join(__dirname, "../../..");
const REPS_DIR = path.join(REPO_ROOT, "content/reps");

const repFiles = readdirSync(REPS_DIR).filter((f) => f.endsWith(".json"));

// Directory hygiene: a `community-x.JSON`, `.jsonc`, or nested directory would
// silently escape the `.json` filter above — a maintainer promoting it would
// trust a validation that never ran. Everything in content/reps/ must be
// either the README or a validated lowercase-.json Rep.
it("content/reps contains only README.md and lowercase .json Reps", () => {
  for (const entry of readdirSync(REPS_DIR)) {
    expect(entry === "README.md" || /^[a-z0-9-]+\.json$/.test(entry) ? "" : entry).toBe("");
  }
});

/**
 * Every id authored in a lesson GUIDE. The GUIDEs only use `"id":` inside
 * widget fence specs (qcard + the graded Rep kinds registered in
 * rep-schema.ts FENCE_TOKENS), so a plain scan is a faithful extraction.
 */
function guideIds(): Map<string, string> {
  const ids = new Map<string, string>(); // id -> source file
  for (const entry of readdirSync(REPO_ROOT)) {
    if (!/^\d\d-/.test(entry)) continue;
    const guide = path.join(REPO_ROOT, entry, "GUIDE.md");
    if (!existsSync(guide)) continue;
    const text = readFileSync(guide, "utf-8");
    for (const m of text.matchAll(/"id"\s*:\s*"([^"]+)"/g)) {
      ids.set(m[1], `${entry}/GUIDE.md`);
    }
  }
  return ids;
}

describe("contributed Rep corpus (content/reps)", () => {
  it("contains at least the reference example", () => {
    expect(repFiles.length).toBeGreaterThan(0);
  });

  describe.each(repFiles)("%s", (file) => {
    const source = readFileSync(path.join(REPS_DIR, file), "utf-8");
    const { rep, error } = validateRep(source);

    it("is a valid, gradeable Rep", () => {
      expect(error).toBeUndefined();
      expect(rep).toBeDefined();
    });

    // The follow-on checks skip when validation failed — the failure above is
    // the actionable message; TypeError noise on rep!.id would bury it.
    it("is named after its id", () => {
      if (!rep) return;
      expect(file).toBe(`${rep.id}.json`);
    });

    it("uses the community-<topic>-<n> id convention (permanent storage keys)", () => {
      if (!rep) return;
      expect(rep.id).toMatch(/^community-[a-z][a-z0-9]*(-[a-z0-9]+)*-\d+$/);
    });
  });

  it("has no id collisions — within the corpus or against any GUIDE-authored id", () => {
    const seen = guideIds();
    for (const file of repFiles) {
      const { rep } = validateRep(readFileSync(path.join(REPS_DIR, file), "utf-8"));
      if (!rep) continue; // shape failures are reported by the per-file tests
      const clash = seen.get(rep.id);
      expect(clash ? `${rep.id} collides with ${clash}` : "").toBe("");
      seen.set(rep.id, `content/reps/${file}`);
    }
  });
});
