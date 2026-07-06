// quantum-review-email: a scheduled sender that emails a learner ONLY when they
// have spaced-repetition cards genuinely due, plus a tokenized unsubscribe.
//
// The per-request logic lives in the two `create*Core` factories with their
// dependencies (DynamoDB, SES, config) injected, so the whole thing is unit-
// tested offline under `node --test` with no AWS and no network. The thin
// index handlers wire the real AWS clients.
//
// Two tables:
//   quantum-workspace-progress  (owned by lambda/sync) — {userId, data, email}
//   quantum-review-email-prefs  (owned here)           — {userId, optOut}
// Opt-out lives in its own table so the sync Lambda's full-item PUT can never
// clobber it.

import { createHmac, timingSafeEqual } from "node:crypto";
import { ScanCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";

const MS_PER_DAY = 86_400_000;

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
  const text =
    `You have ${cards} due for spaced-repetition review.\n\n` +
    `A few minutes keeps the whole curriculum fresh: ${reviewUrl}\n\n` +
    `— Quantum Workspace\n\nUnsubscribe from review reminders: ${unsubUrl}\n`;
  const html =
    `<!doctype html><html><body style="margin:0;background:#f8fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#141413">` +
    `<div style="max-width:520px;margin:0 auto;padding:32px 24px">` +
    `<p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#0e9d94;margin:0 0 8px">Quantum Workspace</p>` +
    `<h1 style="font-size:22px;line-height:1.25;margin:0 0 12px;color:#0d1320">${escapeHtml(cards)} due for review</h1>` +
    `<p style="font-size:15px;line-height:1.6;color:#3f4657;margin:0 0 24px">Cards you have studied are ready to resurface — right when you are about to forget them. A few minutes keeps the whole curriculum fresh.</p>` +
    `<a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#0e9d94;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 20px;border-radius:10px">Review now</a>` +
    `<p style="font-size:12px;color:#8b93a5;margin:32px 0 0">You are receiving this because you have review reminders on. <a href="${escapeHtml(unsubUrl)}" style="color:#8b93a5">Unsubscribe</a>.</p>` +
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
 * The scheduled sender. Scans every learner's progress, and for each one with
 * due cards + a known email + no opt-out, sends one reminder. Returns a summary
 * (also the natural place to assert on in tests). `now` is injectable.
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
}) {
  return async function run() {
    const today = epochDay(now());

    // Opt-outs are a small table — scan once into a set.
    const optOut = new Set(
      (await scanAll(ddb, { TableName: prefsTable, ProjectionExpression: "userId, optOut" }))
        .filter((it) => it.optOut?.BOOL === true)
        .map((it) => it.userId.S),
    );

    const rows = await scanAll(ddb, {
      TableName: progressTable,
      ProjectionExpression: "userId, #d, email",
      ExpressionAttributeNames: { "#d": "data" },
    });

    const summary = { scanned: rows.length, emailed: 0, noDue: 0, noEmail: 0, optedOut: 0, failed: 0 };
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
      if (optOut.has(sub)) { summary.optedOut++; continue; }

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
        summary.emailed++;
      } catch (err) {
        summary.failed++;
        log(`send failed for one recipient: ${err?.name ?? "error"}`);
      }
    }
    log(`review-email run: ${JSON.stringify(summary)}`);
    return summary;
  };
}

/**
 * The unsubscribe endpoint (unauthenticated Function URL — the link in the
 * email). Verifies the token, flips the opt-out flag, and returns an HTML
 * confirmation. Idempotent and safe to click twice.
 */
export function createUnsubscribeCore({ ddb, prefsTable, unsubSecret }) {
  return async function core(event) {
    const token = event?.queryStringParameters?.t;
    const sub = verifyUnsubToken(token, unsubSecret);
    if (!sub) {
      return htmlResponse(400, "This unsubscribe link is invalid or has expired.");
    }
    await ddb.send(
      new PutItemCommand({
        TableName: prefsTable,
        Item: { userId: { S: sub }, optOut: { BOOL: true }, updatedAt: { N: String(Date.now()) } },
      }),
    );
    return htmlResponse(
      200,
      "You have been unsubscribed from review reminders. You can turn them back on any time from your workspace.",
    );
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
