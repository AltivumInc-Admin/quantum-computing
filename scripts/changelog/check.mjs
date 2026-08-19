#!/usr/bin/env node
/**
 * Did this pull request change something a learner can see without saying so?
 *
 * Reads the changed-file list on STDIN, one repo-relative path per line. git is
 * deliberately NOT invoked here: the repo's only other git assertion is a
 * workflow shell step (ci.yml's committed-lab-config pin), no script under
 * scripts/ shells out to git, and keeping git in the workflow is what leaves
 * rules.mjs unit-testable without a repository.
 *
 *   git diff --name-only HEAD^1 HEAD | node scripts/changelog/check.mjs
 *
 * Usage:  node scripts/changelog/check.mjs  < list-of-paths
 * Exit:   0 = fine (nothing learner-visible, or the changelog moved)
 *         1 = a learner-visible change with no changelog edit
 *         2 = could not check (empty stdin — never true of a real pull request)
 */
import { verdict, CHANGELOG_FILE } from "./rules.mjs";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

const result = verdict(input.split("\n"));

if (result.reason === "no-diff") {
  console.log("\n  Changelog guard: received an EMPTY diff on stdin.");
  console.log("  A pull request always changes at least one file, so this is a");
  console.log("  wiring fault — a shallow clone with no merge base, or the wrong");
  console.log("  ref — and not a clean result. Refusing to report a pass.\n");
  process.exit(2);
}

if (result.ok) {
  console.log(
    result.reason === "no-learner-paths"
      ? "\n  Changelog guard: nothing learner-visible in this diff.\n"
      : `\n  Changelog guard: ${result.offenders.length} learner-visible path(s), and ${CHANGELOG_FILE} moved.\n`,
  );
  process.exit(0);
}

console.log("\n  Changelog guard: this pull request changes what a learner sees,");
console.log("  and says nothing about it.\n");
for (const path of result.offenders) console.log(`    ${path}`);
console.log(`\n  Edit ${CHANGELOG_FILE} — one of two ways:\n`);
console.log("    1. Announce it. Add a CHANGELOG entry, and its Spanish twin in");
console.log("       web/src/lib/changelog-es.ts. Both are required to merge.");
console.log("    2. Or record that it needs no announcement, by appending to SILENT:");
console.log('         { pr: <number>, reason: "<why a learner cannot see this>" }\n');
console.log("  There is no bypass flag. Not announcing is a decision, and a");
console.log("  decision belongs in the diff where a reviewer can see it.\n");
process.exit(1);
