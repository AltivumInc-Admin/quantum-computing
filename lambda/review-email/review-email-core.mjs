// quantum-review-email: a scheduled sender that emails a learner ONLY when they
// have spaced-repetition cards genuinely due AND have explicitly opted in, plus
// a tokenized unsubscribe and an authenticated preferences endpoint.
//
// The per-request logic lives in the `create*Core` factories with their
// dependencies (DynamoDB, SES, config) injected, so the whole thing is unit-
// tested offline under `node --test` with no AWS and no network. The thin
// index handlers wire the real AWS clients.
//
// Two tables:
//   quantum-workspace-progress  (owned by lambda/sync) — {userId, data, email}
//   quantum-review-email-prefs  (owned here)           — {userId, remindersOn,
//                                                         lastSentEpochDay, optOut}
// Consent is OPT-IN and canonical here: `remindersOn` must be exactly true for
// a send; absent or false means NO email. The legacy `optOut` attribute (from
// the original opt-out model) is kept as a veto for backward compatibility.
// Prefs live in their own table so the sync Lambda's full-item PUT can never
// clobber them.

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  ScanCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { SendEmailCommand, GetAccountCommand } from "@aws-sdk/client-sesv2";

const MS_PER_DAY = 86_400_000;

/** At most one reminder email per user per this many days. */
export const CADENCE_DAYS = 7;

/** EMF namespace — must match the CloudWatch alarm in template.yaml. */
export const METRIC_NAMESPACE = "QuantumReviewEmail";

/** Whole days since the Unix epoch — the same edge convention as review-schedule.ts. */
export function epochDay(nowMs) {
  return Math.floor(nowMs / MS_PER_DAY);
}

// Ported verbatim from review-schedule.isValidCardState: the app requires ALL
// six fields finite and DISCARDS a card that fails (treated as not-due in both
// the badge and the review queue). Counting on dueEpochDay alone would email
// "1 card due" for a partially-corrupt card the learner then can't find in
// /review — a real divergence from the surface the email points at.
function isValidCardState(c) {
  return (
    c !== null &&
    typeof c === "object" &&
    Number.isFinite(c.reps) &&
    Number.isFinite(c.lapses) &&
    Number.isFinite(c.stability) &&
    Number.isFinite(c.difficulty) &&
    Number.isFinite(c.dueEpochDay) &&
    Number.isFinite(c.lastEpochDay)
  );
}

/**
 * Count the learner's due cards from a synced qc:* snapshot. Mirrors the app's
 * real due path (isValidCardState then isDue: dueEpochDay <= today). Each
 * qc:card:* value is the CardState JSON string as stored in localStorage.
 */
export function dueCount(data, todayEpochDay) {
  if (!data || typeof data !== "object") return 0;
  let due = 0;
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith("qc:card:")) continue;
    try {
      const card = JSON.parse(value);
      if (isValidCardState(card) && card.dueEpochDay <= todayEpochDay) due++;
    } catch {
      /* a corrupt card simply isn't counted */
    }
  }
  return due;
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** A self-contained unsubscribe token: base64url(sub).base64url(HMAC(sub)). */
export function unsubToken(sub, secret) {
  const mac = createHmac("sha256", secret).update(sub).digest();
  return `${b64url(sub)}.${b64url(mac)}`;
}

/** Verify a token and return its `sub`, or null if it is malformed/forged. */
export function verifyUnsubToken(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null; // canonical form only — reject extra segments
  const [subPart, macPart] = parts;
  let sub;
  try {
    sub = Buffer.from(subPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!sub) return null;
  const expected = createHmac("sha256", secret).update(sub).digest();
  let given;
  try {
    given = Buffer.from(macPart, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? sub : null;
}

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** The reminder email — HTML + text, with a CTA to /review and an unsubscribe link. */
export function renderEmail({ due, siteUrl, unsubUrl }) {
  const n = due;
  const cards = `${n} card${n === 1 ? "" : "s"}`;
  const subject = `${cards} due for review`;
  const reviewUrl = `${siteUrl}/review`;
  const manageUrl = `${siteUrl}/workspace`;
  const text =
    `You have ${cards} due for spaced-repetition review.\n\n` +
    `A few minutes keeps the whole curriculum fresh: ${reviewUrl}\n\n` +
    `— Quantum Workspace\n\n` +
    `You turned on review reminders. Manage reminder emails in your workspace: ${manageUrl}\n` +
    `Unsubscribe: ${unsubUrl}\n`;
  const html =
    `<!doctype html><html><body style="margin:0;background:#f8fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#141413">` +
    `<div style="max-width:520px;margin:0 auto;padding:32px 24px">` +
    `<p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#0e9d94;margin:0 0 8px">Quantum Workspace</p>` +
    `<h1 style="font-size:22px;line-height:1.25;margin:0 0 12px;color:#0d1320">${escapeHtml(cards)} due for review</h1>` +
    `<p style="font-size:15px;line-height:1.6;color:#3f4657;margin:0 0 24px">Cards you have studied are ready to resurface — right when you are about to forget them. A few minutes keeps the whole curriculum fresh.</p>` +
    `<a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#0e9d94;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 20px;border-radius:10px">Review now</a>` +
    `<p style="font-size:12px;color:#8b93a5;margin:32px 0 0">You are receiving this because you turned on review reminders. <a href="${escapeHtml(manageUrl)}" style="color:#8b93a5">Manage reminder emails in your workspace</a> or <a href="${escapeHtml(unsubUrl)}" style="color:#8b93a5">unsubscribe</a>.</p>` +
    `</div></body></html>`;
  return { subject, html, text };
}

async function scanAll(ddb, params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({ ...params, ExclusiveStartKey }));
    if (res.Items) items.push(...res.Items);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/**
 * One CloudWatch metric emission in Embedded Metric Format — a structured
 * stdout line the Logs agent turns into real metrics, no SDK dependency.
 * `Dimensions` is omitted: these are account-level operational counters.
 */
export function emfLine(metrics, timestamp = Date.now()) {
  return JSON.stringify({
    _aws: {
      Timestamp: timestamp,
      CloudWatchMetrics: [
        {
          Namespace: METRIC_NAMESPACE,
          Metrics: Object.keys(metrics).map((Name) => ({ Name, Unit: "Count" })),
        },
      ],
    },
    ...metrics,
  });
}

const zeroSummary = () => ({
  scanned: 0,
  emailed: 0,
  noDue: 0,
  noEmail: 0,
  notOptedIn: 0,
  optedOut: 0,
  recentlySent: 0,
  failed: 0,
  skippedSandbox: false,
});

/**
 * The scheduled sender. Refuses to send anything while SES is in the sandbox.
 * Otherwise scans every learner's progress, and for each one with due cards, a
 * known email, an explicit opt-in (remindersOn === true, no legacy optOut), and
 * no send within the last CADENCE_DAYS, sends one reminder and records
 * lastSentEpochDay. Emits EMF metrics (ReviewEmailSent / ReviewEmailFailed /
 * ReviewEmailSkippedSandbox) so failures alarm instead of vanishing into a
 * normally-returning summary. `now` is injectable; `emitMetrics` receives the
 * raw EMF line (stdout by default).
 */
export function createSenderCore({
  ddb,
  ses,
  progressTable,
  prefsTable,
  fromAddress,
  siteUrl,
  unsubBaseUrl,
  unsubSecret,
  now = () => Date.now(),
  log = () => {},
  emitMetrics = (line) => console.log(line),
}) {
  return async function run() {
    const today = epochDay(now());

    // Sandbox guard: in the SES sandbox, sends to unverified addresses hard-fail
    // (and none of our learners are verified identities). Send NOTHING, say so.
    const account = await ses.send(new GetAccountCommand({}));
    if (account?.ProductionAccessEnabled !== true) {
      log("SES production access is not enabled (sandbox) — skipping the entire run, nothing sent.");
      emitMetrics(emfLine({ ReviewEmailSkippedSandbox: 1 }, now()));
      return { ...zeroSummary(), skippedSandbox: true };
    }

    // Prefs are a small table — scan once into a map. Consent is opt-in:
    // only rows with remindersOn === true (and no legacy optOut veto) may send.
    const prefs = new Map(
      (
        await scanAll(ddb, {
          TableName: prefsTable,
          ProjectionExpression: "userId, remindersOn, optOut, lastSentEpochDay",
        })
      ).map((it) => [
        it.userId?.S,
        {
          remindersOn: it.remindersOn?.BOOL === true,
          optOut: it.optOut?.BOOL === true,
          lastSentEpochDay: it.lastSentEpochDay?.N ? Number(it.lastSentEpochDay.N) : null,
        },
      ]),
    );

    const rows = await scanAll(ddb, {
      TableName: progressTable,
      ProjectionExpression: "userId, #d, email",
      ExpressionAttributeNames: { "#d": "data" },
    });

    const summary = { ...zeroSummary(), scanned: rows.length };
    for (const it of rows) {
      const sub = it.userId?.S;
      const email = it.email?.S;
      let data;
      try {
        data = JSON.parse(it.data?.S ?? "{}");
      } catch {
        data = {};
      }
      const due = dueCount(data, today);
      if (due === 0) { summary.noDue++; continue; }
      if (!email) { summary.noEmail++; continue; }

      const p = prefs.get(sub);
      if (p?.optOut) { summary.optedOut++; continue; }
      // OPT-IN: no prefs row, or remindersOn absent/false, means NO email.
      if (p?.remindersOn !== true) { summary.notOptedIn++; continue; }
      // Cadence cap: at most one reminder per CADENCE_DAYS.
      if (p.lastSentEpochDay !== null && today - p.lastSentEpochDay < CADENCE_DAYS) {
        summary.recentlySent++;
        continue;
      }

      const unsubUrl = `${unsubBaseUrl}?t=${encodeURIComponent(unsubToken(sub, unsubSecret))}`;
      const { subject, html, text } = renderEmail({ due, siteUrl, unsubUrl });
      try {
        await ses.send(
          new SendEmailCommand({
            FromEmailAddress: fromAddress,
            Destination: { ToAddresses: [email] },
            Content: {
              Simple: {
                Subject: { Data: subject, Charset: "UTF-8" },
                Body: {
                  Html: { Data: html, Charset: "UTF-8" },
                  Text: { Data: text, Charset: "UTF-8" },
                },
              },
            },
          }),
        );
      } catch (err) {
        summary.failed++;
        log(`send failed for one recipient: ${err?.name ?? "error"}`);
        continue;
      }
      summary.emailed++;
      // Record the cadence marker. If THIS write fails the email already went
      // out and the cap is broken for this user — count it as a failure so the
      // ReviewEmailFailed alarm fires instead of silently re-emailing tomorrow.
      try {
        await ddb.send(
          new UpdateItemCommand({
            TableName: prefsTable,
            Key: { userId: { S: sub } },
            UpdateExpression: "SET lastSentEpochDay = :d",
            ExpressionAttributeValues: { ":d": { N: String(today) } },
          }),
        );
      } catch (err) {
        summary.failed++;
        log(`cadence marker write failed for one recipient: ${err?.name ?? "error"}`);
      }
    }
    emitMetrics(
      emfLine({ ReviewEmailSent: summary.emailed, ReviewEmailFailed: summary.failed }, now()),
    );
    log(`review-email run: ${JSON.stringify(summary)}`);
    return summary;
  };
}

/**
 * The unsubscribe endpoint (unauthenticated Function URL — the link in the
 * email). Verifies the token, turns reminders off, and returns an HTML
 * confirmation. Idempotent and safe to click twice. Uses an update (not a
 * full-item put) so it never clobbers lastSentEpochDay; also sets the legacy
 * optOut flag so any older reader keeps agreeing.
 */
export function createUnsubscribeCore({ ddb, prefsTable, unsubSecret, siteUrl }) {
  return async function core(event) {
    const token = event?.queryStringParameters?.t;
    const sub = verifyUnsubToken(token, unsubSecret);
    if (!sub) {
      return htmlResponse(400, "This unsubscribe link is invalid or has expired.");
    }
    await ddb.send(
      new UpdateItemCommand({
        TableName: prefsTable,
        Key: { userId: { S: sub } },
        UpdateExpression: "SET remindersOn = :off, optOut = :out, updatedAt = :t",
        ExpressionAttributeValues: {
          ":off": { BOOL: false },
          ":out": { BOOL: true },
          ":t": { N: String(Date.now()) },
        },
      }),
    );
    const manageUrl = `${siteUrl}/workspace`;
    return htmlResponse(
      200,
      `You have been unsubscribed from review reminders. You can turn them back on under ` +
        `Manage reminder emails in your workspace at ` +
        `<a href="${escapeHtml(manageUrl)}">${escapeHtml(manageUrl)}</a>.`,
    );
  };
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * The authenticated preferences endpoint, behind the same Cognito JWT
 * authorizer discipline as lambda/sync: identity comes SOLELY from the API's
 * verified `sub` claim (event.requestContext.authorizer.jwt.claims), never
 * from the request body.
 *
 *   GET    /prefs  -> { remindersOn }      (absent row or legacy optOut => false)
 *   PUT    /prefs  <- { remindersOn: boolean }
 *   DELETE /prefs  -> removes the caller's row entirely
 *
 * Turning reminders ON clears the legacy optOut veto, so a learner who once
 * clicked unsubscribe can genuinely re-enable from the workspace.
 */
export function createPrefsCore({ ddb, prefsTable }) {
  return async function core(event) {
    const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!sub) return json(401, { error: "unauthorized" });
    const method = event.requestContext?.http?.method;

    if (method === "GET") {
      const res = await ddb.send(
        new GetItemCommand({ TableName: prefsTable, Key: { userId: { S: sub } } }),
      );
      const on = res.Item?.remindersOn?.BOOL === true && res.Item?.optOut?.BOOL !== true;
      return json(200, { remindersOn: on });
    }

    if (method === "PUT") {
      let body;
      try {
        body = JSON.parse(event.body ?? "");
      } catch {
        return json(400, { error: "invalid JSON body" });
      }
      const on = body?.remindersOn;
      if (typeof on !== "boolean") {
        return json(400, { error: "remindersOn must be a boolean" });
      }
      await ddb.send(
        new UpdateItemCommand({
          TableName: prefsTable,
          Key: { userId: { S: sub } },
          UpdateExpression: on
            ? "SET remindersOn = :v, updatedAt = :t REMOVE optOut"
            : "SET remindersOn = :v, updatedAt = :t",
          ExpressionAttributeValues: {
            ":v": { BOOL: on },
            ":t": { N: String(Date.now()) },
          },
        }),
      );
      return json(200, { remindersOn: on });
    }

    if (method === "DELETE") {
      await ddb.send(
        new DeleteItemCommand({ TableName: prefsTable, Key: { userId: { S: sub } } }),
      );
      return json(200, { deleted: true });
    }

    return json(405, { error: "method not allowed" });
  };
}

function htmlResponse(statusCode, message) {
  return {
    statusCode,
    headers: { "content-type": "text/html; charset=utf-8" },
    body:
      `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:64px auto;padding:0 24px;color:#141413">` +
      `<h1 style="font-size:20px">Quantum Workspace</h1><p style="font-size:15px;line-height:1.6;color:#3f4657">${message}</p></body></html>`,
  };
}
