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
 * there are zero colocated *.test.ts(x) files under web/src (every web test
 * lives in web/__tests__, outside these roots), and the seven curriculum
 * directories hold only notebooks/, scripts/, GUIDE.md and GUIDE.es.md. Add an
 * exclusion here if colocated tests are ever introduced.
 */
export const LEARNER_VISIBLE = [
  "web/src/app/",
  "web/src/components/",
  "web/src/i18n/locales/",
  "web/src/lib/glossary.ts",
  "web/src/lib/glossary-es.ts",
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
