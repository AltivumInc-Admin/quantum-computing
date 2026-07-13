/**
 * Offline tests for the review-email cores. No AWS, no network, no real time —
 * every dependency (DynamoDB, SES, clock) is stubbed. Run: `cd lambda/review-email
 * && npm install && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  epochDay,
  dueCount,
  unsubToken,
  verifyUnsubToken,
  renderEmail,
  emfLine,
  createSenderCore,
  createUnsubscribeCore,
  createPrefsCore,
  CADENCE_DAYS,
  METRIC_NAMESPACE,
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

test("dueCount rejects a partially-corrupt card the app would discard (all six fields required)", () => {
  const today = 20600;
  // Finite dueEpochDay <= today but a non-finite stability — the app's
  // isValidCardState fails this, so /review shows nothing. The email must agree.
  const partial = JSON.stringify({
    reps: 2, lapses: 0, stability: null, difficulty: 5, dueEpochDay: today - 1, lastEpochDay: today - 7,
  });
  assert.equal(dueCount({ "qc:card:x": partial }, today), 0);
  // A fully-valid due card still counts.
  assert.equal(dueCount({ "qc:card:y": card(today - 1) }, today), 1);
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
  // Only the canonical two-segment form is accepted — no trailing junk.
  assert.equal(verifyUnsubToken(token + ".junk", SECRET), null);
  assert.equal(verifyUnsubToken(token + ".", SECRET), null);
});

test("renderEmail pluralizes and includes the review, manage, and unsubscribe URLs", () => {
  const one = renderEmail({ due: 1, siteUrl: "https://q.example", unsubUrl: "https://u.example?t=abc" });
  assert.equal(one.subject, "1 card due for review");
  const many = renderEmail({ due: 5, siteUrl: "https://q.example", unsubUrl: "https://u.example?t=abc" });
  assert.equal(many.subject, "5 cards due for review");
  assert.ok(many.html.includes("https://q.example/review"));
  assert.ok(many.html.includes("https://u.example?t=abc"));
  assert.ok(many.text.includes("https://q.example/review"));
  assert.ok(many.text.includes("https://u.example?t=abc"));
  // Honest strings: the footer points at the REAL control (the workspace),
  // and says the reminders were turned on by the learner (opt-in).
  assert.ok(many.html.includes("https://q.example/workspace"));
  assert.ok(many.text.includes("https://q.example/workspace"));
  assert.ok(many.html.includes("you turned on review reminders"));
});

test("emfLine is valid EMF: namespace, metric names, and values in one stdout blob", () => {
  const parsed = JSON.parse(emfLine({ ReviewEmailSent: 3, ReviewEmailFailed: 1 }, 1234));
  assert.equal(parsed._aws.Timestamp, 1234);
  assert.equal(parsed._aws.CloudWatchMetrics[0].Namespace, METRIC_NAMESPACE);
  // The EMF spec REQUIRES Dimensions on every MetricDirective; without it the
  // whole document is ignored and the send-failure alarm can never fire. One
  // empty DimensionSet = dimensionless metrics, matching the template's alarm.
  assert.deepEqual(parsed._aws.CloudWatchMetrics[0].Dimensions, [[]]);
  assert.deepEqual(
    parsed._aws.CloudWatchMetrics[0].Metrics,
    [
      { Name: "ReviewEmailSent", Unit: "Count" },
      { Name: "ReviewEmailFailed", Unit: "Count" },
    ],
  );
  assert.equal(parsed.ReviewEmailSent, 3);
  assert.equal(parsed.ReviewEmailFailed, 1);
});

// A stub DynamoDB: routes Scan by table name, records writes.
function stubDdb({ progressItems = [], prefsItems = [], getItem, failUpdate = false } = {}) {
  const updates = [];
  const deletes = [];
  return {
    updates,
    deletes,
    async send(cmd) {
      const name = cmd.constructor.name;
      if (name === "ScanCommand") {
        const t = cmd.input.TableName;
        const items = t === "progress" ? progressItems : t === "prefs" ? prefsItems : [];
        return { Items: items, LastEvaluatedKey: undefined };
      }
      if (name === "UpdateItemCommand") {
        if (failUpdate) throw Object.assign(new Error("boom"), { name: "InternalServerError" });
        updates.push(cmd.input);
        return {};
      }
      if (name === "DeleteItemCommand") {
        deletes.push(cmd.input);
        return {};
      }
      if (name === "GetItemCommand") {
        return { Item: getItem };
      }
      throw new Error(`unexpected command ${name}`);
    },
  };
}

// A stub SESv2: answers GetAccount (sandbox flag) and records sends.
function stubSes({ productionAccess = true } = {}) {
  const sent = [];
  return {
    sent,
    async send(cmd) {
      if (cmd.constructor.name === "GetAccountCommand") {
        return { ProductionAccessEnabled: productionAccess };
      }
      sent.push(cmd.input);
      return { MessageId: "stub" };
    },
  };
}

function captureMetrics() {
  const lines = [];
  const emit = (line) => lines.push(JSON.parse(line));
  emit.lines = lines;
  return emit;
}

const senderConfig = (ddb, ses, emitMetrics = () => {}) => ({
  ddb,
  ses,
  progressTable: "progress",
  prefsTable: "prefs",
  fromAddress: "reviews@q.example",
  siteUrl: "https://q.example",
  unsubBaseUrl: "https://u.example/unsub",
  unsubSecret: SECRET,
  now: () => 20600 * 86_400_000, // fixed "today" = 20600
  emitMetrics,
});

const TODAY = 20600;
const dueRow = (sub, email) => ({
  userId: { S: sub },
  ...(email ? { email: { S: email } } : {}),
  data: { S: JSON.stringify({ "qc:card:a": card(TODAY - 1) }) },
});
const optIn = (sub, extra = {}) => ({ userId: { S: sub }, remindersOn: { BOOL: true }, ...extra });

test("OPT-IN gate: no prefs row, remindersOn absent, and remindersOn=false all mean NO email", async () => {
  const progressItems = [
    dueRow("u-none", "a@x.com"), // no prefs row at all
    dueRow("u-absent", "b@x.com"), // prefs row without remindersOn
    dueRow("u-false", "c@x.com"), // remindersOn explicitly false
    dueRow("u-true", "d@x.com"), // the ONLY one who consented
  ];
  const prefsItems = [
    { userId: { S: "u-absent" }, lastSentEpochDay: { N: "1" } },
    { userId: { S: "u-false" }, remindersOn: { BOOL: false } },
    optIn("u-true"),
  ];
  const ddb = stubDdb({ progressItems, prefsItems });
  const ses = stubSes();

  const summary = await createSenderCore(senderConfig(ddb, ses))();

  assert.equal(summary.emailed, 1);
  assert.equal(summary.notOptedIn, 3);
  assert.equal(ses.sent.length, 1);
  assert.deepEqual(ses.sent[0].Destination.ToAddresses, ["d@x.com"]);
});

test("sender emails exactly the learners with due cards, an email, and consent", async () => {
  const progressItems = [
    dueRow("u1", "a@x.com"), // due + opted in → email
    { userId: { S: "u2" }, email: { S: "b@x.com" }, data: { S: JSON.stringify({ "qc:card:a": card(TODAY + 9) }) } }, // not due → skip
    dueRow("u3"), // due but NO email → skip
    dueRow("u4", "d@x.com"), // due but legacy OPT-OUT veto → skip
  ];
  const prefsItems = [
    optIn("u1"),
    optIn("u2"),
    optIn("u3"),
    // Legacy state: an old unsubscribe click set optOut before remindersOn
    // existed; the veto must still hold even against remindersOn=true.
    optIn("u4", { optOut: { BOOL: true } }),
  ];
  const ddb = stubDdb({ progressItems, prefsItems });
  const ses = stubSes();

  const summary = await createSenderCore(senderConfig(ddb, ses))();

  assert.equal(summary.scanned, 4);
  assert.equal(summary.emailed, 1);
  assert.equal(summary.noDue, 1);
  assert.equal(summary.noEmail, 1);
  assert.equal(summary.optedOut, 1);
  assert.equal(summary.failed, 0);
  assert.equal(ses.sent.length, 1);
  assert.deepEqual(ses.sent[0].Destination.ToAddresses, ["a@x.com"]);
  // The unsubscribe link carries a valid token for u1.
  const m = ses.sent[0].Content.Simple.Body.Html.Data.match(/t=([^"&]+)/);
  assert.ok(m, "email html has an unsubscribe token");
  assert.equal(verifyUnsubToken(decodeURIComponent(m[1]), SECRET), "u1");
});

test("cadence cap: a send within the last 7 days skips; day 7 sends again", async () => {
  const progressItems = [dueRow("u-recent", "a@x.com"), dueRow("u-stale", "b@x.com")];
  const prefsItems = [
    optIn("u-recent", { lastSentEpochDay: { N: String(TODAY - (CADENCE_DAYS - 1)) } }), // 6 days ago → skip
    optIn("u-stale", { lastSentEpochDay: { N: String(TODAY - CADENCE_DAYS) } }), // exactly 7 → send
  ];
  const ddb = stubDdb({ progressItems, prefsItems });
  const ses = stubSes();

  const summary = await createSenderCore(senderConfig(ddb, ses))();

  assert.equal(summary.recentlySent, 1);
  assert.equal(summary.emailed, 1);
  assert.deepEqual(ses.sent[0].Destination.ToAddresses, ["b@x.com"]);
});

test("a successful send records lastSentEpochDay in prefs (the cadence marker)", async () => {
  const ddb = stubDdb({ progressItems: [dueRow("u1", "a@x.com")], prefsItems: [optIn("u1")] });
  const ses = stubSes();

  await createSenderCore(senderConfig(ddb, ses))();

  assert.equal(ddb.updates.length, 1);
  assert.equal(ddb.updates[0].TableName, "prefs");
  assert.equal(ddb.updates[0].Key.userId.S, "u1");
  assert.match(ddb.updates[0].UpdateExpression, /lastSentEpochDay/);
  assert.equal(ddb.updates[0].ExpressionAttributeValues[":d"].N, String(TODAY));
});

test("a failed cadence-marker write counts toward `failed` (rings the alarm)", async () => {
  const ddb = stubDdb({
    progressItems: [dueRow("u1", "a@x.com")],
    prefsItems: [optIn("u1")],
    failUpdate: true,
  });
  const ses = stubSes();
  const emit = captureMetrics();

  const summary = await createSenderCore(senderConfig(ddb, ses, emit))();

  assert.equal(summary.emailed, 1); // the email DID go out
  assert.equal(summary.failed, 1); // but the broken cap is loud, not silent
  assert.equal(emit.lines.at(-1).ReviewEmailFailed, 1);
});

test("sandbox guard: no production access sends NOTHING and emits ReviewEmailSkippedSandbox", async () => {
  const ddb = stubDdb({ progressItems: [dueRow("u1", "a@x.com")], prefsItems: [optIn("u1")] });
  const ses = stubSes({ productionAccess: false });
  const emit = captureMetrics();

  const summary = await createSenderCore(senderConfig(ddb, ses, emit))();

  assert.equal(summary.skippedSandbox, true);
  assert.equal(summary.emailed, 0);
  assert.equal(ses.sent.length, 0);
  assert.equal(ddb.updates.length, 0);
  assert.equal(emit.lines.length, 1);
  assert.equal(emit.lines[0].ReviewEmailSkippedSandbox, 1);
  assert.equal(emit.lines[0]._aws.CloudWatchMetrics[0].Namespace, METRIC_NAMESPACE);
});

test("sender counts a send failure without aborting the run, and emits it via EMF", async () => {
  const progressItems = [dueRow("u1", "a@x.com"), dueRow("u2", "b@x.com")];
  const prefsItems = [optIn("u1"), optIn("u2")];
  const ddb = stubDdb({ progressItems, prefsItems });
  let n = 0;
  const ses = {
    async send(cmd) {
      if (cmd.constructor.name === "GetAccountCommand") return { ProductionAccessEnabled: true };
      n++;
      if (n === 1) throw Object.assign(new Error("throttled"), { name: "TooManyRequestsException" });
      return { MessageId: "ok" };
    },
  };
  const emit = captureMetrics();

  const summary = await createSenderCore(senderConfig(ddb, ses, emit))();

  assert.equal(summary.failed, 1);
  assert.equal(summary.emailed, 1); // the second still sent
  const final = emit.lines.at(-1);
  assert.equal(final.ReviewEmailFailed, 1);
  assert.equal(final.ReviewEmailSent, 1);
  // A failed send must NOT record a cadence marker — only u2's send did.
  assert.equal(ddb.updates.length, 1);
  assert.equal(ddb.updates[0].Key.userId.S, "u2");
});

test("unsubscribe turns reminders off for a valid token and 400s an invalid one", async () => {
  const ddb = stubDdb({});
  const core = createUnsubscribeCore({
    ddb,
    prefsTable: "prefs",
    unsubSecret: SECRET,
    siteUrl: "https://q.example",
  });

  const ok = await core({ queryStringParameters: { t: unsubToken("u9", SECRET) } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ddb.updates.length, 1);
  assert.equal(ddb.updates[0].Key.userId.S, "u9");
  // remindersOn=false is the canonical off; legacy optOut=true kept in step.
  assert.equal(ddb.updates[0].ExpressionAttributeValues[":off"].BOOL, false);
  assert.equal(ddb.updates[0].ExpressionAttributeValues[":out"].BOOL, true);
  // The confirmation names the REAL re-enable control (the workspace).
  assert.ok(ok.body.includes("https://q.example/workspace"));

  const bad = await core({ queryStringParameters: { t: "forged" } });
  assert.equal(bad.statusCode, 400);
  assert.equal(ddb.updates.length, 1); // no write for the invalid token
});

// ---- the authenticated prefs endpoint ----

const prefsEvent = ({ method = "GET", sub = "user-1", body } = {}) => ({
  requestContext: {
    http: { method },
    authorizer: sub ? { jwt: { claims: { sub } } } : undefined,
  },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test("prefs rejects requests without a verified sub claim", async () => {
  const core = createPrefsCore({ ddb: stubDdb({}), prefsTable: "prefs" });
  assert.equal((await core(prefsEvent({ sub: null }))).statusCode, 401);
  assert.equal((await core(prefsEvent({ sub: null, method: "PUT" }))).statusCode, 401);
  assert.equal((await core(prefsEvent({ sub: null, method: "DELETE" }))).statusCode, 401);
});

test("GET /prefs defaults to remindersOn=false for a missing row (opt-in)", async () => {
  const core = createPrefsCore({ ddb: stubDdb({}), prefsTable: "prefs" });
  const res = await core(prefsEvent());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { remindersOn: false });
});

test("GET /prefs reflects remindersOn=true, but a legacy optOut veto reads as off", async () => {
  const onCore = createPrefsCore({
    ddb: stubDdb({ getItem: { remindersOn: { BOOL: true } } }),
    prefsTable: "prefs",
  });
  assert.deepEqual(JSON.parse((await onCore(prefsEvent())).body), { remindersOn: true });

  const vetoed = createPrefsCore({
    ddb: stubDdb({ getItem: { remindersOn: { BOOL: true }, optOut: { BOOL: true } } }),
    prefsTable: "prefs",
  });
  assert.deepEqual(JSON.parse((await vetoed(prefsEvent())).body), { remindersOn: false });
});

test("PUT /prefs writes the boolean under the TOKEN's sub and clears the legacy veto on enable", async () => {
  const ddb = stubDdb({});
  const core = createPrefsCore({ ddb, prefsTable: "prefs" });

  const res = await core(
    prefsEvent({ method: "PUT", sub: "token-sub", body: { remindersOn: true, userId: "attacker-sub" } }),
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { remindersOn: true });
  // Identity comes from the verified token, never the body.
  assert.equal(ddb.updates[0].Key.userId.S, "token-sub");
  assert.match(ddb.updates[0].UpdateExpression, /REMOVE optOut/);
  assert.equal(ddb.updates[0].ExpressionAttributeValues[":v"].BOOL, true);

  await core(prefsEvent({ method: "PUT", sub: "token-sub", body: { remindersOn: false } }));
  assert.equal(ddb.updates[1].ExpressionAttributeValues[":v"].BOOL, false);
  assert.doesNotMatch(ddb.updates[1].UpdateExpression, /REMOVE/);
});

test("PUT /prefs validates the body", async () => {
  const ddb = stubDdb({});
  const core = createPrefsCore({ ddb, prefsTable: "prefs" });
  const status = async (body) => (await core(prefsEvent({ method: "PUT", body }))).statusCode;
  assert.equal(await status({ remindersOn: "yes" }), 400);
  assert.equal(await status({}), 400);
  assert.equal((await core({ ...prefsEvent({ method: "PUT" }), body: "{not json" })).statusCode, 400);
  assert.equal(ddb.updates.length, 0);
});

test("DELETE /prefs removes exactly the caller's row", async () => {
  const ddb = stubDdb({});
  const core = createPrefsCore({ ddb, prefsTable: "prefs" });
  const res = await core(prefsEvent({ method: "DELETE", sub: "u-gone" }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { deleted: true });
  assert.deepEqual(ddb.deletes, [{ TableName: "prefs", Key: { userId: { S: "u-gone" } } }]);
});

test("prefs answers 405 for unknown methods", async () => {
  const core = createPrefsCore({ ddb: stubDdb({}), prefsTable: "prefs" });
  assert.equal((await core(prefsEvent({ method: "POST" }))).statusCode, 405);
});
