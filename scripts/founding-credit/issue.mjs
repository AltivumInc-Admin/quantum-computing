/**
 * Founding-cohort credit issuance — THE ONE APPROVED EXCEPTION.
 *
 * ============================ READ THIS FIRST ============================
 * lambda/stripe/index.mjs states, correctly, that nothing in the billing
 * Lambda ever adds credits a learner did not pay for. That invariant is real
 * and still holds: this file is not the billing Lambda. It is an operator
 * script, run by hand, once, against a roster reviewed in git.
 *
 * The founder approved ONE bounded gift — 1,000 credits to the first 20
 * learners, a $200 ceiling — as a growth cost, explicitly NOT a free tier and
 * explicitly not a licence for a second cohort. If you are reading this
 * because the "no free credits" rule looks violated: it is not. Do not delete
 * this script to resolve the apparent contradiction.
 *
 * A SECOND cohort is deliberately expensive: it needs a new roster file, a new
 * cohortId, a new counter row, and it trips the credit-writer allowlist in
 * web/__tests__/infra/credit-writers.test.ts. None of that is a config tweak.
 * =========================================================================
 *
 * Zero dependencies, like scripts/verify-founding-ten.mjs: this module is pure
 * (it builds request JSON and decodes errors), and run.mjs executes it by
 * shelling out to the `aws` CLI. Nothing here needs node_modules, so the tests
 * run anywhere with `node --test`.
 *
 * Load-bearing design notes:
 *
 *  - Identity is the SHA-256 of the normalized email, never a Cognito sub. One
 *    human can hold two accounts (native + Google) with different subs — true
 *    of someone in the pool today — so a sub-keyed marker would pay one person
 *    twice and burn two of twenty slots.
 *
 *  - The marker row carries NO expiresAt. The wallet table has TTL enabled
 *    table-wide, so a TTL'd marker would silently re-arm the grant weeks later
 *    and gift a second $200 with nothing failing.
 *
 *  - The ceiling is enforced by DynamoDB on the WRITE, not by this process's
 *    arithmetic: the 21st issuance is refused by a ConditionExpression.
 *
 *  - `tier` is NEVER written. The tutor gates paid models on tier and not on
 *    balance, so declining to write it is what keeps the gift hardware-scoped.
 *
 *  - No ClientRequestToken. Its 10-minute idempotency window rejects a retry
 *    whose parameters differ, and the timestamps here move on every attempt —
 *    a legitimate retry would raise IdempotentParameterMismatchException
 *    mid-cohort. The marker row already gives permanent once-only semantics.
 */

// Transaction leg positions. DynamoDB reports cancellation reasons
// positionally, so these must not be reordered.
export const MARKER_LEG = 0;
export const COUNTER_LEG = 1;
export const WALLET_LEG = 2;

export const ALREADY_ISSUED = "already-issued";
export const COHORT_FULL = "cohort-full";

const markerPk = (cohortId, hash) => `FOUNDING#${cohortId}#${hash}`;
const counterPk = (cohortId) => `FOUNDING#${cohortId}#COUNTER`;
const walletPk = (sub) => `WALLET#${sub}`;

/** Reject a roster that would overspend before a single write is attempted. */
export function validateCohort(cohort) {
  const problems = [];
  if (!cohort || typeof cohort !== "object") return ["cohort is not an object"];
  if (!cohort.cohortId) problems.push("missing cohortId");
  if (!Number.isInteger(cohort.creditsEach) || cohort.creditsEach <= 0) {
    problems.push("creditsEach must be a positive integer");
  }
  if (!Number.isInteger(cohort.maxRecipients) || cohort.maxRecipients <= 0) {
    problems.push("maxRecipients must be a positive integer");
  }
  const recipients = cohort.recipients ?? [];
  if (recipients.length > (cohort.maxRecipients ?? 0)) {
    problems.push(
      `roster lists ${recipients.length} recipients but maxRecipients is ${cohort.maxRecipients}`,
    );
  }
  const seen = new Set();
  for (const r of recipients) {
    if (!/^[0-9a-f]{64}$/.test(r.emailHash ?? "")) {
      problems.push(`recipient slot ${r.slot}: emailHash is not a sha256 hex digest`);
    }
    if (seen.has(r.emailHash)) problems.push(`duplicate emailHash in roster (slot ${r.slot})`);
    seen.add(r.emailHash);
  }
  // A plaintext address in the roster is a privacy defect, not a style one.
  if (JSON.stringify(cohort).includes("@")) {
    problems.push("roster contains an '@' — email addresses must never be committed");
  }
  return problems;
}

/**
 * The three legs of one recipient's issuance, in DynamoDB TransactWriteItems
 * shape (identical for the SDK and for `aws dynamodb transact-write-items`).
 */
export function buildTransactItems({ cohort, tableName, emailHash, sub, now = Date.now() }) {
  if (!/^[0-9a-f]{64}$/.test(emailHash)) throw new Error("emailHash must be a sha256 hex digest");
  if (!sub) throw new Error("sub is required — the wallet row is keyed by it");
  const { cohortId, creditsEach, maxRecipients } = cohort;
  // Precomputed so the guard compares against constants rather than relying on
  // arithmetic at write time.
  const maxIssuedBefore = maxRecipients - 1;
  const maxCreditsBefore = maxRecipients * creditsEach - creditsEach;
  const stamp = String(now);
  const amount = String(creditsEach);

  const items = [];
  items[MARKER_LEG] = {
    Put: {
      TableName: tableName,
      Item: {
        pk: { S: markerPk(cohortId, emailHash) },
        cohortId: { S: cohortId },
        emailHash: { S: emailHash },
        sub: { S: sub },
        credits: { N: amount },
        issuedAt: { N: stamp },
        // NO expiresAt — see the header. A TTL'd marker re-arms the grant.
      },
      ConditionExpression: "attribute_not_exists(pk)",
    },
  };
  items[COUNTER_LEG] = {
    Update: {
      TableName: tableName,
      Key: { pk: { S: counterPk(cohortId) } },
      UpdateExpression: "ADD issued :one, creditsIssued :amt SET updatedAt = :now",
      // Both guards: a wrong :amt is caught as well as a wrong count.
      ConditionExpression:
        "attribute_not_exists(pk) OR (issued <= :maxIssued AND creditsIssued <= :maxCredits)",
      ExpressionAttributeValues: {
        ":one": { N: "1" },
        ":amt": { N: amount },
        ":now": { N: stamp },
        ":maxIssued": { N: String(maxIssuedBefore) },
        ":maxCredits": { N: String(maxCreditsBefore) },
      },
    },
  };
  items[WALLET_LEG] = {
    Update: {
      TableName: tableName,
      Key: { pk: { S: walletPk(sub) } },
      // ADD credits only. Never `tier` — that is what keeps the gift
      // hardware-scoped, since the tutor gates models on tier, not balance.
      UpdateExpression: "ADD credits :amt SET updatedAt = :now",
      ExpressionAttributeValues: { ":amt": { N: amount }, ":now": { N: stamp } },
    },
  };
  return items;
}

/**
 * Read a TransactionCanceledException back into an outcome.
 *
 * The AWS CLI reports reasons as a bracketed positional list, e.g.
 * "... cancellation reasons for specific reasons [ConditionalCheckFailed, None,
 * None]". Order matters below: a full cohort and an already-issued recipient
 * can cancel together, and "already issued" is the benign reading.
 *
 * Returns ALREADY_ISSUED, COHORT_FULL, or null when this is not a cancellation
 * we recognise — in which case the caller must rethrow rather than treat an
 * unknown failure as a skip.
 */
export function decodeCancellation(message) {
  if (typeof message !== "string") return null;
  if (!/TransactionCanceledException/.test(message)) return null;
  const bracket = /\[([^\]]*)\]/.exec(message);
  if (!bracket) return null;
  const reasons = bracket[1].split(",").map((s) => s.trim());
  const failed = (i) => reasons[i] === "ConditionalCheckFailed";
  if (failed(MARKER_LEG)) return ALREADY_ISSUED;
  if (failed(COUNTER_LEG)) return COHORT_FULL;
  return null;
}
