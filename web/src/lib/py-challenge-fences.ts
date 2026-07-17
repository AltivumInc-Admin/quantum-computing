import fs from "fs";
import path from "path";
import { parseChallenge } from "./challenge-schema";
import { PY_REP_E2E_IDS, type PyRepId } from "./py-reps";

// Server-only (build-time) collector for the tier:"py" ```qchallenge fences
// actually authored in the lesson GUIDEs. The e2e fixture page renders the REAL
// shipped spec for each manifested id (never a hand-kept copy), so the fixture,
// the GUIDE, and web/e2e/py-reps.e2e.ts cannot drift: the browser grades exactly
// what a learner sees. Mirrors content.ts's repo-root read and guide-reps.test's
// fence regex.

const REPO_ROOT = path.resolve(process.cwd(), "..");
const FENCE_RE = /^```qchallenge\n([\s\S]*?)\n```/gm;

/** The raw fence body (the JSON the Challenge widget parses) for each manifested py Rep id. */
export function getPyChallengeFences(): { id: PyRepId; source: string }[] {
  const byId = new Map<string, string>();
  for (const entry of fs.readdirSync(REPO_ROOT)) {
    if (!/^\d\d-/.test(entry)) continue;
    const guide = path.join(REPO_ROOT, entry, "GUIDE.md");
    if (!fs.existsSync(guide)) continue;
    const text = fs.readFileSync(guide, "utf-8");
    for (let m = FENCE_RE.exec(text); m; m = FENCE_RE.exec(text)) {
      const body = m[1];
      const { spec } = parseChallenge(body);
      if (spec && spec.tier === "py") byId.set(spec.id, body);
    }
  }
  // Emit in manifest order; a missing id is a build-time failure (guide-reps.test
  // already guards the 1:1 match, so this should be unreachable).
  return PY_REP_E2E_IDS.map((id) => {
    const source = byId.get(id);
    if (!source) throw new Error(`py Rep "${id}" is in PY_REP_E2E_IDS but no tier:"py" GUIDE fence defines it`);
    return { id, source };
  });
}
