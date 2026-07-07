// quantum-qpu-submit: the ONLY path by which a learner spends real money on QPU
// hardware. Submission runs server-side under the platform's Braket permissions
// (the browser never holds AWS creds — it presents a Cognito JWT); every run is
// gated, hard-capped, and accounted BEFORE the task is created.
//
// The per-request logic lives here with its dependencies (DynamoDB, Braket,
// config) injected, so the whole money path unit-tests offline under
// `node --test` with stubs — no live AWS, no real spend. index.mjs wires the
// real clients. Mirrors lambda/sync + lambda/tutor's DI-core pattern.
//
// Spend safety rests on ONE atomic DynamoDB TransactWriteItems that reserves
// budget BEFORE the Braket submit: per-user lifetime cap, per-day global cap,
// idempotency, and a global kill-switch must ALL pass or nothing commits. A
// failed submit runs a compensating release. See createHandlerCore below.

import { createHash } from "node:crypto";
import {
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CreateQuantumTaskCommand } from "@aws-sdk/client-braket";

// ---- Launch posture (user-approved 2026-07-07) -----------------------------
// Money is tracked in integer MICRO-DOLLARS — no float drift ($1.75 = 1_750_000).
export const DEVICE = "iqm_garnet";
export const DEVICE_ARN = "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet";
export const DEVICE_REGION = "eu-north-1";
export const MAX_SHOTS = 1000; // hard ceiling → $1.75 max per run on IQM Garnet
export const LIFETIME_CAP_MICROS = 5_000_000; // $5.00 per user, forever
export const DAILY_CAP_MICROS = 15_000_000; // $15.00/day GLOBAL kill-switch
// Entitlement: a valid JWT is authentication, not authorization to spend. A user
// must have a verified email AND have completed the hardware module (the
// server-verified "Cost-Estimate credential" — proven simulator + cost work).
export const REQUIRED_SECTION_KEY = "qc:section:02-hardware";
// IQM Garnet pricing in micro-dollars. Kept in lockstep with lib/utils/cost.py
// PRICING["IQM"] (per_task 0.30, per_shot 0.00145) — a node --test asserts it.
export const IQM_PER_TASK_MICROS = 300_000; // $0.30
export const IQM_PER_SHOT_MICROS = 1_450; // $0.00145
export const KILL_KEY = "KILL";

/** Total committed cost of a run, in micro-dollars (integer). */
export function costMicros(shots) {
  return IQM_PER_TASK_MICROS + IQM_PER_SHOT_MICROS * shots;
}

/** UTC calendar day "YYYY-MM-DD" — the per-day global kill-switch bucket. */
export function utcDay(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Server-authoritative circuit hash — the tamper-proof R9 badge provenance. */
export function circuitHash(qasm) {
  return createHash("sha256").update(qasm.trim(), "utf8").digest("hex");
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const MAX_QASM_BYTES = 100_000;
const IDEMPOTENCY_RE = /^[A-Za-z0-9._-]{8,200}$/;

/** Validate a POST /qpu/submit body. Returns {error} or the parsed request. */
export function validateSubmitBody(body) {
  if (typeof body !== "object" || body === null) return { error: "body must be an object" };
  const { device, shots, qasm, idempotencyKey } = body;
  if (device !== DEVICE) return { error: `device must be "${DEVICE}"` };
  if (!Number.isInteger(shots) || shots < 1 || shots > MAX_SHOTS) {
    return { error: `shots must be an integer in 1..${MAX_SHOTS}` };
  }
  if (typeof qasm !== "string" || qasm.trim().length === 0) {
    return { error: "qasm must be a non-empty string" };
  }
  if (Buffer.byteLength(qasm, "utf8") > MAX_QASM_BYTES) {
    return { error: `qasm exceeds ${MAX_QASM_BYTES} bytes` };
  }
  if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_RE.test(idempotencyKey)) {
    return { error: "idempotencyKey must be 8..200 chars of [A-Za-z0-9._-]" };
  }
  return { device, shots, qasm, idempotencyKey };
}

function taskSummary(item) {
  return {
    idempotencyKey: item.idempotencyKey.S,
    device: item.device?.S,
    shots: Number(item.shots?.N ?? 0),
    estMicros: Number(item.estMicros?.N ?? 0),
    status: item.status?.S,
    taskArn: item.taskArn?.S ?? null,
    circuitHash: item.circuitHash?.S ?? null,
    createdAt: Number(item.createdAt?.N ?? 0),
  };
}

export function createHandlerCore({
  ddb,
  braket,
  ledgerTable,
  tasksTable,
  progressTable,
  resultsBucket,
  now = () => Date.now(),
}) {
  // Is this user allowed to spend real money at all?
  async function entitlement(sub, emailVerified) {
    if (!emailVerified) return { code: 403, error: "email-not-verified" };
    const res = await ddb.send(
      new GetItemCommand({ TableName: progressTable, Key: { userId: { S: sub } } }),
    );
    let data = {};
    if (res.Item?.data?.S) {
      try {
        data = JSON.parse(res.Item.data.S);
      } catch {
        data = {};
      }
    }
    if (data[REQUIRED_SECTION_KEY] !== "1") return { code: 403, error: "credential-required" };
    return null;
  }

  async function budget(sub) {
    const [ledger, tasks] = await Promise.all([
      ddb.send(new GetItemCommand({ TableName: ledgerTable, Key: { pk: { S: `USER#${sub}` } } })),
      ddb.send(
        new QueryCommand({
          TableName: tasksTable,
          IndexName: "userId-index",
          KeyConditionExpression: "userId = :u",
          ExpressionAttributeValues: { ":u": { S: sub } },
          ScanIndexForward: false,
          Limit: 50,
        }),
      ),
    ]);
    const capMicros = Number(ledger.Item?.capMicros?.N ?? LIFETIME_CAP_MICROS);
    const spentMicros = Number(ledger.Item?.spentMicros?.N ?? 0);
    return json(200, {
      capMicros,
      spentMicros,
      remainingMicros: Math.max(0, capMicros - spentMicros),
      tasks: (tasks.Items ?? []).map(taskSummary),
    });
  }

  async function submit(sub, emailVerified, rawBody) {
    let body;
    try {
      body = JSON.parse(rawBody ?? "");
    } catch {
      return json(400, { error: "invalid JSON body" });
    }
    const parsed = validateSubmitBody(body);
    if (parsed.error) return json(400, { error: parsed.error });

    const blocked = await entitlement(sub, emailVerified);
    if (blocked) return json(blocked.code, { error: blocked.error });

    const { shots, qasm, idempotencyKey } = parsed;
    const cost = costMicros(shots);
    const hash = circuitHash(qasm);
    const ts = now();
    const day = utcDay(ts);
    const dayTtl = Math.floor(ts / 1000) + 2 * 86_400;

    // --- The atomic reservation: cap + daily + idempotency + kill, all-or-none.
    try {
      await ddb.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Update: {
                TableName: ledgerTable,
                Key: { pk: { S: `USER#${sub}` } },
                UpdateExpression:
                  "SET capMicros = if_not_exists(capMicros, :cap) ADD spentMicros :cost",
                ConditionExpression:
                  "if_not_exists(spentMicros, :z) + :cost <= if_not_exists(capMicros, :cap)",
                ExpressionAttributeValues: {
                  ":cap": { N: String(LIFETIME_CAP_MICROS) },
                  ":cost": { N: String(cost) },
                  ":z": { N: "0" },
                },
              },
            },
            {
              Update: {
                TableName: ledgerTable,
                Key: { pk: { S: `DAY#${day}` } },
                UpdateExpression: "ADD dayMicros :cost SET expiresAt = :ttl",
                ConditionExpression: "if_not_exists(dayMicros, :z) + :cost <= :daily",
                ExpressionAttributeValues: {
                  ":cost": { N: String(cost) },
                  ":z": { N: "0" },
                  ":daily": { N: String(DAILY_CAP_MICROS) },
                  ":ttl": { N: String(dayTtl) },
                },
              },
            },
            {
              Put: {
                TableName: tasksTable,
                Item: {
                  idempotencyKey: { S: idempotencyKey },
                  userId: { S: sub },
                  device: { S: DEVICE },
                  shots: { N: String(shots) },
                  estMicros: { N: String(cost) },
                  circuitHash: { S: hash },
                  status: { S: "RESERVED" },
                  createdAt: { N: String(ts) },
                },
                ConditionExpression: "attribute_not_exists(idempotencyKey)",
              },
            },
            {
              ConditionCheck: {
                TableName: ledgerTable,
                Key: { pk: { S: KILL_KEY } },
                ConditionExpression: "attribute_not_exists(disabled) OR disabled = :false",
                ExpressionAttributeValues: { ":false": { BOOL: false } },
              },
            },
          ],
        }),
      );
    } catch (err) {
      if (err?.name === "TransactionCanceledException") {
        const r = err.CancellationReasons ?? [];
        const failed = (i) => r[i]?.Code === "ConditionalCheckFailed";
        // Idempotency FIRST: a retry of an already-accepted request must return
        // the cached task, never a spurious over-cap 402 (its cost is already
        // committed to the ledger from the first call).
        if (failed(2)) {
          const existing = await ddb.send(
            new GetItemCommand({
              TableName: tasksTable,
              Key: { idempotencyKey: { S: idempotencyKey } },
            }),
          );
          if (existing.Item) return json(200, { duplicate: true, task: taskSummary(existing.Item) });
          return json(409, { error: "idempotency-conflict" });
        }
        if (failed(3)) return json(503, { error: "qpu-disabled" }); // kill-switch tripped
        if (failed(0)) return json(402, { error: "over-lifetime-budget" });
        if (failed(1)) return json(503, { error: "over-daily-budget" });
      }
      throw err;
    }

    // --- Reservation held: submit to real hardware, then commit or release.
    try {
      const action = JSON.stringify({
        braketSchemaHeader: { name: "braket.ir.openqasm.program", version: "1" },
        source: qasm,
      });
      const res = await braket.send(
        new CreateQuantumTaskCommand({
          deviceArn: DEVICE_ARN,
          shots,
          action,
          deviceParameters: "{}",
          outputS3Bucket: resultsBucket,
          outputS3KeyPrefix: `${sub}/${idempotencyKey}`,
        }),
      );
      const taskArn = res.quantumTaskArn;
      await ddb.send(
        new UpdateItemCommand({
          TableName: tasksTable,
          Key: { idempotencyKey: { S: idempotencyKey } },
          UpdateExpression: "SET #s = :s, taskArn = :arn",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":s": { S: "SUBMITTED" }, ":arn": { S: taskArn } },
        }),
      );
      return json(202, { taskArn, estMicros: cost, circuitHash: hash });
    } catch (submitErr) {
      // Compensating release: no task was created, so refund the reservation.
      // Never let a failed submit permanently burn a learner's budget.
      await releaseReservation(sub, day, cost, idempotencyKey).catch(() => {});
      return json(502, { error: "braket-submit-failed" });
    }
  }

  async function releaseReservation(sub, day, cost, idempotencyKey) {
    await ddb.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Update: {
              TableName: ledgerTable,
              Key: { pk: { S: `USER#${sub}` } },
              UpdateExpression: "ADD spentMicros :neg",
              ExpressionAttributeValues: { ":neg": { N: String(-cost) } },
            },
          },
          {
            Update: {
              TableName: ledgerTable,
              Key: { pk: { S: `DAY#${day}` } },
              UpdateExpression: "ADD dayMicros :neg",
              ExpressionAttributeValues: { ":neg": { N: String(-cost) } },
            },
          },
          {
            Update: {
              TableName: tasksTable,
              Key: { idempotencyKey: { S: idempotencyKey } },
              UpdateExpression: "SET #s = :s",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: { ":s": { S: "RELEASED" } },
            },
          },
        ],
      }),
    );
  }

  return async function core(event) {
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    const sub = claims?.sub;
    if (!sub) return json(401, { error: "unauthorized" });
    const emailVerified = claims.email_verified === "true" || claims.email_verified === true;
    const method = event.requestContext?.http?.method;
    const path = event.requestContext?.http?.path ?? "";

    if (method === "GET" && path.endsWith("/budget")) return budget(sub);
    if (method === "POST" && path.endsWith("/submit")) return submit(sub, emailVerified, event.body);
    return json(405, { error: "method not allowed" });
  };
}
