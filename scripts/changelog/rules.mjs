/**
 * Which paths are learner-visible, and does a diff owe the changelog an entry?
 *
 * Pure and dependency-free so rules.test.mjs can exercise it with no git, no
 * network and no node_modules — there is no package.json at the repo root and
 * the web CI job installs only web/node_modules.
 */

/**
 * A change under one of these is something a learner could see.
 *
 * Deliberately a literal list rather than configuration: widening it is a
 * decision, and a decision belongs in a diff. Trailing "/" means directory
 * prefix; anything else is an exact path.
 *
 * No test-file exclusions are needed, and that was checked rather than assumed:
 * there are zero *.test.* files anywhere under any of the seven curriculum
 * directories, and zero colocated *.test.ts(x) files under web/src (every web
 * test lives in web/__tests__, outside these roots). The seven curriculum
 * directories are not uniform, for the record: 00-prereqs through
 * 05-quantum-chemistry each hold notebooks/, scripts/, GUIDE.md and
 * GUIDE.es.md, but 06-hybrid-jobs holds algorithms/, containers/, notebooks/,
 * GUIDE.md and GUIDE.es.md instead — no scripts/ subdirectory at all — and is
 * equally test-free. Add an exclusion here if colocated tests are ever
 * introduced.
 *
 * THE lib/ ENTRIES ARE CONTENT, NOT PLUMBING. web/src/lib holds both, so it is
 * listed file by file rather than as a directory. Every file named below is
 * rendered, verbatim or nearly so, on a page a learner opens: pricing.ts is
 * TIERS, HARDWARE_RATES and TUTOR_RATES, which ARE the public /pricing page —
 * a repricing that nobody announces is precisely the rule 13 failure this
 * project has already lived through once. sections.ts, content.ts and
 * section-pitch.ts drive the curriculum catalog and its blurbs; runbook.ts,
 * credentials.ts and founding-ten.ts each back a rendered page. Nothing else
 * in lib/ is copy — circuit-store.ts, sha256.ts, the *-grade.ts graders and the
 * *-client.ts transports are machinery, and their changes are announced (or
 * not) by the components that render them.
 *
 * DELIBERATE EXCLUSIONS. Each of these is a decision, not an oversight:
 *
 *  - content/reps/*.json — UNWATCHED. content/reps/README.md documents "add one
 *    file here, open a pull request" as the community contribution path.
 *    Requiring a drive-by contributor to also write a bilingual changelog entry
 *    would close that path, and a guard that closes a contribution path is a
 *    guard that gets deleted.
 *  - web/public/ — UNWATCHED. It is generated JupyterLite and Pyodide build
 *    output that moves on every build. Watching it would fire on nearly every
 *    pull request, and a guard that cries wolf is a guard someone switches off.
 *  - web/src/lib/changelog-es.ts — UNWATCHED, and see CHANGELOG_FILE below.
 *
 * KNOWN BLIND SPOT, documented rather than solved: `git diff --name-only`
 * reports only the DESTINATION path of a rename it detects. Moving a file out
 * of a watched root (web/src/components/x.tsx -> lib/x.tsx) therefore shows up
 * as an unwatched path alone and slips through. Solving it means parsing
 * --name-status or turning rename detection off, which trades a rare miss for
 * a permanent complication in the one part of this that must stay obvious.
 */
export const LEARNER_VISIBLE = [
  "web/src/app/",
  "web/src/components/",
  "web/src/data/",
  "web/src/hooks/",
  "web/src/i18n/locales/",
  "web/src/lib/content.ts",
  "web/src/lib/credentials.ts",
  "web/src/lib/founding-ten.ts",
  "web/src/lib/glossary.ts",
  "web/src/lib/glossary-es.ts",
  "web/src/lib/pricing.ts",
  "web/src/lib/runbook.ts",
  "web/src/lib/section-pitch.ts",
  "web/src/lib/sections.ts",
  "00-prereqs/",
  "01-foundations/",
  "02-hardware/",
  "03-algorithms/",
  "04-quantum-ml/",
  "05-quantum-chemistry/",
  "06-hybrid-jobs/",
];

/**
 * The one file a learner-visible pull request must touch.
 *
 * Not changelog-es.ts: CHANGELOG and SILENT both live here, so this is the file
 * that moves under either outcome, and accepting the twin would let a
 * translation edit satisfy a guard about announcements.
 *
 * changelog-es.ts is also absent from LEARNER_VISIBLE, which is a decision and
 * not an oversight. Its strings are rendered to a learner, so the omission
 * looks wrong at first glance — but a pull request that touches ONLY the twin
 * is fixing the Spanish of an announcement that already shipped. That is a
 * correction to an existing announcement, not a new one, and demanding a fresh
 * entry for it would mean announcing that a typo was fixed in a translation.
 * A twin for a NEW entry arrives in the same pull request as the entry, which
 * this file already requires, and the bidirectional parity test refuses an
 * entry that has no twin.
 */
export const CHANGELOG_FILE = "web/src/lib/changelog.ts";

export function isLearnerVisible(path) {
  return LEARNER_VISIBLE.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}

/**
 * @param {string[]} paths repo-relative paths changed by the pull request
 * @returns {{ok: boolean, reason: string, offenders: string[]}}
 */
export function verdict(paths) {
  const changed = paths.map((p) => p.trim()).filter(Boolean);
  if (changed.length === 0) return { ok: false, reason: "no-diff", offenders: [] };

  const offenders = changed.filter(isLearnerVisible);
  if (offenders.length === 0) return { ok: true, reason: "no-learner-paths", offenders: [] };
  if (changed.includes(CHANGELOG_FILE)) {
    return { ok: true, reason: "changelog-touched", offenders };
  }
  return { ok: false, reason: "unannounced", offenders };
}
