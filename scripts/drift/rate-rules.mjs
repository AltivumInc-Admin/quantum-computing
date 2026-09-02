/**
 * The rate-parity check's rules: what a read value means, and what a set of
 * rows says about rule 5.
 *
 * Pure and dependency-free so rate-rules.test.mjs can exercise it with no AWS
 * credentials, no network and no node_modules — the same split
 * scripts/changelog already uses. check-rate-parity.mjs is the I/O shell: it
 * asks Lambda for each function's configured value and hands the rows here.
 *
 * VALUE-BLIND, like its shell (rule 6 — this output lands in CI logs). The
 * value crosses this module only as an equality operand: classify() reduces it
 * to a state name, and verdict() takes a COUNT of distinct values rather than
 * the values themselves, so nothing here can print one by accident.
 */

/**
 * `--output text` prints "None" for a missing key — and "None" is also not a
 * usable factor, so collapsing the two is safe as well as convenient.
 */
export const normalizeRateCard = (out) => {
  const trimmed = String(out ?? "").trim();
  return trimmed === "None" || trimmed === "" ? undefined : trimmed;
};

/** Absent, present and usable, or present and refused by the handler's gate. */
export function classify(value) {
  if (value === undefined) return "ABSENT";
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? "PRESENT" : "PRESENT-UNUSABLE";
}

/**
 * The verdict over the finished rows.
 *
 * `rows` are { fn, state } — no values. `distinctValues` is the count the
 * caller computed in memory and discarded, which is all equality needs.
 */
export function verdict(rows, distinctValues) {
  const states = new Set(rows.map((r) => r.state));

  if (states.has("PRESENT-UNUSABLE")) {
    return {
      exitCode: 1,
      lines: [
        "\n  FAIL: a deployed RATE_CARD would be refused by the handler's gate.",
        "  Paid surfaces are refusing right now while looking configured.\n",
      ],
    };
  }
  if (states.size > 1) {
    return {
      exitCode: 1,
      lines: [
        "\n  FAIL: one surface is configured and the other is not (rule 5).",
        "  Both must flip in the same cutover — see the billing runbook.\n",
      ],
    };
  }
  if (distinctValues > 1) {
    return {
      exitCode: 1,
      lines: [
        "\n  FAIL: the two surfaces carry DIFFERENT values (rule 5).",
        "  One wallet + two conversion rates = every rational learner spends",
        "  through the cheaper surface. Redeploy both from the same secret.\n",
      ],
    };
  }
  return {
    exitCode: 0,
    lines: [
      states.has("ABSENT")
        ? "\n  OK: metering is off on both surfaces — consistent.\n"
        : "\n  OK: both surfaces carry the identical rate configuration (MATCH).\n",
    ],
  };
}
