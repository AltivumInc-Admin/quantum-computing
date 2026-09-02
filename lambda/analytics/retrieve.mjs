/**
 * Getting ONE day out of Amplify, when Amplify will not always give you one.
 *
 * GenerateAccessLogs serves roughly a day per call and refuses windows it
 * considers too large — 7- and 14-day requests fail outright with `Unable to
 * complete request for the given time range`, and a single busy day can fail
 * the same way. scripts/analytics/backfill.mjs learned that against the real
 * API and recovers by halving the window and stitching the CSV halves back
 * together; the scheduled Lambda, written later against the same API, made one
 * call for the whole day and threw on anything that came back wrong.
 *
 * That asymmetry is not survivable: Amplify's retention is finite, so the first
 * day whose traffic exceeds the per-call size fails, ages out, and is gone. So
 * the recovery lives here, in one place both callers use — the same arrangement
 * classify.mjs already has for classification, where the point is that the
 * historical answer and the daily one cannot disagree.
 *
 * Pure of AWS: the caller supplies `fetchWindow(startIso, endIso) -> csvText`,
 * so the Lambda passes an SDK call and the ops script passes an aws-CLI call,
 * and neither this file nor a test of it needs credentials.
 */

/**
 * How Amplify says "that window is too big".
 *
 * Observed against the live API, not guessed. Anything else is a real failure
 * and must propagate: narrowing the window would turn a broken credential or a
 * wrong app id into four silent retries and a misleading final message.
 */
export const SIZE_REFUSAL = /reduce time range|Unable to complete request/i;

/**
 * Four halvings is a 90-minute window — well under any observed refusal, and a
 * bound on how long a doomed day may spend failing.
 */
export const MAX_BISECTIONS = 4;

/** Retrieve one day's CSV, halving the window when the API refuses its size. */
export async function fetchDayCsv(day, fetchWindow, options = {}) {
  const {
    depth = 0,
    startIso = `${day}T00:00:00Z`,
    endIso = `${day}T23:59:59Z`,
    maxBisections = MAX_BISECTIONS,
  } = options;

  try {
    return await fetchWindow(startIso, endIso);
  } catch (err) {
    // execFileSync puts the CLI's message on .stderr, the SDK on .message.
    const msg = String(err?.stderr ?? err?.message ?? err);
    if (!SIZE_REFUSAL.test(msg) || depth >= maxBisections) {
      throw new Error(msg.trim().split("\n").pop());
    }

    const midMs = (Date.parse(startIso) + Date.parse(endIso)) / 2;
    const mid = new Date(midMs).toISOString().replace(/\.\d{3}Z$/, "Z");
    const next = { depth: depth + 1, maxBisections };
    const a = await fetchDayCsv(day, fetchWindow, { ...next, startIso, endIso: mid });
    const b = await fetchDayCsv(day, fetchWindow, { ...next, startIso: mid, endIso });
    // Drop the second header so the halves concatenate into one valid CSV.
    return a + "\n" + b.split(/\r?\n/).slice(1).join("\n");
  }
}
