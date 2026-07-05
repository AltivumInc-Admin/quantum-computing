// quantum-workspace-sync: a versioned per-user KV for qc:* progress snapshots.
//
// Deliberately DUMB: no merge logic here. The web client owns the domain merge
// (web/src/lib/progress-merge.ts) so the rules exist in exactly one testable
// place; this handler only stores a snapshot per user and enforces optimistic
// concurrency — a PUT must name the version it read, and a mismatch returns
// 409 so the client re-pulls, re-merges, and re-pushes. Identity comes solely
// from the API's Cognito JWT authorizer (the verified `sub` claim); the
// handler never trusts anything else in the request for identity.
//
// Mirrors lambda/tutor's DI-core pattern: createHandlerCore(deps) unit-tests
// under node --test with a stubbed DynamoDB client.

import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

// A learner's full snapshot measures well under 100KB today (~110 keys); this
// bounds abuse, not legitimate use.
export const MAX_SNAPSHOT_BYTES = 262_144;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** The snapshot must be a flat object of qc:*-keyed strings. */
export function invalidSnapshotReason(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return "data must be an object";
  }
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith("qc:")) return `key ${JSON.stringify(key)} is outside the qc:* namespace`;
    if (typeof value !== "string") return `value for ${JSON.stringify(key)} must be a string`;
  }
  return null;
}

export function createHandlerCore({ ddb, tableName }) {
  return async function core(event) {
    const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!sub) return json(401, { error: "unauthorized" });
    const method = event.requestContext?.http?.method;

    if (method === "GET") {
      const res = await ddb.send(
        new GetItemCommand({ TableName: tableName, Key: { userId: { S: sub } } })
      );
      if (!res.Item) return json(200, { version: 0, data: {} });
      return json(200, {
        version: Number(res.Item.version.N),
        data: JSON.parse(res.Item.data.S),
      });
    }

    if (method === "PUT") {
      let body;
      try {
        body = JSON.parse(event.body ?? "");
      } catch {
        return json(400, { error: "invalid JSON body" });
      }
      const { baseVersion, data } = body ?? {};
      if (!Number.isInteger(baseVersion) || baseVersion < 0) {
        return json(400, { error: "baseVersion must be a non-negative integer" });
      }
      const reason = invalidSnapshotReason(data);
      if (reason) return json(400, { error: reason });
      const serialized = JSON.stringify(data);
      if (serialized.length > MAX_SNAPSHOT_BYTES) {
        return json(413, { error: `snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes` });
      }

      const version = baseVersion + 1;
      try {
        await ddb.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              userId: { S: sub },
              version: { N: String(version) },
              data: { S: serialized },
              updatedAt: { N: String(Date.now()) },
            },
            // First write requires no existing item; later writes must replace
            // exactly the version the client read.
            ConditionExpression:
              baseVersion === 0
                ? "attribute_not_exists(userId) OR version = :base"
                : "version = :base",
            ExpressionAttributeValues: { ":base": { N: String(baseVersion) } },
          })
        );
      } catch (err) {
        if (err?.name === "ConditionalCheckFailedException") {
          return json(409, { error: "version-conflict" });
        }
        throw err;
      }
      return json(200, { version });
    }

    return json(405, { error: "method not allowed" });
  };
}

const core = createHandlerCore({
  ddb: new DynamoDBClient({}),
  tableName: process.env.TABLE_NAME,
});

export const handler = (event) => core(event);
