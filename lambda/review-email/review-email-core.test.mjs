/**
 * Offline tests for the review-email cores. No AWS, no network, no real time —
 * every dependency (DynamoDB, SES, clock) is stubbed. Run: `cd lambda/review-email
 * && npm ci && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  epochDay,
  dueCount,
  unsubToken,
  verifyUnsubToken,
  renderEmail,
  createSenderCore,
  createUnsubscribeCore,
} from "./review-email-core.mjs";

const SECRET = "test-secret";
const card = (dueEpochDay) =>
  JSON.stringify({ reps: 2, lapses: 0, stability: 6, difficulty: 5, dueEpochDay, lastEpochDay: dueEpochDay - 6 });

test("dueCount counts only qc:card entries whose dueEpochDay has arrived", () => {
  const today = 20600;
  const data = {
    "qc:card:a": card(today - 1), // due
    "qc:card:b": card(today), // due today
    "qc:card:c": card(today + 5), // not yet
    "qc:card:d": "{corrupt", // ignored
    "qc:section:x": "1", // not a card
    "qc:log:day:20600": "1", // not a card
  };
  assert.equal(dueCount(data, today), 2);
  assert.equal(dueCount({}, today), 0);
  assert.equal(dueCount(null, today), 0);
});

test("epochDay matches the review-schedule edge convention", () => {
  assert.equal(epochDay(20600 * 86_400_000 + 123), 20600);
});

test("unsubscribe token round-trips and rejects forgery/tamper", () => {
  const sub = "cognito-sub-123";
  const token = unsubToken(sub, SECRET);
  assert.equal(verifyUnsubToken(token, SECRET), sub);
  assert.equal(verifyUnsubToken(token, "wrong-secret"), null); // wrong key
  assert.equal(verifyUnsubToken("garbage", SECRET), null);
  assert.equal(verifyUnsubToken(token + "x", SECRET), null); // tampered mac
  // A forged sub with a recomputed-looking mac must fail (attacker lacks secret).
  const forged = `${Buffer.from("other-sub").toString("base64url")}.${Buffer.from("nope").toString("base64url")}`;
  assert.equal(verifyUnsubToken(forged, SECRET), null);
});

test("renderEmail pluralizes and includes the review + unsubscribe URLs", () => {
  const one = renderEmail({ due: 1, siteUrl: "https://q.example", unsubUrl: "https://u.example?t=abc" });
  assert.equal(one.subject, "1 card due for review");
  const many = renderEmail({ due: 5, siteUrl: "https://q.example", unsubUrl: "https://u.example?t=abc" });
  assert.equal(many.subject, "5 cards due for review");
  assert.ok(many.html.includes("https://q.example/review"));
  assert.ok(many.html.includes("https://u.example?t=abc"));
  assert.ok(many.text.includes("https://q.example/review"));
  assert.ok(many.text.includes("https://u.example?t=abc"));
});

// A stub DynamoDB: routes Scan by table name, records PutItems.
function stubDdb({ progressItems = [], prefsItems = [] }) {
  const puts = [];
  return {
    puts,
    async send(cmd) {
      const name = cmd.constructor.name;
      if (name === "ScanCommand") {
        const t = cmd.input.TableName;
        const items = t === "progress" ? progressItems : t === "prefs" ? prefsItems : [];
        return { Items: items, LastEvaluatedKey: undefined };
      }
      if (name === "PutItemCommand") {
        puts.push(cmd.input);
        return {};
      }
      throw new Error(`unexpected command ${name}`);
    },
  };
}

function stubSes() {
  const sent = [];
  return {
    sent,
    async send(cmd) {
      sent.push(cmd.input);
      return { MessageId: "stub" };
    },
  };
}

const senderConfig = (ddb, ses) => ({
  ddb,
  ses,
  progressTable: "progress",
  prefsTable: "prefs",
  fromAddress: "reviews@q.example",
  siteUrl: "https://q.example",
  unsubBaseUrl: "https://u.example/unsub",
  unsubSecret: SECRET,
  now: () => 20600 * 86_400_000, // fixed "today" = 20600
});

test("sender emails exactly the learners with due cards, an email, and no opt-out", async () => {
  const today = 20600;
  const progressItems = [
    { userId: { S: "u1" }, email: { S: "a@x.com" }, data: { S: JSON.stringify({ "qc:card:a": card(today - 1) }) } }, // due → email
    { userId: { S: "u2" }, email: { S: "b@x.com" }, data: { S: JSON.stringify({ "qc:card:a": card(today + 9) }) } }, // not due → skip
    { userId: { S: "u3" }, data: { S: JSON.stringify({ "qc:card:a": card(today - 1) }) } }, // due but NO email → skip
    { userId: { S: "u4" }, email: { S: "d@x.com" }, data: { S: JSON.stringify({ "qc:card:a": card(today - 1) }) } }, // due but OPTED OUT → skip
  ];
  const prefsItems = [{ userId: { S: "u4" }, optOut: { BOOL: true } }];
  const ddb = stubDdb({ progressItems, prefsItems });
  const ses = stubSes();

  const summary = await createSenderCore(senderConfig(ddb, ses))();

  assert.deepEqual(summary, { scanned: 4, emailed: 1, noDue: 1, noEmail: 1, optedOut: 1, failed: 0 });
  assert.equal(ses.sent.length, 1);
  assert.deepEqual(ses.sent[0].Destination.ToAddresses, ["a@x.com"]);
  // The unsubscribe link carries a valid token for u1.
  const m = ses.sent[0].Content.Simple.Body.Html.Data.match(/t=([^"&]+)/);
  assert.ok(m, "email html has an unsubscribe token");
  assert.equal(verifyUnsubToken(decodeURIComponent(m[1]), SECRET), "u1");
});

test("sender counts a send failure without aborting the run", async () => {
  const today = 20600;
  const progressItems = [
    { userId: { S: "u1" }, email: { S: "a@x.com" }, data: { S: JSON.stringify({ "qc:card:a": card(today - 1) }) } },
    { userId: { S: "u2" }, email: { S: "b@x.com" }, data: { S: JSON.stringify({ "qc:card:a": card(today - 1) }) } },
  ];
  const ddb = stubDdb({ progressItems });
  const ses = {
    n: 0,
    async send() {
      this.n++;
      if (this.n === 1) throw Object.assign(new Error("throttled"), { name: "TooManyRequestsException" });
      return { MessageId: "ok" };
    },
  };
  const summary = await createSenderCore(senderConfig(ddb, ses))();
  assert.equal(summary.failed, 1);
  assert.equal(summary.emailed, 1); // the second still sent
});

test("unsubscribe flips the opt-out flag for a valid token and 400s an invalid one", async () => {
  const ddb = stubDdb({});
  const core = createUnsubscribeCore({ ddb, prefsTable: "prefs", unsubSecret: SECRET });

  const ok = await core({ queryStringParameters: { t: unsubToken("u9", SECRET) } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ddb.puts.length, 1);
  assert.equal(ddb.puts[0].Item.userId.S, "u9");
  assert.equal(ddb.puts[0].Item.optOut.BOOL, true);

  const bad = await core({ queryStringParameters: { t: "forged" } });
  assert.equal(bad.statusCode, 400);
  assert.equal(ddb.puts.length, 1); // no write for the invalid token
});
