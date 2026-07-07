/**
 * Offline tests for the QPU submit + spend-ledger core. No live AWS, no real
 * money, no real time — DynamoDB, Braket, and the clock are stubbed. This is the
 * money path, so every cap/gate/idempotency/compensation branch is exercised.
 * Run: `cd lambda/qpu && npm ci && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costMicros,
  utcDay,
  validateSubmitBody,
  createHandlerCore,
  circuitHash,
  correctCents,
  requiredShotsFor,
  DEVICE,
  LIFETIME_CAP_MICROS,
} from "./qpu-core.mjs";

const NOW = Date.UTC(2026, 6, 7, 12, 0, 0); // 2026-07-07T12:00:00Z
const QASM = "OPENQASM 3.0; qubit[1] q; h q[0]; bit[1] b; b[0] = measure q[0];";

function canceled(reasons) {
  const e = new Error("cancelled");
  e.name = "TransactionCanceledException";
  e.CancellationReasons = reasons;
  return e;
}
const R = (i) => {
  const a = [{ Code: "None" }, { Code: "None" }, { Code: "None" }, { Code: "None" }];
  a[i] = { Code: "ConditionalCheckFailed" };
  return a;
};

// A DynamoDB stub. Ledger GetItems are routed by pk prefix: CRED# (the
// credential), USER# (the budget row). Other commands by name; records calls.
function stubDdb({ credentialed = true, transact, existingTask, ledgerUser, tasks, failUpdate } = {}) {
  const calls = [];
  return {
    calls,
    async send(cmd) {
      const name = cmd.constructor.name;
      calls.push({ name, input: cmd.input });
      if (name === "GetItemCommand") {
        if (cmd.input.TableName === "ledger") {
          const pk = cmd.input.Key.pk.S;
          if (pk.startsWith("CRED#")) return credentialed ? { Item: { costEstimate: { BOOL: true } } } : {};
          if (pk.startsWith("USER#")) return ledgerUser ? { Item: ledgerUser } : {};
          return {};
        }
        if (cmd.input.TableName === "tasks") return existingTask ? { Item: existingTask } : {};
        return {};
      }
      if (name === "QueryCommand") return { Items: tasks ?? [] };
      if (name === "TransactWriteItemsCommand") {
        if (transact instanceof Error) throw transact;
        return {};
      }
      if (name === "PutItemCommand") return {};
      if (name === "UpdateItemCommand") {
        if (failUpdate) throw Object.assign(new Error("throttled"), { name: "ThrottlingException" });
        return {};
      }
      throw new Error(`unexpected command ${name}`);
    },
  };
}

const stubBraket = (arn = "arn:aws:braket:eu-north-1:111:quantum-task/abc", err) => {
  const calls = [];
  return {
    calls,
    async send(cmd) {
      calls.push(cmd.input);
      if (err) throw err;
      return { quantumTaskArn: arn };
    },
  };
};

const core = (ddb, braket) =>
  createHandlerCore({
    ddb,
    braket,
    ledgerTable: "ledger",
    tasksTable: "tasks",
    resultsBucket: "amazon-braket-eu-north-1-x",
    now: () => NOW,
  });

const submitEvent = (claims, body) => ({
  requestContext: { authorizer: { jwt: { claims } }, http: { method: "POST", path: "/qpu/submit" } },
  body: JSON.stringify(body),
});
const goodClaims = { sub: "u1", email_verified: "true" };
const goodBody = { device: DEVICE, shots: 1000, qasm: QASM, idempotencyKey: "abcd-1234-efgh" };

// ---- pure helpers ----------------------------------------------------------
test("costMicros matches the IQM Garnet rate (0.30 + 0.00145/shot)", () => {
  assert.equal(costMicros(1000), 1_750_000); // $1.75
  assert.equal(costMicros(100), 445_000); // $0.445
  assert.equal(costMicros(0), 300_000); // just the task fee
});

test("utcDay is the UTC calendar day", () => {
  assert.equal(utcDay(NOW), "2026-07-07");
  assert.equal(utcDay(Date.UTC(2026, 6, 7, 23, 59, 59)), "2026-07-07");
});

test("circuitHash is stable and trim-insensitive", () => {
  assert.equal(circuitHash(QASM), circuitHash(`  ${QASM}\n`));
  assert.match(circuitHash(QASM), /^[0-9a-f]{64}$/);
});

test("validateSubmitBody enforces device, shots, qasm, idempotencyKey", () => {
  assert.ok(!validateSubmitBody(goodBody).error);
  assert.match(validateSubmitBody({ ...goodBody, device: "ionq_forte" }).error, /device/);
  assert.match(validateSubmitBody({ ...goodBody, shots: 0 }).error, /shots/);
  assert.match(validateSubmitBody({ ...goodBody, shots: 1001 }).error, /shots/);
  assert.match(validateSubmitBody({ ...goodBody, shots: 3.5 }).error, /shots/);
  assert.match(validateSubmitBody({ ...goodBody, qasm: "  " }).error, /qasm/);
  assert.match(validateSubmitBody({ ...goodBody, idempotencyKey: "short" }).error, /idempotencyKey/);
  assert.match(validateSubmitBody({ ...goodBody, idempotencyKey: "bad key!" }).error, /idempotencyKey/);
});

// ---- submit: happy path ----------------------------------------------------
test("a valid entitled submit reserves, submits to Braket, and returns 202", async () => {
  const ddb = stubDdb();
  const braket = stubBraket();
  const res = await core(ddb, braket)(submitEvent(goodClaims, goodBody));
  assert.equal(res.statusCode, 202);
  const out = JSON.parse(res.body);
  assert.equal(out.taskArn, "arn:aws:braket:eu-north-1:111:quantum-task/abc");
  assert.equal(out.estMicros, 1_750_000);
  assert.match(out.circuitHash, /^[0-9a-f]{64}$/);
  // Reservation happened BEFORE the Braket submit.
  const order = ddb.calls.map((c) => c.name);
  assert.ok(order.indexOf("TransactWriteItemsCommand") < order.length);
  assert.equal(braket.calls.length, 1);
  assert.equal(braket.calls[0].deviceArn, "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet");
});

// ---- entitlement gate ------------------------------------------------------
test("an unverified email cannot spend — 403, no reservation, no submit", async () => {
  const ddb = stubDdb();
  const braket = stubBraket();
  const res = await core(ddb, braket)(submitEvent({ sub: "u1", email_verified: "false" }, goodBody));
  assert.equal(res.statusCode, 403);
  assert.match(JSON.parse(res.body).error, /email/);
  assert.equal(braket.calls.length, 0);
  assert.ok(!ddb.calls.some((c) => c.name === "TransactWriteItemsCommand"));
});

test("a verified user WITHOUT the server-minted credential cannot spend — 403", async () => {
  const ddb = stubDdb({ credentialed: false });
  const braket = stubBraket();
  const res = await core(ddb, braket)(submitEvent(goodClaims, goodBody));
  assert.equal(res.statusCode, 403);
  assert.match(JSON.parse(res.body).error, /credential/);
  assert.equal(braket.calls.length, 0);
});

// ---- caps + kill-switch ----------------------------------------------------
test("over the lifetime cap → 402, and Braket is never called", async () => {
  const ddb = stubDdb({ transact: canceled(R(0)) });
  const braket = stubBraket();
  const res = await core(ddb, braket)(submitEvent(goodClaims, goodBody));
  assert.equal(res.statusCode, 402);
  assert.match(JSON.parse(res.body).error, /lifetime/);
  assert.equal(braket.calls.length, 0);
});

test("over the daily global cap → 503 over-daily-budget", async () => {
  const ddb = stubDdb({ transact: canceled(R(1)) });
  const res = await core(ddb, stubBraket())(submitEvent(goodClaims, goodBody));
  assert.equal(res.statusCode, 503);
  assert.match(JSON.parse(res.body).error, /daily/);
});

test("the kill-switch (KILL flag) → 503 qpu-disabled", async () => {
  const ddb = stubDdb({ transact: canceled(R(3)) });
  const res = await core(ddb, stubBraket())(submitEvent(goodClaims, goodBody));
  assert.equal(res.statusCode, 503);
  assert.match(JSON.parse(res.body).error, /disabled/);
});

// ---- idempotency -----------------------------------------------------------
test("a duplicate idempotency key returns the cached task, never a double-charge", async () => {
  // The reservation fails on the Put condition [2] (key exists); we must return
  // the existing task, NOT a spurious 402 even if the cap condition also failed.
  const existing = {
    idempotencyKey: { S: "abcd-1234-efgh" },
    userId: { S: "u1" }, // owned by the caller
    device: { S: DEVICE },
    shots: { N: "1000" },
    estMicros: { N: "1750000" },
    status: { S: "SUBMITTED" },
    taskArn: { S: "arn:aws:braket:eu-north-1:111:quantum-task/prior" },
    createdAt: { N: String(NOW) },
  };
  const ddb = stubDdb({ transact: canceled([{ Code: "ConditionalCheckFailed" }, { Code: "None" }, { Code: "ConditionalCheckFailed" }, { Code: "None" }]), existingTask: existing });
  const braket = stubBraket();
  const res = await core(ddb, braket)(submitEvent(goodClaims, goodBody));
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.duplicate, true);
  assert.equal(out.task.taskArn, "arn:aws:braket:eu-north-1:111:quantum-task/prior");
  assert.equal(braket.calls.length, 0); // never re-submitted
});

// ---- compensating release + the critical "never refund a real task" fix ----
test("a Braket submit failure releases the reservation and returns 502", async () => {
  const ddb = stubDdb();
  const braket = stubBraket(undefined, Object.assign(new Error("boom"), { name: "ServiceError" }));
  const res = await core(ddb, braket)(submitEvent(goodClaims, goodBody));
  assert.equal(res.statusCode, 502);
  // Two TransactWriteItems: the reservation, then the compensating release.
  const transacts = ddb.calls.filter((c) => c.name === "TransactWriteItemsCommand");
  assert.equal(transacts.length, 2);
  // The release decrements spent by the negative cost...
  const release = transacts[1].input.TransactItems;
  assert.equal(release[0].Update.ExpressionAttributeValues[":neg"].N, "-1750000");
  // ...and is idempotent — it only fires while the task is still RESERVED.
  assert.match(release[2].Update.ConditionExpression, /RESERVED|:reserved/);
  assert.equal(release[2].Update.ExpressionAttributeValues[":reserved"].S, "RESERVED");
});

test("a task that IS created is NEVER refunded by a later status-write failure", async () => {
  // The critical bug: CreateQuantumTask succeeds (real, billable task) but the
  // status/taskArn write throws. The reservation must STAY committed, not refund.
  const ddb = stubDdb({ failUpdate: true });
  const braket = stubBraket();
  const res = await core(ddb, braket)(submitEvent(goodClaims, goodBody));
  assert.equal(res.statusCode, 202); // success — a real task exists
  assert.equal(JSON.parse(res.body).taskArn, "arn:aws:braket:eu-north-1:111:quantum-task/abc");
  // EXACTLY ONE TransactWriteItems (the reservation) — NO compensating release.
  assert.equal(ddb.calls.filter((c) => c.name === "TransactWriteItemsCommand").length, 1);
});

test("a duplicate idempotency key owned by ANOTHER user returns 409, never their task", async () => {
  const theirs = {
    idempotencyKey: { S: "abcd-1234-efgh" },
    userId: { S: "someone-else" },
    status: { S: "SUBMITTED" },
    taskArn: { S: "arn:aws:braket:eu-north-1:111:quantum-task/theirs" },
    shots: { N: "1000" },
    estMicros: { N: "1750000" },
    createdAt: { N: String(NOW) },
  };
  const ddb = stubDdb({ transact: canceled(R(2)), existingTask: theirs });
  const res = await core(ddb, stubBraket())(submitEvent(goodClaims, goodBody));
  assert.equal(res.statusCode, 409);
  assert.match(JSON.parse(res.body).error, /conflict/);
  assert.ok(!res.body.includes("theirs")); // no cross-tenant leak
});

// ---- budget + dispatch -----------------------------------------------------
test("GET /qpu/budget returns cap, spent, remaining, credentialed, and the task list", async () => {
  const ddb = stubDdb({
    ledgerUser: { capMicros: { N: "5000000" }, spentMicros: { N: "1750000" } },
    tasks: [{ idempotencyKey: { S: "k1" }, status: { S: "SUBMITTED" }, shots: { N: "1000" }, estMicros: { N: "1750000" }, createdAt: { N: String(NOW) } }],
  });
  const event = { requestContext: { authorizer: { jwt: { claims: goodClaims } }, http: { method: "GET", path: "/qpu/budget" } } };
  const res = await core(ddb, stubBraket())(event);
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.capMicros, 5_000_000);
  assert.equal(out.spentMicros, 1_750_000);
  assert.equal(out.remainingMicros, 3_250_000);
  assert.equal(out.credentialed, true);
  assert.equal(out.tasks.length, 1);
});

test("a fresh user's budget defaults to the full lifetime cap", async () => {
  const ddb = stubDdb({ ledgerUser: null, tasks: [], credentialed: false });
  const event = { requestContext: { authorizer: { jwt: { claims: goodClaims } }, http: { method: "GET", path: "/qpu/budget" } } };
  const out = JSON.parse((await core(ddb, stubBraket())(event)).body);
  assert.equal(out.capMicros, LIFETIME_CAP_MICROS);
  assert.equal(out.remainingMicros, LIFETIME_CAP_MICROS);
  assert.equal(out.credentialed, false);
});

// ---- the server-verified cost-estimate credential --------------------------
const credEvent = (method, body) => ({
  requestContext: { authorizer: { jwt: { claims: goodClaims } }, http: { method, path: "/qpu/credential" } },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test("correctCents replicates the app's component-wise cent settlement", () => {
  // IQM: centsOf(0.30)=30 + centsOf(0.00145*shots). 1000 shots → 30 + 145 = 175¢.
  assert.equal(correctCents(1000), 175);
  // 100 shots → 30 + centsOf(0.145)=15 → 45¢ (half-up on 14.5).
  assert.equal(correctCents(100), 45);
});

test("requiredShotsFor stays in [100,1000] and skips the 204..210 collision band", () => {
  for (let i = 0; i < 5000; i++) {
    const s = requiredShotsFor(`user-${i}-${(i * 2654435761) >>> 0}`);
    assert.ok(s >= 100 && s <= 1000, `out of range: ${s}`);
    assert.ok(s < 204 || s > 210, `landed in the collision band: ${s}`);
  }
});

test("GET /qpu/credential returns the per-user challenge + status", async () => {
  const ddb = stubDdb({ credentialed: false });
  const out = JSON.parse((await core(ddb, stubBraket())(credEvent("GET"))).body);
  assert.equal(out.credentialed, false);
  assert.equal(out.requiredShots, requiredShotsFor("u1"));
  assert.equal(out.device, DEVICE);
});

test("POST /qpu/credential mints the credential for a correct price, rejects a wrong one", async () => {
  const shots = requiredShotsFor("u1");
  // Correct answer → minted (a PutItem to CRED#u1).
  const ok = stubDdb({ credentialed: false });
  const okRes = JSON.parse((await core(ok, stubBraket())(credEvent("POST", { answerCents: correctCents(shots) }))).body);
  assert.equal(okRes.credentialed, true);
  const put = ok.calls.find((c) => c.name === "PutItemCommand");
  assert.equal(put.input.Item.pk.S, "CRED#u1");
  assert.equal(put.input.Item.costEstimate.BOOL, true);

  // Wrong answer → NOT minted.
  const bad = stubDdb({ credentialed: false });
  const badRes = JSON.parse((await core(bad, stubBraket())(credEvent("POST", { answerCents: correctCents(shots) + 1 }))).body);
  assert.equal(badRes.credentialed, false);
  assert.ok(!bad.calls.some((c) => c.name === "PutItemCommand"));
});

test("POST /qpu/credential is idempotent once minted and validates the body", async () => {
  const already = stubDdb({ credentialed: true });
  const res = JSON.parse((await core(already, stubBraket())(credEvent("POST", { answerCents: 999 }))).body);
  assert.equal(res.credentialed, true); // already had it; no re-check, no re-mint
  assert.ok(!already.calls.some((c) => c.name === "PutItemCommand"));

  const bad = await core(stubDdb({ credentialed: false }), stubBraket())(credEvent("POST", { answerCents: -1 }));
  assert.equal(bad.statusCode, 400);
});

test("the edge gate rejects requests missing the x-qpu-edge secret when configured", async () => {
  const withEdge = (ddb) =>
    createHandlerCore({
      ddb,
      braket: stubBraket(),
      ledgerTable: "ledger",
      tasksTable: "tasks",
      resultsBucket: "b",
      edgeSecret: "s3cr3t",
      now: () => NOW,
    });
  const budgetReq = (headers) => ({
    headers,
    requestContext: { authorizer: { jwt: { claims: goodClaims } }, http: { method: "GET", path: "/qpu/budget" } },
  });

  // Missing header → 403 (a direct hit on the API URL, bypassing CloudFront/WAF).
  assert.equal((await withEdge(stubDdb())(budgetReq({}))).statusCode, 403);
  // Wrong secret → 403.
  assert.equal((await withEdge(stubDdb())(budgetReq({ "x-qpu-edge": "nope" }))).statusCode, 403);
  // Correct secret (injected by CloudFront) → passes through to the handler.
  assert.equal((await withEdge(stubDdb())(budgetReq({ "x-qpu-edge": "s3cr3t" }))).statusCode, 200);
  // Unset edgeSecret (pre-edge-deploy) → the check is skipped entirely.
  assert.equal((await core(stubDdb(), stubBraket())(budgetReq({}))).statusCode, 200);
});

test("no verified sub → 401; unknown route → 405; bad JSON → 400", async () => {
  const c = core(stubDdb(), stubBraket());
  assert.equal((await c({ requestContext: { http: { method: "POST", path: "/qpu/submit" } } })).statusCode, 401);
  assert.equal((await c({ requestContext: { authorizer: { jwt: { claims: goodClaims } }, http: { method: "DELETE", path: "/qpu/x" } } })).statusCode, 405);
  const bad = { requestContext: { authorizer: { jwt: { claims: goodClaims } }, http: { method: "POST", path: "/qpu/submit" } }, body: "{not json" };
  assert.equal((await c(bad)).statusCode, 400);
});
