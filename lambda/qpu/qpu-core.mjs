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
  PutItemCommand,
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
// The PLATFORM pays Braket for every learner run — this is a sponsored allowance,
// not an invoice. MAX_SHOTS doubles as the "Deep sample" medal threshold (1,000
// shots); the two must stay equal. Every hardware medal must be co-earnable inside
// this cap (3 runs + 1,000 shots = $2.35) — see the feasibility lock in
// qpu-core.test.mjs, which fails if a tier is ever made unearnable.
// WITHDRAWN 2026-07-28. The platform no longer sponsors hardware runs: nothing
// is given away, so a new learner's default allowance is ZERO and every run is
// funded from purchased credits.
//
// This is a DEFAULT, not a migration. Learners already stamped with a cap keep
// it — `capMicros` is read off the row and only falls back to this constant
// when the row has none. Retracting an allowance the UI already named to a
// specific person is the one lie this product cannot tell, so the withdrawal
// applies going forward and never reaches backwards. One production row is
// grandfathered this way at the time of writing.
export const LIFETIME_CAP_MICROS = 0;
export const DAILY_CAP_MICROS = 15_000_000; // $15.00/day GLOBAL kill-switch
// Entitlement: a valid JWT is authentication, not authorization to spend. On top
// of a verified email we require a SERVER-MINTED "cost-estimate" credential — the
// learner must correctly price an IQM Garnet run (POST /qpu/credential), and the
// server RE-COMPUTES the true cost before minting. The credential lives in the
// server-only ledger table (CRED#<sub>), so unlike a client-authored qc:* flag it
// cannot be forged by a localStorage set or a sync PUT. This is genuine
// server-verified competency (exactly what a spend gate should check: "prove you
// can price a run before spending real money"), NOT cryptographic sybil-proofing —
// the hard caps below (per-user $2.50 lifetime + $15/day global) remain the real
// spend boundary and are sized assuming the gate can still be scripted past.
// IQM Garnet pricing in micro-dollars. Kept in lockstep with lib/utils/cost.py
// PRICING["IQM"] (per_task 0.30, per_shot 0.00145) — a node --test asserts it.
export const IQM_PER_TASK_MICROS = 300_000; // $0.30
export const IQM_PER_SHOT_MICROS = 1_450; // $0.00145
export const KILL_KEY = "KILL";

// ---- Credit-wallet metering (the paid tier of the same spend fence) ---------
// 1 credit = $0.01 = 10,000 micro-dollars — the dollar peg quantum-stripe sells
// at (CATALOG in lambda/stripe/index.mjs; creditsToUsd in web/src/lib/pricing.ts).
// Policy: the sponsored allowance funds a run first (the free funnel is
// untouched); a run that no longer fits the allowance is debited from the
// learner's PAID wallet, atomically, under the same day-cap + kill-switch. No
// split funding — a run is entirely allowance or entirely wallet.
export const MICROS_PER_CREDIT = 10_000;

/** Pinned throw message: metered pricing without a usable factor is a bug in
 *  the CALLER — the composition gate below refuses metering when the deployed
 *  config is absent, so a bare call here means a path bypassed that gate. */
export const RATE_FACTOR_REQUIRED =
  "qpu-core: rate factor missing or invalid; metered pricing refused";

/** Pinned log line for a wallet table configured WITHOUT a usable rate factor.
 *  Emitted once per cold start so the misconfiguration is alarmable — its
 *  runtime symptom (every over-allowance submit 402s) is indistinguishable
 *  from metering being off on purpose. Never logs the offending value. */
export const RATE_CARD_INVALID =
  "qpu: rate card missing or invalid; wallet funding disabled";

/** Whole credits for a micro-dollar cost — rounded UP, so a fraction of a cent
 *  can never be dispensed free. Worst case the learner pays 1 credit ($0.01)
 *  above the metered price; the response names the exact creditsCharged.
 *
 *  `factor` converts true AWS cost into the charged credit price. REQUIRED —
 *  its value lives in deployed configuration only (rule 6; index.mjs reads
 *  RATE_CARD from the environment). It multiplies BEFORE the ceil, and it
 *  applies ONLY here: the allowance leg, the DAY# day cap, estMicros and
 *  spentMicros all stay denominated in true cost — those are the rule-16
 *  fences, and pricing must never be able to move a fence. */
export function creditsForMicros(micros, factor) {
  if (!Number.isFinite(factor) || factor <= 0) throw new TypeError(RATE_FACTOR_REQUIRED);
  return Math.ceil((micros * factor) / MICROS_PER_CREDIT);
}

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

// ---- Cost-estimate credential (the server-verified entitlement) -------------
export const CREDENTIAL_TASKS = 1;
const centsOf = (dollars) => Math.round(dollars * 100 + 1e-7);

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** The in-app cost-estimate Rep builds four answer options — the true total plus
 *  the three canonical-misconception distractors (cost-estimate-grade.ts) — and
 *  author-rejects any shots count where two settle to the same cents. This is
 *  that predicate, computed from THIS file's own price constants (rates are
 *  overridable only so tests can probe hypothetical repricings): at today's IQM
 *  rates it excludes exactly 204..210, where round(0.145 x shots) = 30 makes the
 *  shot fee collide with the task fee — and it MOVES with any reprice instead of
 *  leaving a stale hardcoded band that silently strands learners. */
export function credentialOptionsCollide(
  shots,
  { perTaskMicros = IQM_PER_TASK_MICROS, perShotMicros = IQM_PER_SHOT_MICROS } = {},
  tasks = CREDENTIAL_TASKS,
) {
  const perTask = perTaskMicros / 1_000_000;
  const perShot = perShotMicros / 1_000_000;
  const taskFeeCents = centsOf(tasks * perTask);
  const shotFeeCents = centsOf(tasks * perShot * shots);
  const feePerShotCents = centsOf(tasks * shots * (perTask + perShot));
  const correct = taskFeeCents + shotFeeCents;
  return new Set([correct, taskFeeCents, shotFeeCents, feePerShotCents]).size < 4;
}

/** A per-user, deterministic (stateless) shots count in [100, 1000] — so the
 *  credential is not one fixed lookup; each learner prices a specific run. A
 *  colliding count steps forward (wrapping at 1000) to the next solvable one,
 *  so the client can always render a solvable challenge for the server's exact
 *  shots. At today's rates this maps 204..210 to 211 — identical to the old
 *  hardcoded skip, so no learner's outstanding challenge changes. */
export function requiredShotsFor(sub, rates) {
  let s = 100 + (djb2(sub) % 901);
  for (let i = 0; credentialOptionsCollide(s, rates) && i < 901; i++) {
    s = s >= 1000 ? 100 : s + 1;
  }
  return s;
}

/** The correct total cents for an IQM Garnet run, replicating the app's
 *  component-wise half-up cent settlement (cost-estimate-grade.ts) so the server
 *  grader agrees exactly with the in-app grader. */
export function correctCents(shots, tasks = CREDENTIAL_TASKS) {
  const perTask = IQM_PER_TASK_MICROS / 1_000_000;
  const perShot = IQM_PER_SHOT_MICROS / 1_000_000;
  return centsOf(tasks * perTask) + centsOf(tasks * perShot * shots);
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// Kept UNDER the CloudFront/WAF managed SizeRestrictions_BODY limit (8,192 bytes
// for the whole JSON body — edge.yaml's AWSManagedRulesCommonRuleSet). Capping the
// qasm at 7,000 leaves headroom for the JSON envelope + escaping, so a request the
// Lambda accepts is never silently blocked with an opaque WAF 403; an oversized
// circuit instead gets this clear 400. 7KB of OpenQASM is a large IQM Garnet
// circuit (hundreds of gate lines) — generous for the v1 use case.
const MAX_QASM_BYTES = 7_000;
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
    // Funding provenance. Rows from before metering have no attribute — they
    // were all sponsored, so "allowance" is the honest default.
    fundedBy: item.fundedBy?.S ?? "allowance",
    creditsCharged: Number(item.creditsCharged?.N ?? 0),
  };
}

export function createHandlerCore({
  ddb,
  braket,
  ledgerTable,
  tasksTable,
  // The quantum-stripe wallet table (WALLET#<sub> rows). Unset = metering
  // disabled: over-allowance runs 402 exactly as before, env-gated like every
  // other integration in this repo.
  walletTable: walletTableRaw,
  // The factor that converts true AWS cost into charged credits. Injected from
  // deployed configuration (RATE_CARD, resolved out of Secrets Manager at
  // deploy time); its value never appears in this repository (rule 6).
  rateFactor,
  resultsBucket,
  // When set, every request must carry this secret in the x-qpu-edge header —
  // CloudFront (which fronts the WAF) injects it, so a direct hit on the public
  // HTTP API URL (bypassing the WAF) is rejected. Unset = check disabled (before
  // the edge stack is deployed), so the API keeps working env-gated like the rest.
  edgeSecret,
  now = () => Date.now(),
}) {
  // Metering is the PAIR (wallet table, rate factor). A wallet without a
  // usable factor must never fund a run at raw provider cost — raw cost is a
  // rate that differs from every other surface (rule 5) — so it degrades to
  // exactly the no-wallet behaviour: over-allowance submits 402 (rule 7:
  // refusal charges nothing). Said out loud once per cold start so the
  // misconfiguration is alarmable rather than indistinguishable from
  // metering-off-on-purpose. Downstream code reads `walletTable` and never
  // needs to re-check the factor: gated here, at the single entry point.
  const factorUsable = Number.isFinite(rateFactor) && rateFactor > 0;
  if (walletTableRaw && !factorUsable) {
    console.error(JSON.stringify({ message: RATE_CARD_INVALID }));
  }
  const walletTable = walletTableRaw && factorUsable ? walletTableRaw : undefined;
  const credKey = (sub) => ({ pk: { S: `CRED#${sub}` } });

  async function isCredentialed(sub) {
    const res = await ddb.send(new GetItemCommand({ TableName: ledgerTable, Key: credKey(sub) }));
    return res.Item?.costEstimate?.BOOL === true;
  }

  // Is this user allowed to spend real money at all?
  async function entitlement(sub, emailVerified) {
    if (!emailVerified) return { code: 403, error: "email-not-verified" };
    // The SERVER-minted credential (not a client-authored flag) — see the header.
    if (!(await isCredentialed(sub))) return { code: 403, error: "credential-required" };
    return null;
  }

  // GET /qpu/credential — the challenge (which run to price) + current status.
  async function credentialStatus(sub) {
    return json(200, {
      credentialed: await isCredentialed(sub),
      requiredShots: requiredShotsFor(sub),
      requiredTasks: CREDENTIAL_TASKS,
      device: DEVICE,
    });
  }

  // POST /qpu/credential { answerCents } — mint iff the learner priced the run
  // correctly (server recomputes the truth; the answer is never trusted).
  async function claimCredential(sub, rawBody) {
    let body;
    try {
      body = JSON.parse(rawBody ?? "");
    } catch {
      return json(400, { error: "invalid JSON body" });
    }
    const answerCents = body?.answerCents;
    if (!Number.isInteger(answerCents) || answerCents < 0) {
      return json(400, { error: "answerCents must be a non-negative integer" });
    }
    if (await isCredentialed(sub)) return json(200, { credentialed: true }); // idempotent
    const shots = requiredShotsFor(sub);
    if (answerCents !== correctCents(shots)) {
      return json(200, { credentialed: false, correct: false });
    }
    await ddb.send(
      new PutItemCommand({
        TableName: ledgerTable,
        Item: { ...credKey(sub), costEstimate: { BOOL: true }, mintedAt: { N: String(now()) } },
      }),
    );
    return json(200, { credentialed: true });
  }

  async function budget(sub) {
    const [ledger, tasks, credentialed, wallet] = await Promise.all([
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
      isCredentialed(sub),
      walletTable
        ? ddb.send(new GetItemCommand({ TableName: walletTable, Key: { pk: { S: `WALLET#${sub}` } } }))
        : Promise.resolve(null),
    ]);
    const capMicros = Number(ledger.Item?.capMicros?.N ?? LIFETIME_CAP_MICROS);
    const spentMicros = Number(ledger.Item?.spentMicros?.N ?? 0);
    // Monotonic COMPLETED-run aggregates, written by the reconciler in the same
    // guarded transaction that declares a run real (reconcile.mjs markCompleted).
    // They come off the ledger row ALREADY fetched above — zero extra reads.
    //
    // These exist because `tasks` above is truncated (Limit: 50, newest-first) and
    // refunded FAILED/RELEASED rows still occupy slots in that window: deriving a
    // medal from tasks.filter(COMPLETED).length lets a >50-row user push an earned
    // COMPLETED row out of the window and watch a medal UN-EARN. A credential that
    // silently retracts itself is exactly the dishonesty this product exists to
    // avoid, so the medal counters are server-side and truncation-proof.
    return json(200, {
      capMicros,
      spentMicros,
      remainingMicros: Math.max(0, capMicros - spentMicros),
      credentialed,
      completedRuns: Number(ledger.Item?.completedRuns?.N ?? 0),
      completedShots: Number(ledger.Item?.completedShots?.N ?? 0),
      // null = metering not configured (the panel hides the balance line);
      // 0 = configured but this learner holds no credits.
      walletCredits: walletTable ? Number(wallet?.Item?.credits?.N ?? 0) : null,
      // The debt gate is `clawbackOwedCredits = 0` in BOTH metered backends, so
      // a learner carrying one sees a healthy positive balance next to a hard
      // 402 and nothing anywhere says why — the first debugging step was a
      // manual GetItem. The wallet item is already fetched for walletCredits,
      // so this costs no extra read. Same null/0 convention as the line above.
      clawbackOwedCredits: walletTable ? Number(wallet?.Item?.clawbackOwedCredits?.N ?? 0) : null,
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

    // A DynamoDB ConditionExpression CANNOT do arithmetic, so `spent + cost <= cap`
    // is a syntax error (the client-side rejection every real submit hit). Express
    // it as `spent <= cap - cost` with the subtraction precomputed here. The per-user
    // cap is read from the row so a grandfathered allowance is honored: capMicros is
    // stamped once via if_not_exists and never rewritten, so it is safe to read once
    // and immutable under the concurrent submit the condition still guards against. A
    // first submit has no row, so effectiveCap defaults to the constant the same
    // if_not_exists is about to stamp. Both thresholds are > 0 (shots <= MAX_SHOTS
    // caps cost well under either allowance), so a fresh row's spent(0) always passes.
    const userRow = await ddb.send(
      new GetItemCommand({ TableName: ledgerTable, Key: { pk: { S: `USER#${sub}` } } }),
    );
    const effectiveCap = Number(userRow.Item?.capMicros?.N ?? LIFETIME_CAP_MICROS);
    const alreadySpent = Number(userRow.Item?.spentMicros?.N ?? 0);
    const userThreshold = effectiveCap - cost;
    const dayThreshold = DAILY_CAP_MICROS - cost;

    // Funding legs. leg 0 is the funding source (sponsored ledger OR paid
    // wallet); legs 1-3 (day cap, idempotency put, kill-switch) are shared, so
    // the cancellation-reason indexes mean the same thing on either path.
    const allowanceLeg = {
      Update: {
        TableName: ledgerTable,
        Key: { pk: { S: `USER#${sub}` } },
        // if_not_exists STAMPS the cap on the row at first submit and never
        // rewrites it. That is deliberate GRANDFATHERING: a learner who was
        // promised a $5.00 allowance by name keeps it forever, even though
        // LIFETIME_CAP_MICROS is now $2.50. Never write a cap-lowering
        // migration — retracting an allowance the UI already named would be
        // the one unforgivable lie in the one product whose differentiator
        // is honesty about money. (Corollary, enforced in the web copy: no
        // UI string may hardcode the cap — every figure derives from the
        // capMicros this row returns.)
        UpdateExpression: "SET capMicros = if_not_exists(capMicros, :cap) ADD spentMicros :cost",
        // `spent <= cap - cost`, threshold precomputed. A ConditionExpression
        // allows NEITHER arithmetic NOR if_not_exists (both are the original
        // bug), so the missing-attribute case is spelled out: a first submit
        // has no spentMicros and passes; an existing row must be within
        // threshold. :capMinusCost carries the grandfathered cap - cost (> 0).
        ConditionExpression: "attribute_not_exists(spentMicros) OR spentMicros <= :capMinusCost",
        ExpressionAttributeValues: {
          ":cap": { N: String(LIFETIME_CAP_MICROS) },
          ":cost": { N: String(cost) },
          ":capMinusCost": { N: String(userThreshold) },
        },
      },
    };
    // Priced ONLY when the wallet path exists: pricing is meaningless without
    // metering, and creditsForMicros deliberately throws rather than default —
    // computing this unconditionally is exactly the gate-bypass it polices.
    // (walletTable is the GATED value, so it implies a usable factor.)
    const creditsNeeded = walletTable ? creditsForMicros(cost, rateFactor) : 0;
    const walletLeg = {
      Update: {
        TableName: walletTable,
        Key: { pk: { S: `WALLET#${sub}` } },
        // attribute_exists(pk): a learner who never purchased has no wallet row,
        // and an unconditional ADD would mint a phantom row at -N credits.
        // credits >= :need keeps the balance from ever going below zero under
        // concurrent submits — DynamoDB re-checks it inside the transaction.
        // The clawback clause enforces the product rule that a debt must be
        // CLEARED: a learner whose refund was reclaimed past their balance
        // cannot spend again until a purchase pays the shortfall down to zero.
        UpdateExpression: "ADD credits :neg",
        ConditionExpression:
          "attribute_exists(pk) AND credits >= :need AND " +
          "(attribute_not_exists(clawbackOwedCredits) OR clawbackOwedCredits = :zero)",
        ExpressionAttributeValues: {
          ":neg": { N: String(-creditsNeeded) },
          ":need": { N: String(creditsNeeded) },
          ":zero": { N: "0" },
        },
      },
    };
    const sharedLegs = (fundedBy) => [
      {
        Update: {
          TableName: ledgerTable,
          Key: { pk: { S: `DAY#${day}` } },
          UpdateExpression: "ADD dayMicros :cost SET expiresAt = :ttl",
          // `dayMicros <= daily - cost`, threshold precomputed; missing-attribute
          // spelled out (no arithmetic, no if_not_exists in a condition). The
          // GLOBAL day cap binds wallet-funded runs too: the platform still
          // fronts the Braket bill either way, so this is the account-level
          // spend brake, not a fairness rule.
          ConditionExpression: "attribute_not_exists(dayMicros) OR dayMicros <= :dayMinusCost",
          ExpressionAttributeValues: {
            ":cost": { N: String(cost) },
            ":dayMinusCost": { N: String(dayThreshold) },
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
            // Funding provenance: the release path and the reconciler refund
            // whichever source actually paid, so it must live on the row.
            fundedBy: { S: fundedBy },
            ...(fundedBy === "wallet" ? { creditsCharged: { N: String(creditsNeeded) } } : {}),
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
    ];

    // --- The atomic reservation: funding + daily + idempotency + kill, all-or-
    // none. Attempt one funding source; the ONLY cross-path retry is the
    // allowance→wallet fallback on a cap race, and it runs at most once.
    const attemptReservation = async (source) => {
      try {
        await ddb.send(
          new TransactWriteItemsCommand({
            TransactItems: [source === "wallet" ? walletLeg : allowanceLeg, ...sharedLegs(source)],
          }),
        );
        return { committed: source };
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
            // The idempotency key is a GLOBAL, caller-supplied namespace, so only
            // return the cached task to its OWNER — never disclose another user's
            // task metadata (taskArn/hash) to whoever guesses/collides on the key.
            if (existing.Item && existing.Item.userId?.S === sub) {
              return { response: json(200, { duplicate: true, task: taskSummary(existing.Item) }) };
            }
            return { response: json(409, { error: "idempotency-conflict" }) };
          }
          if (failed(3)) return { response: json(503, { error: "qpu-disabled" }) }; // kill-switch
          if (failed(1)) return { response: json(503, { error: "over-daily-budget" }) };
          if (failed(0)) {
            if (source === "wallet") {
              return { response: json(402, { error: "insufficient-credits", creditsNeeded }) };
            }
            // The pre-read said the run fits the allowance but a concurrent
            // submit consumed it. With a wallet configured, a payable run must
            // not bounce on a race — retry once, wallet-funded.
            if (walletTable) return { fallback: true };
            return { response: json(402, { error: "over-lifetime-budget" }) };
          }
        }
        throw err;
      }
    };

    // Allowance first — the free funnel is untouched by metering. A run that no
    // longer fits goes straight to the wallet (no split funding: a run is
    // entirely one source, so refunds are exact and provenance is one word).
    // An allowance can only fund a run if the learner actually HAS one — a
    // grandfathered cap with headroom. With the programme withdrawn,
    // effectiveCap is 0 for everyone else, so this is false and the run is
    // paid. Guarding on `effectiveCap > 0` matters independently of the
    // arithmetic: the allowance leg's condition permits a first submit via
    // `attribute_not_exists(spentMicros)`, so a cap-0 learner routed down that
    // path would receive one real-money run for free.
    const fitsAllowance = effectiveCap > 0 && alreadySpent + cost <= effectiveCap;
    if (!fitsAllowance && !walletTable) {
      // No allowance and nowhere to charge it: refuse, rather than fall through
      // to the allowance leg, which would pass and hand out a free run.
      return json(402, { error: "over-lifetime-budget" });
    }
    let funding = fitsAllowance ? "allowance" : "wallet";
    let outcome = await attemptReservation(funding);
    if (outcome.fallback) {
      funding = "wallet";
      outcome = await attemptReservation(funding);
    }
    if (outcome.response) return outcome.response;

    // --- Reservation held. ONLY a CreateQuantumTask failure means no task was
    // created and the reservation must be refunded. A failure AFTER the task
    // exists must NEVER refund — the task is real and Braket WILL bill, so a
    // refund there would defeat both caps (the critical bug this split fixes).
    let taskArn;
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
      taskArn = res.quantumTaskArn;
    } catch (submitErr) {
      // No task was created — refund. Log WHY Braket rejected: without this the
      // 502 is a black box (a real submit failed with no operator-visible reason,
      // which is exactly what made the first hardware run undebuggable). Name +
      // message are safe to log; the QASM/sub are not secret but the message is
      // what actually diagnoses a rejected device submission.
      console.error("qpu-braket-submit-failed", {
        sub,
        idempotencyKey,
        device: DEVICE,
        shots,
        errName: submitErr?.name,
        errMessage: submitErr?.message,
      });
      // Do NOT swallow a failed refund either: log it so a burned reservation is
      // visible/alarmable (the durable reconciler covers a mid-flight death).
      await releaseReservation(sub, day, cost, idempotencyKey, funding).catch((e) =>
        console.error("qpu-release-failed", { sub, idempotencyKey, day, cost, funding, err: e?.name }),
      );
      return json(502, { error: "braket-submit-failed" });
    }

    // The task IS created and billable, so the reserved spend is now correct.
    // Recording status/taskArn is best-effort: a failed write leaves the row
    // RESERVED (money already correctly committed) for the PR-4 reconciler —
    // it must NOT refund. Always return the arn so it is never lost.
    await ddb
      .send(
        new UpdateItemCommand({
          TableName: tasksTable,
          Key: { idempotencyKey: { S: idempotencyKey } },
          UpdateExpression: "SET #s = :s, taskArn = :arn",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":s": { S: "SUBMITTED" }, ":arn": { S: taskArn } },
        }),
      )
      .catch((e) => console.error("qpu-status-write-failed", { idempotencyKey, taskArn, err: e?.name }));
    return json(202, {
      taskArn,
      estMicros: cost,
      circuitHash: hash,
      fundedBy: funding,
      // The SAME figure as the debit — threaded, never recomputed: two
      // computations of one charge is the re-derivation disease the release
      // path already caught once.
      creditsCharged: funding === "wallet" ? creditsNeeded : 0,
    });
  }

  async function releaseReservation(sub, day, cost, idempotencyKey, funding = "allowance") {
    // Refund whichever source actually paid. The task-row RESERVED→RELEASED
    // guard below makes the WHOLE release idempotent for both shapes.
    let refundLeg;
    let refundCredits = 0;
    if (funding === "wallet") {
      // Refund the credits RECORDED on the task row at debit time — never a
      // re-derivation from cost. The debit computed the charge once and wrote
      // it as creditsCharged; re-deriving here is identical today but diverges
      // the moment the credit conversion changes between debit and release,
      // and it diverges in the OVERCHARGING direction (rule 7). Same pattern
      // as reconcile.mjs, which reads the recorded figure off the row.
      const row = await ddb.send(
        new GetItemCommand({
          TableName: tasksTable,
          Key: { idempotencyKey: { S: idempotencyKey } },
          // Strongly consistent: this reads a row the reservation transaction
          // wrote milliseconds ago. An eventually-consistent miss would fire
          // the "unrecorded" audit log below spuriously — noise on an alarm.
          ConsistentRead: true,
        }),
      );
      const recorded = Number(row.Item?.creditsCharged?.N);
      if (Number.isFinite(recorded) && recorded > 0) {
        refundCredits = recorded;
      } else {
        // Should be impossible — the reservation Put always records the charge
        // on a wallet-funded row. Log it (an unrecorded charge is an audit
        // gap), then fall back to the derivation rather than strand the money.
        console.error("qpu-release-credits-unrecorded", { sub, idempotencyKey, funding });
        refundCredits = creditsForMicros(cost, rateFactor);
      }
      refundLeg = {
        Update: {
          TableName: walletTable,
          Key: { pk: { S: `WALLET#${sub}` } },
          UpdateExpression: "ADD credits :pos",
          // A refund must never MINT a wallet row (rule 11): an unconditional
          // ADD against a missing key would materialize credits nobody paid
          // for. The catch below turns this leg's failure into a loud log.
          ConditionExpression: "attribute_exists(pk)",
          ExpressionAttributeValues: { ":pos": { N: String(refundCredits) } },
        },
      };
    } else {
      refundLeg = {
        Update: {
          TableName: ledgerTable,
          Key: { pk: { S: `USER#${sub}` } },
          UpdateExpression: "ADD spentMicros :neg",
          ExpressionAttributeValues: { ":neg": { N: String(-cost) } },
        },
      };
    }
    try {
      await ddb.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            refundLeg,
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
                // Idempotent refund: the whole all-or-none release only fires while
                // the task is still RESERVED, so a retry (or the PR-4 sweeper)
                // running after a successful release can't double-decrement.
                UpdateExpression: "SET #s = :released",
                ConditionExpression: "attribute_exists(idempotencyKey) AND #s = :reserved",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                  ":released": { S: "RELEASED" },
                  ":reserved": { S: "RESERVED" },
                },
              },
            },
          ],
        }),
      );
    } catch (err) {
      // The one condition handled HERE rather than rethrown to the caller's
      // generic qpu-release-failed log: the wallet row is gone, so the refund
      // cannot be delivered without minting a row nobody paid for (rule 11).
      // This is money owed a learner — the log line is the alarm hook.
      if (
        funding === "wallet" &&
        err?.name === "TransactionCanceledException" &&
        err.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed"
      ) {
        console.error("qpu-refund-wallet-row-missing", {
          sub,
          idempotencyKey,
          day,
          credits: refundCredits,
        });
        return;
      }
      throw err;
    }
  }

  return async function core(event) {
    // Edge gate: reject anything that didn't come through CloudFront/WAF.
    if (edgeSecret && event.headers?.["x-qpu-edge"] !== edgeSecret) {
      return json(403, { error: "forbidden" });
    }
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    const sub = claims?.sub;
    if (!sub) return json(401, { error: "unauthorized" });
    const emailVerified = claims.email_verified === "true" || claims.email_verified === true;
    const method = event.requestContext?.http?.method;
    const path = event.requestContext?.http?.path ?? "";

    if (method === "GET" && path.endsWith("/budget")) return budget(sub);
    if (method === "GET" && path.endsWith("/credential")) return credentialStatus(sub);
    if (method === "POST" && path.endsWith("/credential")) return claimCredential(sub, event.body);
    if (method === "POST" && path.endsWith("/submit")) return submit(sub, emailVerified, event.body);
    return json(405, { error: "method not allowed" });
  };
}
