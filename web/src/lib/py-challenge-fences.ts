import fs from "fs";
import path from "path";
import { parseChallenge } from "./challenge-schema";
import { PY_REP_E2E_IDS, type PyRepId } from "./py-reps";

// Server-only (build-time) collectors for the executable fences actually
// authored in the lesson GUIDEs. Every e2e fixture page renders the REAL shipped
// source (never a hand-kept copy), so the fixture, the GUIDE and the spec that
// drives them cannot drift: the browser exercises exactly what a learner sees,
// and a fence that moves or disappears is a BUILD failure rather than a test
// that quietly keeps proving something no learner can reach. Mirrors content.ts's
// repo-root read and guide-reps.test's fence regexes.

const REPO_ROOT = path.resolve(process.cwd(), "..");
const FENCE_RE = /^```qchallenge\n([\s\S]*?)\n```/gm;
// The ```runnable token registered in widget-langs.ts and routed to
// RunnableEditor by widget-fence.tsx — the same fence tests/test_guide_runnable_fences.py
// validates and executes on the CPython side.
const RUNNABLE_FENCE_RE = /^```runnable\n([\s\S]*?)\n```/gm;

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

/**
 * The source of every ```runnable fence authored in `<section>/GUIDE.md`, in
 * document order.
 *
 * Throws when the section has no GUIDE or no runnable fence: the e2e fixture
 * page is the only caller, and a fixture that silently rendered nothing would
 * turn web/e2e/runnable-editor.e2e.ts into a test of an empty editor.
 */
export function getRunnableFences(section: string): string[] {
  const guide = path.join(REPO_ROOT, section, "GUIDE.md");
  if (!fs.existsSync(guide)) {
    throw new Error(`no GUIDE.md for section "${section}"`);
  }
  const text = fs.readFileSync(guide, "utf-8");
  const sources: string[] = [];
  for (let m = RUNNABLE_FENCE_RE.exec(text); m; m = RUNNABLE_FENCE_RE.exec(text)) {
    sources.push(m[1]);
  }
  if (sources.length === 0) {
    throw new Error(`section "${section}" has no \`\`\`runnable fence`);
  }
  return sources;
}
