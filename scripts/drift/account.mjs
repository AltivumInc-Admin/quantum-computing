/**
 * WHICH ACCOUNT is this report about?
 *
 * Both drift guards target a function by NAME plus region, and the account
 * comes entirely from ambient credentials. Since the QL-Prod cutover the same
 * eleven names exist in us-east-2 in TWO accounts, and this machine's default
 * profile is the Altivum one — so `make drift` with no profile produces a
 * confidently green report about an account that no longer serves learners,
 * and nightly CI reports on whatever AWS_DRIFT_ROLE_ARN happens to name. A
 * green run that cannot say which account it read is not evidence.
 *
 * The expectation is read from the environment (DRIFT_EXPECT_ACCOUNT), never
 * from this file: account numbers do not go in a public repo. And the check is
 * VALUE-BLIND for the same reason — what prints is "account verified",
 * "account unverified" or REFUSING, never an id from either side.
 *
 * Unset is not a failure. It is the honest state a fresh clone is in, and it
 * says so in the header rather than claiming a verification it did not do —
 * the same skip-cleanly-if-unset shape drift.yml already uses for its role.
 *
 * Pure: the caller resolves the real account (sts get-caller-identity) and
 * hands both strings here.
 */

/**
 * Compare the resolved account against the expectation.
 *
 * Returns { verified, refuse, lines }: `refuse` means stop before reporting
 * anything, because the report would describe the wrong account.
 */
export function accountCheck(expected, actual) {
  const want = String(expected ?? "").trim();
  if (!want) {
    return {
      verified: false,
      refuse: false,
      lines: [
        "  NOTE: DRIFT_EXPECT_ACCOUNT is unset, so this run cannot say WHICH account it",
        "        read. The same function names exist in more than one account — set the",
        "        variable to the account this report is supposed to describe.",
      ],
    };
  }
  if (String(actual ?? "").trim() !== want) {
    return {
      verified: false,
      refuse: true,
      lines: [
        "  REFUSING: the credentials in scope answer for a different account than",
        "            DRIFT_EXPECT_ACCOUNT names. A report about the wrong account is",
        "            worse than no report — it reads exactly like a clean one.",
        "            Check your profile (--profile / AWS_PROFILE), then re-run.",
      ],
    };
  }
  return { verified: true, refuse: false, lines: [] };
}

/** How a report header names its target. Value-blind: region only, plus a claim. */
export const targetLabel = ({ region, accountVerified }) =>
  `region ${region}, account ${accountVerified ? "verified" : "unverified"}`;
