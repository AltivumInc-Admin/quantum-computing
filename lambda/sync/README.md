# quantum-workspace-sync

Cross-device progress sync for the Quantum Workspace: a **deliberately dumb,
versioned per-user KV** — one DynamoDB item per user holding their `qc:*`
progress snapshot — behind an HTTP API whose Cognito JWT authorizer validates
tokens from the existing `quantum-workspace` user pool
(`us-east-2_aRydPmAjj`). ALL merge intelligence lives in the web client
(`web/src/lib/progress-merge.ts`); the server only stores a snapshot and
enforces **optimistic concurrency**, so the domain rules exist in exactly one
testable place.

- `index.mjs` — the handler. Mirrors `lambda/tutor`'s DI-core pattern:
  `createHandlerCore(deps)` unit-tests under `node --test` with a stubbed
  DynamoDB client.
- `template.yaml` — AWS SAM: the HTTP API (Cognito JWT authorizer + stage
  throttle), the function, the `quantum-workspace-progress` table
  (`DeletionPolicy: Retain` + point-in-time recovery — learner progress is the
  crown jewels and survives stack deletion), the stack-managed log group, and
  the alerts topic + four alarms (see [Observability](#observability)).
- `template.test.mjs` — offline structural assertions that lock the template's
  guardrails in place (same approach as `lambda/qpu/template.test.mjs`).

## How it works

Identity comes **solely** from the API's Cognito JWT authorizer — the verified
`sub` claim keys the item; the handler never trusts anything else in the
request for identity. The verified `email` claim is persisted alongside the
snapshot so the review-email sender can reach the learner without a Cognito
`ListUsers` lookup.

- **`GET /progress`** — the caller's `{ version, data }`; `{ version: 0,
  data: {} }` if they have never synced.
- **`PUT /progress`** `{ baseVersion, data }` — a PUT must name the version it
  read; a mismatch returns **409 version-conflict** so the client re-pulls,
  re-merges, and re-pushes (first write: `baseVersion: 0` with no existing
  item). The snapshot must be a flat object of `qc:*`-keyed strings, and its
  **UTF-8 byte length** is capped at `MAX_SNAPSHOT_BYTES` (256KB) → **413**.
  Byte length, not string length: card content is full of 3-byte math glyphs
  (ψ, ⟩, ×), so counting UTF-16 code units would admit ~780KB of UTF-8 — past
  DynamoDB's 400KB item limit, turning the 413 into an unhandled
  `ValidationException` 500 and a permanently wedged sync. A learner's full
  snapshot measures well under 100KB today (~110 keys); the cap bounds abuse,
  not legitimate use.
- **`DELETE /progress`** — account deletion: removes the caller's entire
  server-side snapshot (one item per user). Idempotent — deleting an absent
  item is still a 200.

The function's IAM statement allows exactly `GetItem`/`PutItem`/`DeleteItem`
on this one table, and `ReservedConcurrentExecutions` (`MaxConcurrency`,
default 10) is a hard ceiling on simultaneous invocations.

## Local dev loop

Offline handler + template tests (no AWS creds; DynamoDB is stubbed):

```bash
cd lambda/sync && npm ci && npm test
# node --test discovers all *.test.mjs:
#  - index.test.mjs     the GET/PUT/DELETE routes, the 409 optimistic-concurrency
#                       path, the qc:*-namespace + 256KB snapshot validation
#  - template.test.mjs  structural template assertions: throttle, authorizer,
#                       alarms wired to the alerts topic, Retain + PITR
```

## Deploy

Region is **us-east-2** (the Cognito pool's region). `AlertEmail` defaults to
christian.perez@altivum.io — override it to point the alarm emails elsewhere:

```bash
cd lambda/sync && npm ci && sam build
sam deploy --stack-name quantum-workspace-sync --region us-east-2 \
  --capabilities CAPABILITY_IAM --resolve-s3 \
  --parameter-overrides AlertEmail=<operator email>
```

Then set the `SyncUrl` stack output as **`NEXT_PUBLIC_SYNC_URL`** in the
Amplify app environment and redeploy. The site is unaffected while the var is
absent: the workspace keeps its local copy and the background sync component
stays inert. **After the first deploy, confirm the SNS email subscription from
the inbox** — it delivers nothing until confirmed once.

## Observability

This stack holds the crown jewels (learner progress) behind a paid,
internet-facing API, so silent failure modes are not acceptable. The template
wires a **human notification path** (pattern proven in
`lambda/qpu/template.yaml`): a `quantum-workspace-sync-alerts` SNS topic with
an email subscription (`AlertEmail`), notified by four alarms:

- **`quantum-workspace-sync-errors`** — the function threw at least one error
  in 5 minutes; snapshots may not be saving or loading.
- **`quantum-workspace-sync-throttles`** — the function was throttled
  (reserved concurrency exhausted) in 5 minutes: either real traffic outgrew
  `MaxConcurrency` or something is flooding the API past the stage throttle.
- **`quantum-workspace-sync-write-spike`** — the table consumed >10,000 write
  capacity units per 5 minutes for 3 consecutive periods (15 sustained
  minutes), roughly 10x the legitimate peak. On-demand billing means this is
  direct spend.
- **`quantum-workspace-sync-5xx`** — the HTTP API returned at least one 5xx in
  5 minutes: the function, its DynamoDB access, or the JWT authorizer
  integration is failing server-side.

**Stage throttle: 5 rps steady / burst 10**, sized from the client's actual
cadence. The sync client PUTs one snapshot per debounce window (20s trailing /
60s maxWait — `web/src/components/progress-sync.tsx`), i.e. at most ~1
PUT/user/min plus a GET at page load, so the throttle never touches a real
user. Without it, the only ceiling is `ReservedConcurrentExecutions=10`, and a
flood of `MAX_SNAPSHOT_BYTES` (256KB) PUTs at ~100-200 rps inside that ceiling
is ~256 WCU per write against the PAY_PER_REQUEST table — roughly $115-230/hr
of on-demand DynamoDB write cost. The throttle caps that blast radius at the
front door; excess requests get a 429 before invoking anything.
