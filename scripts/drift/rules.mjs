/**
 * The drift check's rules: what counts as source, which drift is HELD, when a
 * hold has gone stale, and what the run's verdict is.
 *
 * Pure and dependency-free so rules.test.mjs can exercise it with no AWS
 * credentials, no network and no node_modules — the same split
 * scripts/changelog already uses. check-lambda-drift.mjs is the I/O shell: it
 * downloads and unzips each artifact and hands the finished rows here.
 *
 * The split exists because the interesting cases are the ones a live run can
 * never rehearse on demand: a declared hold, a hold that stopped holding, a
 * function that could not be reached at all. Those are decided here, over
 * plain objects, and are therefore testable.
 *
 * A result row, as this module expects it:
 *   { fn, dir, ok, drifted[], missing[], lastModified }   checked
 *   { fn, dir, ok: false, error }                         could not be checked
 */
import { targetLabel } from "./account.mjs";

/** Hand-written source among these filenames: .mjs/.js at the top level, minus tests. */
export const sourceFiles = (names) =>
  names
    .filter((f) => /\.(mjs|js)$/.test(f))
    .filter((f) => !/\.test\.mjs$|^probe-|^verify-/.test(f));

/**
 * A row that compared NOTHING: no file was read on both sides.
 *
 * Zero comparisons satisfies "nothing differed", so without this a function
 * whose artifact unzipped into a nested directory, whose sources moved, or
 * whose zip fetched partially prints OK and lands in "All N unheld functions
 * match git" — a false green produced by the guard that exists to catch false
 * greens. A hold cannot excuse it either: a hold declares that DRIFT is
 * deliberate, and nothing here was compared closely enough to have drifted.
 */
export const isVacuous = (r) => !r.error && (r.compared ?? 0) === 0;

/** The HELD entry covering this function, if any. */
export const heldFor = (held, fn) => held.find((h) => h.fn.test(fn));

/**
 * A hold that no longer holds anything is stale, and a stale allowlist is how
 * a real gap eventually hides behind an entry nobody re-read.
 */
export const staleHolds = (held, results) =>
  held.filter((h) => !results.some((r) => !r.ok && !isVacuous(r) && h.fn.test(r.fn)));

/** The verdict for a finished run: exit code and the summary partitions. */
export function verdict(results, held) {
  const vacuous = results.filter(isVacuous);
  const bad = results.filter((r) => !r.ok && !isVacuous(r) && !heldFor(held, r.fn));
  const heldRows = results.filter((r) => !r.ok && !isVacuous(r) && heldFor(held, r.fn));
  // Reproduces the accumulation the download loop performed inline: a row that
  // could not be checked raises the code to 2, undeclared drift sets it to 1.
  let exitCode = 0;
  for (const r of results) {
    if (r.error) exitCode = Math.max(exitCode, 2);
    else if (isVacuous(r) || (!r.ok && !heldFor(held, r.fn))) exitCode = 1;
  }
  return { exitCode, bad, vacuous, held: heldRows, staleHolds: staleHolds(held, results) };
}

/**
 * The human report, as lines. Returned rather than printed so a test can read it.
 *
 * `target` is { region, accountVerified }: every run states which claim it is
 * making about WHERE it looked, because the same names exist in more than one
 * account and an unverified green is not evidence.
 */
export function render(results, held, target) {
  const lines = [`\n  Deployed-vs-git drift  (${targetLabel(target)})\n`];
  for (const r of results) {
    if (r.error) {
      lines.push(`  ??  ${r.fn.padEnd(34)} could not check — ${r.error}`);
      continue;
    }
    const vacuous = isVacuous(r);
    const hold = !vacuous && !r.ok && heldFor(held, r.fn);
    const mark = vacuous ? "VACUOUS" : r.ok ? "OK" : hold ? "HELD" : "DRIFT";
    // The compared count is on EVERY row, not just the empty ones: a number
    // quietly shrinking to one is the same fault caught a release earlier.
    lines.push(`  ${mark.padEnd(7)} ${r.fn.padEnd(34)} ${r.lastModified}  ${r.compared ?? 0} compared`);
    if (vacuous) {
      lines.push(`         NOTHING WAS COMPARED — this row says nothing about ${r.fn}.`);
      lines.push(`         Did the source directory move, or the package layout change?`);
    }
    for (const f of r.drifted) lines.push(`         DIFFERS from git: ${r.dir}/${f}`);
    if (r.missing.length) {
      lines.push(`         (not packaged, assumed ops-only: ${r.missing.join(", ")})`);
    }
    if (hold) {
      lines.push(`         HELD ON PURPOSE — do not deploy to clear this.`);
      lines.push(`         why:   ${hold.reason}`);
      lines.push(`         until: ${hold.clearsWhen}`);
    }
  }
  const v = verdict(results, held);
  if (v.vacuous.length) {
    lines.push(
      `\n  ${v.vacuous.length} of ${results.length} functions compared NOTHING. A zero-file comparison\n` +
        `  cannot match git and cannot differ from it — treat those rows as unchecked.`,
    );
  }
  if (v.bad.length) {
    lines.push(
      `\n  ${v.bad.length} of ${results.length} functions do NOT match git. Deploy them, or explain why not.\n`,
    );
  } else if (v.vacuous.length === 0) {
    // Only claimable when every row actually compared something.
    lines.push(
      `\n  All ${results.length - v.held.length} unheld functions match git.` +
        (v.held.length ? ` ${v.held.length} held on purpose (see above).\n` : `\n`),
    );
  }
  for (const h of v.staleHolds) {
    lines.push(
      `  NOTE: the HELD entry matching ${h.fn} no longer matches any drifting function.\n` +
        `        The hold has served its purpose — delete it from scripts/check-lambda-drift.mjs.\n`,
    );
  }
  return lines;
}
