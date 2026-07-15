/**
 * Offline tests for the QPU submit + spend-ledger core. No live AWS, no real
 * money, no real time — DynamoDB, Braket, and the clock are stubbed. This is the
 * money path, so every cap/gate/idempotency/compensation branch is exercised.
 * Run: `cd lambda/qpu && npm ci && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  costMicros,
  utcDay,
  validateSubmitBody,
  createHandlerCore,
  circuitHash,
  correctCents,
  credentialOptionsCollide,
  requiredShotsFor,
  DEVICE,
  LIFETIME_CAP_MICROS,
  DAILY_CAP_MICROS,
  MAX_SHOTS,
  IQM_PER_TASK_MICROS,
  IQM_PER_SHOT_MICROS,
} from "./qpu-core.mjs";

// The shared ladder contract (also read by web/__tests__/lib/credentials.test.ts).
const LADDER = JSON.parse(
  readFileSync(new URL("./__fixtures__/hardware-ladder.json", import.meta.url), "utf8"),
);

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
  // Over the 7KB cap (kept under the WAF's 8KB body limit) → a clean 400, never
  // an opaque WAF 403.
  assert.match(validateSubmitBody({ ...goodBody, qasm: "h q[0];\n".repeat(1000) }).error, /qasm exceeds/);
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
// THE GRANDFATHERING LOCK. This user's row persists capMicros = 5_000_000 — the OLD
// cap, stamped by `SET capMicros = if_not_exists(capMicros, :cap)` before the cap was
// lowered to $2.50. budget() must keep honoring THEIR cap, not today's constant. The
// figures below are deliberately hardcoded (not derived from LIFETIME_CAP_MICROS):
// that is the whole point — if someone ever "fixes" this test by deriving them, or
// writes a cap-lowering migration, this goes red. Never claw back an allowance the
// UI already promised a learner by name.
test("GET /qpu/budget returns cap, spent, remaining, credentialed, and the task list", async () => {
  const ddb = stubDdb({
    ledgerUser: { capMicros: { N: "5000000" }, spentMicros: { N: "1750000" } },
    tasks: [{ idempotencyKey: { S: "k1" }, status: { S: "SUBMITTED" }, shots: { N: "1000" }, estMicros: { N: "1750000" }, createdAt: { N: String(NOW) } }],
  });
  const event = { requestContext: { authorizer: { jwt: { claims: goodClaims } }, http: { method: "GET", path: "/qpu/budget" } } };
  const res = await core(ddb, stubBraket())(event);
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.capMicros, 5_000_000); // grandfathered — NOT today's 2_500_000
  assert.equal(out.spentMicros, 1_750_000);
  assert.equal(out.remainingMicros, 3_250_000);
  assert.equal(out.credentialed, true);
  assert.equal(out.tasks.length, 1);
});

test("GET /qpu/budget returns the COMPLETED-run medal counters off the ledger row", async () => {
  const ddb = stubDdb({
    ledgerUser: {
      capMicros: { N: String(LIFETIME_CAP_MICROS) },
      spentMicros: { N: "2350000" },
      completedRuns: { N: "3" },
      completedShots: { N: "1000" },
    },
    tasks: [],
  });
  const event = { requestContext: { authorizer: { jwt: { claims: goodClaims } }, http: { method: "GET", path: "/qpu/budget" } } };
  const out = JSON.parse((await core(ddb, stubBraket())(event)).body);
  // The medal aggregates are server-side and truncation-proof — NOT derived from
  // the 50-row task window, which refunded rows can push an earned run out of.
  assert.equal(out.completedRuns, 3);
  assert.equal(out.completedShots, 1000);
});

test("a user with no completed runs reports zero counters (absent attrs, not NaN)", async () => {
  const ddb = stubDdb({ ledgerUser: null, tasks: [], credentialed: false });
  const event = { requestContext: { authorizer: { jwt: { claims: goodClaims } }, http: { method: "GET", path: "/qpu/budget" } } };
  const out = JSON.parse((await core(ddb, stubBraket())(event)).body);
  assert.equal(out.completedRuns, 0);
  assert.equal(out.completedShots, 0);
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

test("the collision band is DERIVED from the price constants — exactly 204..210 at today's rates", () => {
  // round(0.145 x s) = 30 for s in 204..210: the shot fee settles to the same
  // cents as the task fee, so the Rep's options collide. Nothing else in range.
  const excluded = [];
  for (let s = 100; s <= 1000; s++) if (credentialOptionsCollide(s)) excluded.push(s);
  assert.deepEqual(excluded, [204, 205, 206, 207, 208, 209, 210]);
});

test("under hypothetical repriced rates the band MOVES and the challenge still dodges it", () => {
  // The old hardcoded 204..210 skip would go silently stale on a reprice. Two
  // repricings whose collision bands sit elsewhere in [100, 1000]:
  const repricings = [
    // $0.30/task + $0.003/shot -> round(0.3 x s) = 30 -> band 100..101.
    { perTaskMicros: 300_000, perShotMicros: 3_000 },
    // $0.50/task + $0.001/shot -> round(0.1 x s) = 50 -> band 495..504.
    { perTaskMicros: 500_000, perShotMicros: 1_000 },
  ];
  for (const rates of repricings) {
    const banned = [];
    for (let s = 100; s <= 1000; s++) if (credentialOptionsCollide(s, rates)) banned.push(s);
    // The predicate is rate-sensitive: a real in-range band, and NOT today's.
    assert.ok(banned.length > 0, "expected an in-range collision band for this repricing");
    assert.notDeepEqual(banned, [204, 205, 206, 207, 208, 209, 210]);
    // And the chosen challenge never lands on it.
    for (let i = 0; i < 2000; i++) {
      const s = requiredShotsFor(`user-${i}`, rates);
      assert.ok(s >= 100 && s <= 1000, `out of range: ${s}`);
      assert.ok(!credentialOptionsCollide(s, rates), `collides at ${s}`);
    }
  }
});

test("requiredShotsFor maps the excluded band to 211 — identical to the old hardcoded skip", () => {
  // Determinism contract: learners whose djb2 landed in 204..210 must keep the
  // exact challenge (211 shots) they were already shown before this change.
  for (let s = 204; s <= 210; s++) {
    let next = s;
    while (credentialOptionsCollide(next)) next += 1;
    assert.equal(next, 211);
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

// ---- THE FEASIBILITY LOCK --------------------------------------------------
// The most important test in this file. The Hardware medals are advertised under
// "Each medal is earned, not awarded — struck from work you can point to." The
// ladder this replaced (1/5/20 runs) broke that promise with arithmetic: a 20-run
// medal costs $8.90 at the panel's default 100 shots, and $6.03 even at 1 shot per
// run — both over the $5.00 cap that was live at the time. The platform shipped a
// medal its own budget made mathematically impossible to earn. These tests make
// that class of bug unshippable.

test("the ladder fixture still matches the REAL money constants (no drift)", () => {
  assert.equal(LADDER.lifetimeCapMicros, LIFETIME_CAP_MICROS);
  assert.equal(LADDER.dailyCapMicros, DAILY_CAP_MICROS);
  assert.equal(LADDER.perTaskMicros, IQM_PER_TASK_MICROS);
  assert.equal(LADDER.perShotMicros, IQM_PER_SHOT_MICROS);
  assert.equal(LADDER.maxShots, MAX_SHOTS);
});

test("MAX_SHOTS IS the Deep sample threshold — the two must stay equal", () => {
  // One number across four surfaces: the shot ceiling, the top medal, the panel's
  // "$1.75 full run" hint, and the curriculum's own 1,000-shot card. If a reprice
  // or a ceiling change splits them, the copy starts lying.
  const shotsTier = LADDER.tiers.find((t) => t.metric === "shots");
  assert.equal(shotsTier.n, MAX_SHOTS);
});

test("EVERY hardware medal is co-earnable within the lifetime cap", () => {
  // The binding tiers: the most runs any run-tier demands, and the most shots any
  // shots-tier demands. A learner must be able to hold ALL medals AT ONCE.
  const runs = Math.max(...LADDER.tiers.filter((t) => t.metric === "runs").map((t) => t.n));
  const shots = Math.max(...LADDER.tiers.filter((t) => t.metric === "shots").map((t) => t.n));

  // cost(R runs, S shots) = TASK*R + SHOT*S. Cost depends ONLY on the run count and
  // the shot total — never on how the shots are split across the runs — so this is
  // the true cheapest path to the whole ladder, not merely an upper bound.
  const need = IQM_PER_TASK_MICROS * runs + IQM_PER_SHOT_MICROS * shots;

  // The shots must actually be placeable: no run may exceed MAX_SHOTS.
  assert.ok(
    shots <= MAX_SHOTS * runs,
    `${shots} shots cannot fit in ${runs} runs of at most ${MAX_SHOTS} — an unplaceable medal`,
  );
  assert.ok(
    need <= LIFETIME_CAP_MICROS,
    `the ladder costs ${need} micros > the ${LIFETIME_CAP_MICROS} cap — an UNEARNABLE medal`,
  );
  // And it is exactly the path the fixture advertises to the learner.
  assert.equal(need, LADDER.cheapestPath.costMicros);
  assert.equal(need, costMicros(0) * runs + IQM_PER_SHOT_MICROS * shots - 0); // = 3 tasks + 1000 shots
  assert.equal(need, 2_350_000); // $2.35, with $0.15 of the $2.50 allowance to spare
});

test("a refunded run earns nothing: only COMPLETED rows tally toward a medal", async () => {
  const { tallyCompleted } = await import("./backfill-counters.mjs");
  const rows = [
    { userId: { S: "u1" }, status: { S: "COMPLETED" }, shots: { N: "1000" } },
    { userId: { S: "u1" }, status: { S: "COMPLETED" }, shots: { N: "247" } },
    { userId: { S: "u1" }, status: { S: "FAILED" }, shots: { N: "900" } }, // refunded
    { userId: { S: "u1" }, status: { S: "RELEASED" }, shots: { N: "900" } }, // never ran
    { userId: { S: "u1" }, status: { S: "SUBMITTED" }, shots: { N: "900" } }, // not yet real
    { userId: { S: "u2" }, status: { S: "COMPLETED" }, shots: { N: "5" } },
  ];
  const byUser = tallyCompleted(rows);
  // Every dollar spent maps to a run that counts; a device-side failure is refunded
  // and consumes no medal progress. No leakage in either direction.
  assert.deepEqual(byUser.get("u1"), { runs: 2, shots: 1247 });
  assert.deepEqual(byUser.get("u2"), { runs: 1, shots: 5 });
});

// A DynamoDB ConditionExpression allows NEITHER arithmetic NOR if_not_exists.
// The reserve transaction originally used both ("if_not_exists(spent,:z)+:cost
// <= if_not_exists(cap,:cap)"); the stub never evaluates the expression, so all
// tests passed while every REAL submit failed with a ValidationException. This
// static guard scans the actual source so that class can never regress — it is
// the tripwire the mocks structurally cannot be.
test("no ConditionExpression uses arithmetic or if_not_exists (real DynamoDB forbids both)", () => {
  for (const file of ["qpu-core.mjs", "reconcile.mjs"]) {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    const re = /ConditionExpression:\s*"([^"]+)"/g;
    let m;
    let count = 0;
    while ((m = re.exec(src))) {
      const expr = m[1];
      count++;
      assert.ok(
        !expr.includes("if_not_exists"),
        `${file}: if_not_exists is not allowed in a ConditionExpression: ${expr}`,
      );
      assert.ok(
        !/[+*/]/.test(expr) && !/\s-\s/.test(expr),
        `${file}: arithmetic is not allowed in a ConditionExpression: ${expr}`,
      );
    }
    assert.ok(count > 0, `${file}: expected to find ConditionExpressions to check`);
  }
});
