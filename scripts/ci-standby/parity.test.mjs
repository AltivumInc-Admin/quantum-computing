/**
 * Is the CodeBuild standby still a mirror of ci.yml?
 *
 * infra/ci-standby/template.yaml carries its buildspec INLINE, on purpose: the
 * standby has to build any commit, and must not be breakable by a pull request
 * that edits a buildspec file. The price is drift, and nothing in the
 * repository compared the mirror to .github/workflows/ci.yml, so by 2026-09-06
 * it was five weeks behind. Its script-guard step ran
 * `node --test scripts/founding-credit/*.test.mjs` (1 of 13 suites, through
 * the bare pattern that exits 0 on no match under Node 22+) while ci.yml
 * discovered every suite with find and refused to pass on zero files; its
 * Lambda loop was a literal list; the KaTeX render-path assertion and the
 * changelog guard did not exist in it at all. A standby that gates merges on
 * less than the primary is a weaker gate that LOOKS like the same gate, which
 * is the one property a standby must never have.
 *
 * So the expected shape is DERIVED from ci.yml itself. Every `run:` step of
 * every job must appear in the buildspec as the same command lines under the
 * same working directory, or through one of the translations spelled out
 * below with a reason, or be excused by name with a reason the template also
 * states. A new ci.yml job or step therefore fails here until the mirror
 * carries it. No AWS, no network, no node_modules: this is a property of two
 * files in the repository plus `ls lambda/`.
 *
 * Keyed on COMMANDS, not comments, so the template's prose can be edited
 * freely. The two exceptions are declarations with a fixed grammar, and each
 * failure names the line to fix: the `# Mirror of ... (jobs: ...)` header, and
 * the by-name mention of every excused step.
 *
 * To watch it bite, point it at the template as it stood before this file
 * existed (dd918c2 is main on 2026-09-06):
 *   git show dd918c2:infra/ci-standby/template.yaml > /tmp/old-standby.yaml
 *   CI_STANDBY_TEMPLATE=/tmp/old-standby.yaml node --test scripts/ci-standby/parity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

const TEMPLATE_PATH = process.env.CI_STANDBY_TEMPLATE ?? join(REPO, "infra", "ci-standby", "template.yaml");
const template = readFileSync(TEMPLATE_PATH, "utf8");
const workflow = read(".github/workflows/ci.yml");
const verifyScript = read("scripts/verify-founding-ten.mjs");
const failover = read("infra/ci-standby/failover.sh");

/* --------------------------------------------------------------- the excuses */

/**
 * `uses:` steps the CodeBuild project provides by construction rather than by
 * command: the Source clones, `runtime-versions` installs the pinned runtimes,
 * and the S3 cache stands in for actions/cache. Anything else a step `uses:`
 * must be excused below, by name, with a reason.
 */
const PLUMBING = ["actions/checkout", "actions/setup-python", "actions/setup-node", "actions/cache"];

/**
 * ci.yml steps the standby deliberately does NOT run. Each needs a reason here
 * AND its name quoted in the buildspec, so the template itself says what it
 * skips; a reader of the stack must not need this file to learn that a red
 * browser suite leaves no report behind on CodeBuild.
 */
const NOT_MIRRORED = [
  {
    step: "Resolve the Playwright version",
    reason:
      "writes to $GITHUB_OUTPUT to key actions/cache on the resolved @playwright/test version; " +
      "CodeBuild caches /root/.cache/ms-playwright by path and has no output to key",
  },
  {
    step: "Upload the Playwright report and traces",
    reason:
      "actions/upload-artifact has no CodeBuild counterpart without an artifacts bucket; " +
      "the gap is stated in the buildspec rather than faked with an empty step",
  },
];

/* ------------------------------------------------------------- ci.yml parser */

const indentOf = (line) => line.length - line.trimStart().length;

/**
 * ci.yml's jobs, read line by line. Not a YAML parser: this file has no
 * dependencies, and the workflow's shape (jobs at 2 spaces, job keys at 4,
 * `- ` steps at 6, step keys at 8, block content deeper) is stable enough that
 * a general parser would be more code than the guard. The vacuity test below
 * asserts the parser still sees what it expects, so a reshaped workflow fails
 * loudly instead of matching nothing.
 */
function parseWorkflow(text) {
  const lines = text.split("\n");
  const jobsAt = lines.indexOf("jobs:");
  assert.notEqual(jobsAt, -1, "ci.yml has no top-level `jobs:` key");
  const jobs = [];
  let job = null;
  let section = null;
  let step = null;
  let block = null; // { keyIndent, indent, lines } while inside a `run: |` scalar
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = indentOf(line);
    if (block) {
      if (trimmed === "") {
        block.lines.push("");
        continue;
      }
      if (block.indent === null && indent > block.keyIndent) block.indent = indent;
      if (block.indent !== null && indent >= block.indent) {
        block.lines.push(line.slice(block.indent));
        continue;
      }
      block = null;
    }
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (indent === 0) break; // the next top-level key
    if (indent === 2) {
      job = { key: trimmed.replace(/:$/, ""), name: null, workingDirectory: "", matrixDirs: null, steps: [] };
      jobs.push(job);
      section = null;
      step = null;
      continue;
    }
    if (indent === 4) {
      section = trimmed.replace(/:.*$/, "");
      const name = trimmed.match(/^name: (.+)$/)?.[1];
      if (name) job.name = name;
      continue;
    }
    if (section === "defaults") {
      const wd = trimmed.match(/^working-directory: (.+)$/)?.[1];
      if (wd) job.workingDirectory = wd;
      continue;
    }
    if (section === "strategy") {
      const dirs = trimmed.match(/^dir: \[(.*)\]$/)?.[1];
      if (dirs !== undefined) job.matrixDirs = dirs.split(",").map((d) => d.trim()).filter(Boolean);
      continue;
    }
    if (section !== "steps") continue;
    let keyLine = null;
    if (indent === 6 && trimmed.startsWith("- ")) {
      step = { name: null, uses: null, run: null, workingDirectory: job.workingDirectory, if: null };
      job.steps.push(step);
      keyLine = trimmed.slice(2);
    } else if (indent === 8) {
      keyLine = trimmed;
    } else {
      continue; // nested `with:` / `env:` content
    }
    const m = keyLine.match(/^([\w-]+):(?: (.*))?$/);
    if (!m) continue;
    const [, key, value = ""] = m;
    if (key === "run") {
      if (value === "|") {
        block = { keyIndent: 8, indent: null, lines: [] };
        step.run = block.lines;
      } else {
        step.run = [value];
      }
    } else if (key === "name") step.name = value;
    else if (key === "uses") step.uses = value;
    else if (key === "if") step.if = value;
    else if (key === "working-directory") step.workingDirectory = value;
  }
  return jobs;
}

/** A step's command lines: what the shell runs, with comments and blanks dropped. */
const stepCommands = (step) => (step.run ?? []).map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));

const workflowEnv = {
  python: workflow.match(/^  PYTHON_VERSION: "([^"]+)"$/m)?.[1],
  node: workflow.match(/^  NODE_VERSION: "([^"]+)"$/m)?.[1],
};

/* ---------------------------------------------------------- buildspec parser */

/** The inline `BuildSpec: |` scalar, dedented to column zero; null when absent. */
function extractBuildSpec(text) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => /^ *BuildSpec: \|$/.test(l));
  if (at === -1) return null;
  const markerIndent = indentOf(lines[at]);
  const body = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() !== "" && indentOf(line) <= markerIndent) break;
    body.push(line);
  }
  const contentIndent = Math.min(...body.filter((l) => l.trim() !== "").map(indentOf));
  return body.map((l) => (l.trim() === "" ? "" : l.slice(contentIndent))).join("\n");
}

/**
 * The buildspec's command entries in order: `{ single }` for a one-line
 * command, `{ block }` for a `- |` scalar as its non-comment, trimmed lines.
 * Only entries under a `commands:` key count; cache paths and runtime pins
 * are not commands.
 */
function commandEntries(spec) {
  const lines = spec.split("\n");
  const entries = [];
  let lastKey = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (!trimmed.startsWith("- ")) {
      if (trimmed.endsWith(":")) lastKey = trimmed.slice(0, -1);
      continue;
    }
    if (lastKey !== "commands") continue;
    const entryIndent = indentOf(line);
    const text = trimmed.slice(2);
    if (text !== "|") {
      entries.push({ single: text });
      continue;
    }
    const block = [];
    while (i + 1 < lines.length && (lines[i + 1].trim() === "" || indentOf(lines[i + 1]) > entryIndent)) {
      i += 1;
      const t = lines[i].trim();
      if (t !== "" && !t.startsWith("#")) block.push(t);
    }
    entries.push({ block });
  }
  return entries;
}

const spec = extractBuildSpec(template);
const entries = spec === null ? [] : commandEntries(spec);
const allLines = entries.flatMap((e) => e.block ?? [e.single]);
const jobs = parseWorkflow(workflow);

/* ------------------------------------------------------------ the matcher */

const cdLine = (wd) => `cd "$CODEBUILD_SRC_DIR${wd === "" || wd === "." ? "" : `/${wd}`}"`;

/**
 * Where one ci.yml command appears in the buildspec under the given working
 * directory: either a one-line entry `cd "<dir>" && <command>`, or a line of a
 * block whose first line is `cd "<dir>"`. The directory is part of the match
 * on purpose: `npm test` at the repository root and `npm test` in web/ are
 * different steps.
 */
function positionsOf(wd, command) {
  const out = [];
  entries.forEach((entry, e) => {
    if (entry.single !== undefined) {
      if (entry.single === `${cdLine(wd)} && ${command}`) out.push([e, 0]);
    } else if (entry.block[0] === cdLine(wd)) {
      entry.block.forEach((line, l) => {
        if (l > 0 && line === command) out.push([e, l]);
      });
    }
  });
  return out;
}

/** The first of a step's commands the buildspec does not carry in order, or null. */
function unmirrored(step) {
  let after = [-1, -1];
  for (const command of stepCommands(step)) {
    const next = positionsOf(step.workingDirectory, command).find(
      ([e, l]) => e > after[0] || (e === after[0] && l > after[1]),
    );
    if (!next) return command;
    after = next;
  }
  return null;
}

/* ---------------------------------------------------------- the translations */

/**
 * Steps whose CodeBuild form is deliberately NOT the ci.yml command, each with
 * the reason and an assertion on the form it takes instead. A translation is
 * only valid while the condition it rests on still holds in ci.yml, which is
 * why each one also checks the ci.yml side.
 */
const TRANSLATED = {
  "Changelog guard": {
    reason:
      "ci.yml diffs HEAD^1..HEAD, which is the base only because Actions checks out the pull " +
      "request's MERGE commit; CodeBuild checks out refs/pull/N/head, where HEAD^1 is the " +
      "branch's previous commit, so the standby fetches the base and diffs from the merge-base",
    check(step) {
      assert.equal(
        step.if,
        "github.event_name == 'pull_request'",
        "ci.yml no longer gates the changelog guard on pull_request; the standby's pr/* gate is not a translation of that any more",
      );
      assert.ok(
        stepCommands(step)[0]?.endsWith("| node scripts/changelog/check.mjs"),
        "ci.yml's changelog guard no longer pipes into scripts/changelog/check.mjs; the translation below assumes it does",
      );
      const block = entries.find((e) => e.block?.some((l) => l.includes("node scripts/changelog/check.mjs")))?.block;
      assert.ok(block, "no buildspec block runs scripts/changelog/check.mjs: the changelog guard is not mirrored");
      // Gated on a pull request, the way ci.yml's `if:` gates it.
      assert.ok(block.includes('case "${CODEBUILD_SOURCE_VERSION:-}" in') && block.includes("pr/*)"),
        "the mirrored changelog guard is not gated on a pr/N source version");
      // Diffs from the merge-base with a freshly fetched base, never HEAD^1.
      assert.ok(
        block.some((l) => /^git fetch --no-tags origin "\+\$\{base\}:refs\/remotes\/origin\/changelog-base" \|\| exit 1$/.test(l)),
        "the mirrored changelog guard does not fetch the base branch (with ${base} braced: an unbraced $base:r is a zsh modifier)",
      );
      assert.ok(block.some((l) => /^merge_base=\$\(git merge-base refs\/remotes\/origin\/changelog-base HEAD\) \|\| exit 1$/.test(l)),
        "the mirrored changelog guard does not compute the merge-base");
      assert.ok(
        block.some((l) => /^\( set -o pipefail; git -c core\.quotePath=false diff --name-only "\$merge_base" HEAD \| node scripts\/changelog\/check\.mjs \)$/.test(l)),
        "the mirrored changelog guard must diff merge-base..HEAD under pipefail with core.quotePath=false, exactly as ci.yml's step does modulo the range",
      );
      assert.equal(allLines.find((l) => /HEAD\^1/.test(l)), undefined,
        "HEAD^1 appears in the buildspec: on CodeBuild's head checkout that is the branch's previous commit, not the base");
      // The two settings the diff depends on: full history, and a shell with pipefail.
      assert.match(template, /^\s+GitCloneDepth: 0$/m,
        "GitCloneDepth is not 0: a shallow clone has no history to find the merge-base in");
      assert.match(spec, /^  shell: bash$/m,
        "the buildspec does not select bash: dash has no `set -o pipefail`, so a failing git diff would be swallowed");
    },
  },
};

/**
 * The lambdas job is a matrix, one job per directory; the standby is one
 * sequential build, so it loops. The loop is asserted structurally below.
 */
const TRANSLATED_JOBS = {
  lambdas: {
    reason: "a matrix job becomes a loop over the directories under lambda/, derived on disk",
    loopLine: '(cd "lambda/$d" && npm ci && npm test) || exit 1',
  },
};

/* ------------------------------------------------------------- vacuity guards */

test("the template carries an inline buildspec (this guard must not no-op)", () => {
  // Every assertion below reads `entries`; an absent or unparseable buildspec
  // must fail here, by name, not pass everything vacuously.
  assert.ok(spec !== null, `${TEMPLATE_PATH} has no \`BuildSpec: |\` block`);
  assert.ok(entries.length >= 20, `expected at least 20 command entries in the buildspec, saw ${entries.length}`);
  assert.ok(entries.some((e) => e.single === 'cd "$CODEBUILD_SRC_DIR/web" && npm test'));
});

test("the ci.yml parser still sees the workflow (this guard must not no-op)", () => {
  // A reshaped ci.yml that this line-oriented parser no longer reads would
  // make every per-step test below disappear. Pin what it must find.
  assert.ok(jobs.length >= 4, `expected at least 4 jobs in ci.yml, saw ${jobs.length}`);
  for (const job of jobs) {
    assert.ok(job.name, `job ${job.key} has no name`);
    assert.ok(job.steps.length > 0, `job ${job.key} has no steps`);
  }
  assert.equal(workflowEnv.python?.length > 0 && workflowEnv.node?.length > 0, true, "ci.yml's PYTHON_VERSION / NODE_VERSION were not read");
  const web = jobs.find((j) => j.key === "web");
  const guard = web?.steps.find((s) => s.name === "Script guard tests");
  assert.ok(guard, "ci.yml's web job has no `Script guard tests` step");
  assert.equal(guard.workingDirectory, ".");
  assert.ok(stepCommands(guard).includes("node --test $files"), "the script-guard step's block was not read");
  const lambdas = jobs.find((j) => j.key === "lambdas");
  assert.ok(lambdas?.matrixDirs?.length > 0, "the lambdas job's `dir: [...]` matrix was not read");
});

/* ------------------------------------------------------- one test per step */

for (const job of jobs) {
  for (const step of job.steps) {
    const label = step.name ?? step.uses ?? "(unnamed)";
    test(`ci.yml ${job.key} / ${label} has a counterpart in the standby`, () => {
      // A `uses:` step is either runner plumbing the project provides by
      // construction, or a GitHub-only action that must be excused by name.
      if (step.uses) {
        const action = step.uses.replace(/@.*$/, "");
        if (PLUMBING.includes(action)) return;
        const excuse = NOT_MIRRORED.find((n) => n.step === step.name);
        assert.ok(excuse, `ci.yml step "${label}" uses ${step.uses}, which CodeBuild cannot run and NOT_MIRRORED does not excuse`);
        assert.ok(spec.includes(`"${step.name}"`), `the buildspec does not name the excused step "${step.name}": say what is skipped in the template, not only here`);
        return;
      }
      const excuse = NOT_MIRRORED.find((n) => n.step === step.name);
      if (excuse) {
        assert.ok(excuse.reason.length > 40, `"${step.name}" needs a written reason`);
        assert.ok(spec.includes(`"${step.name}"`), `the buildspec does not name the excused step "${step.name}"`);
        return;
      }
      if (TRANSLATED[step.name]) {
        TRANSLATED[step.name].check(step);
        return;
      }
      if (TRANSLATED_JOBS[job.key]) {
        // Each of the matrix job's commands must be inside the derived loop.
        const { loopLine } = TRANSLATED_JOBS[job.key];
        const body = loopLine.match(/^\(cd "lambda\/\$d" && (.+)\) \|\| exit 1$/)[1].split(" && ");
        for (const command of stepCommands(step)) {
          assert.ok(body.includes(command), `ci.yml's lambdas job runs \`${command}\` per directory; the standby's loop line \`${loopLine}\` does not`);
        }
        return;
      }
      // Verbatim: every command line, under the step's directory, in order.
      const missing = unmirrored(step);
      assert.equal(
        missing,
        null,
        `ci.yml ${job.key} / "${label}" runs \`${missing}\` in ${step.workingDirectory || "the repository root"}; ` +
          `the standby buildspec has no matching \`${cdLine(step.workingDirectory)} && ...\` line or block, ` +
          "or has it out of order. Mirror the step (or add a translation / excuse here with a reason).",
      );
    });
  }
}

/* ----------------------------------------------------- structural assertions */

test("script guards are discovered with find, and zero files is a failure", () => {
  // The 2026-09-06 drift itself. A literal `node --test <pattern>` runs one
  // suite and, on Node 22+, passes on no match at all; and a discovery whose
  // empty result is not a failure passes vacuously the day the suites move.
  const findLine = "files=$(find scripts -type f -name '*.test.mjs' | sort)";
  const block = entries.find((e) => e.block?.includes(findLine))?.block;
  assert.ok(block, `no buildspec block runs \`${findLine}\`: the script guards are not discovered the way ci.yml and \`make guards\` discover them`);
  const findAt = block.indexOf(findLine);
  const ifAt = block.indexOf('if [ -z "$files" ]; then');
  assert.notEqual(ifAt, -1, "the discovery block never tests for zero files");
  const fiAt = block.indexOf("fi", ifAt);
  const runAt = block.indexOf("node --test $files");
  assert.ok(findAt < ifAt && ifAt < fiAt && fiAt < runAt, "the discovery block is not find, then the zero-file check, then node --test");
  assert.ok(block.slice(ifAt, fiAt).includes("exit 1"), "the zero-file branch does not exit 1: an empty discovery would pass");
});

test("no pattern reaches node --test; only the discovered file list does", () => {
  // The exact shape that drifted: `node --test scripts/<dir>/*.test.mjs`.
  const offenders = allLines.filter((l) => /\bnode --test\b/.test(l) && l !== "node --test $files");
  assert.deepEqual(offenders, [], "node --test is handed something other than the discovered $files");
});

test("every directory under lambda/ is exercised: derived on disk, refused when empty", () => {
  // A literal list is how lambda/stripe merged ungated for three weeks.
  // `\\;` here is `\;` in the buildspec: the shell needs the backslash so find,
  // not the shell, sees the `;` that terminates -exec.
  const findLine = "dirs=$(find lambda -mindepth 1 -maxdepth 1 -type d -exec basename {} \\; | sort)";
  const block = entries.find((e) => e.block?.includes(findLine))?.block;
  assert.ok(block, `no buildspec block derives the Lambda directories with \`${findLine}\``);
  const ifAt = block.indexOf('if [ -z "$dirs" ]; then');
  assert.notEqual(ifAt, -1, "the Lambda loop never refuses an empty directory list");
  assert.ok(block.slice(ifAt, block.indexOf("fi", ifAt)).includes("exit 1"), "the empty-list branch does not exit 1");
  assert.ok(block.includes("for d in $dirs; do"), "the loop does not iterate the derived list");
  assert.ok(block.includes(TRANSLATED_JOBS.lambdas.loopLine), `the loop body is not \`${TRANSLATED_JOBS.lambdas.loopLine}\``);
  const literal = allLines.find((l) => /^for d in (?!\$)/.test(l));
  assert.equal(literal, undefined, `a literal Lambda list is back in the buildspec: \`${literal}\``);
});

test("ci.yml's lambda matrix names exactly the directories under lambda/", () => {
  // failover.sh refuses to stand down on this mismatch; catching it at merge
  // time means the gate is never narrower than lambda/ in the first place,
  // and the standby's derived loop never runs a suite the matrix omits.
  const onDisk = readdirSync(join(REPO, "lambda"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const matrix = [...jobs.find((j) => j.key === "lambdas").matrixDirs].sort();
  assert.deepEqual(matrix, onDisk, "ci.yml's `dir: [...]` matrix and `ls lambda/` disagree: add the directory to the matrix (or delete the directory)");
});

test("the runtime pins match ci.yml's env", () => {
  // A NODE_VERSION bump mirrored nowhere: the standby would test on a runtime
  // the primary no longer uses, and the node --test glob trap is version-bound.
  assert.equal(spec.match(/^\s*python: (\S+)$/m)?.[1], workflowEnv.python, "runtime-versions.python differs from ci.yml's PYTHON_VERSION");
  assert.equal(spec.match(/^\s*nodejs: (\S+)$/m)?.[1], workflowEnv.node, "runtime-versions.nodejs differs from ci.yml's NODE_VERSION");
});

test("the buildspec declares exactly ci.yml's jobs", () => {
  // The README's "same matrix" claim, made checkable. Fixed grammar on
  // purpose: `# Mirror of .github/workflows/ci.yml (jobs: a, b, c)`. Any other
  // comment in the template is free text.
  const declared = spec.match(/^# Mirror of \.github\/workflows\/ci\.yml \(jobs: ([^)]*)\)/m)?.[1];
  assert.ok(declared !== undefined, "the buildspec must open with a `# Mirror of .github/workflows/ci.yml (jobs: ...)` line naming every ci.yml job key");
  assert.deepEqual(
    declared.split(",").map((s) => s.trim()).sort(),
    jobs.map((j) => j.key).sort(),
    "the jobs the buildspec claims to mirror are not ci.yml's job keys",
  );
});

test("the founding-ten pool is one parameter, QL-Prod's, and the script's default agrees", () => {
  // The pool the IAM statement scopes, the pool the build env hands the
  // script, and the script's own fallback were three literals; the first two
  // named the Altivum-era pool, which does not exist in QL-Prod.
  const RETIRED_POOL = "us-east-2_aRydPmAjj";
  const paramDefault = template.match(/^  FoundingTenUserPoolId:\n(?:    .*\n)*?    Default: (\S+)$/m)?.[1];
  assert.ok(paramDefault, "the template has no FoundingTenUserPoolId parameter with a Default");
  assert.match(
    template,
    /Resource: !Sub arn:aws:cognito-idp:us-east-2:\$\{AWS::AccountId\}:userpool\/\$\{FoundingTenUserPoolId\}/,
    "the founding-ten-verify statement does not scope its Resource to ${FoundingTenUserPoolId}",
  );
  assert.match(
    template,
    /- Name: QUANTUM_USER_POOL_ID\n\s+Value: !Ref FoundingTenUserPoolId/,
    "the build environment does not pass FoundingTenUserPoolId as QUANTUM_USER_POOL_ID, so the script would read a different pool than the policy grants",
  );
  const scriptDefault = verifyScript.match(/const POOL_ID = process\.env\.QUANTUM_USER_POOL_ID \?\? "([^"]+)"/)?.[1];
  assert.equal(scriptDefault, paramDefault, "scripts/verify-founding-ten.mjs's default pool and the template's parameter default differ");
  assert.notEqual(paramDefault, RETIRED_POOL, "the pool default is the retired Altivum-era pool");
  assert.doesNotMatch(template, new RegExp(RETIRED_POOL), "the retired pool id is back in the template");
  assert.doesNotMatch(verifyScript, new RegExp(RETIRED_POOL), "the retired pool id is back in the verify script");
  assert.ok(
    entries.some((e) => e.single === 'cd "$CODEBUILD_SRC_DIR" && node scripts/verify-founding-ten.mjs'),
    "the buildspec no longer runs scripts/verify-founding-ten.mjs; the pool grant would be dead weight and the badge check would run nowhere",
  );
});

test("the commit-status context is the one failover.sh points the gate at", () => {
  // Renamed on one side only, `engage` would require a context the project
  // never reports, and the outage becomes a permanent merge freeze.
  const context = template.match(/^\s+Context: (.+)$/m)?.[1];
  const shell = failover.match(/^STANDBY_CONTEXT="([^"]+)"$/m)?.[1];
  assert.ok(context && shell, "could not read the status context from both files");
  assert.equal(context, shell, "template BuildStatusConfig.Context and failover.sh STANDBY_CONTEXT differ");
});
