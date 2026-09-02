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

/** Hand-written source among these filenames: .mjs/.js at the top level, minus tests. */
export const sourceFiles = (names) =>
  names
    .filter((f) => /\.(mjs|js)$/.test(f))
    .filter((f) => !/\.test\.mjs$|^probe-|^verify-/.test(f));

/** The HELD entry covering this function, if any. */
export const heldFor = (held, fn) => held.find((h) => h.fn.test(fn));

/**
 * A hold that no longer holds anything is stale, and a stale allowlist is how
 * a real gap eventually hides behind an entry nobody re-read.
 */
export const staleHolds = (held, results) =>
  held.filter((h) => !results.some((r) => !r.ok && h.fn.test(r.fn)));

/** The verdict for a finished run: exit code and the summary partitions. */
export function verdict(results, held) {
  const bad = results.filter((r) => !r.ok && !heldFor(held, r.fn));
  const heldRows = results.filter((r) => !r.ok && heldFor(held, r.fn));
  // Reproduces the accumulation the download loop performed inline: a row that
  // could not be checked raises the code to 2, undeclared drift sets it to 1.
  let exitCode = 0;
  for (const r of results) {
    if (r.error) exitCode = Math.max(exitCode, 2);
    else if (!r.ok && !heldFor(held, r.fn)) exitCode = 1;
  }
  return { exitCode, bad, held: heldRows, staleHolds: staleHolds(held, results) };
}

/** The human report, as lines. Returned rather than printed so a test can read it. */
export function render(results, held, region) {
  const lines = [`\n  Deployed-vs-git drift  (region ${region})\n`];
  for (const r of results) {
    if (r.error) {
      lines.push(`  ??  ${r.fn.padEnd(34)} could not check — ${r.error}`);
      continue;
    }
    const hold = !r.ok && heldFor(held, r.fn);
    const mark = r.ok ? "OK" : hold ? "HELD" : "DRIFT";
    lines.push(`  ${mark.padEnd(6)} ${r.fn.padEnd(34)} ${r.lastModified}`);
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
  lines.push(
    v.bad.length === 0
      ? `\n  All ${results.length - v.held.length} unheld functions match git.` +
          (v.held.length ? ` ${v.held.length} held on purpose (see above).\n` : `\n`)
      : `\n  ${v.bad.length} of ${results.length} functions do NOT match git. Deploy them, or explain why not.\n`,
  );
  for (const h of v.staleHolds) {
    lines.push(
      `  NOTE: the HELD entry matching ${h.fn} no longer matches any drifting function.\n` +
        `        The hold has served its purpose — delete it from scripts/check-lambda-drift.mjs.\n`,
    );
  }
  return lines;
}
