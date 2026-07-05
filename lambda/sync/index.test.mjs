import test from "node:test";
import assert from "node:assert/strict";
import { createHandlerCore, invalidSnapshotReason, MAX_SNAPSHOT_BYTES } from "./index.mjs";

const TABLE = "test-table";

function makeEvent({ method = "GET", sub = "user-1", body } = {}) {
  return {
    requestContext: {
      http: { method },
      authorizer: sub ? { jwt: { claims: { sub } } } : undefined,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function stubDdb(responses = {}) {
  const calls = [];
  return {
    calls,
    send: async (cmd) => {
      calls.push(cmd);
      const name = cmd.constructor.name;
      const r = responses[name];
      if (r instanceof Error) throw r;
      return r ?? {};
    },
  };
}

test("rejects requests without a verified sub claim", async () => {
  const core = createHandlerCore({ ddb: stubDdb(), tableName: TABLE });
  const res = await core(makeEvent({ sub: null }));
  assert.equal(res.statusCode, 401);
});

test("GET returns version 0 and empty data for a new user", async () => {
  const core = createHandlerCore({ ddb: stubDdb(), tableName: TABLE });
  const res = await core(makeEvent());
  assert.deepEqual(JSON.parse(res.body), { version: 0, data: {} });
});

test("GET returns the stored snapshot", async () => {
  const ddb = stubDdb({
    GetItemCommand: {
      Item: { version: { N: "3" }, data: { S: '{"qc:section:x":"1"}' } },
    },
  });
  const core = createHandlerCore({ ddb, tableName: TABLE });
  const res = await core(makeEvent());
  assert.deepEqual(JSON.parse(res.body), { version: 3, data: { "qc:section:x": "1" } });
});

test("PUT stores the snapshot with version baseVersion+1 under a condition", async () => {
  const ddb = stubDdb();
  const core = createHandlerCore({ ddb, tableName: TABLE });
  const res = await core(
    makeEvent({ method: "PUT", body: { baseVersion: 2, data: { "qc:card:a": "{}" } } })
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { version: 3 });
  const put = ddb.calls[0].input;
  assert.equal(put.Item.version.N, "3");
  assert.equal(put.ConditionExpression, "version = :base");
});

test("first PUT (baseVersion 0) allows a missing item", async () => {
  const ddb = stubDdb();
  const core = createHandlerCore({ ddb, tableName: TABLE });
  await core(makeEvent({ method: "PUT", body: { baseVersion: 0, data: {} } }));
  assert.match(ddb.calls[0].input.ConditionExpression, /attribute_not_exists/);
});

test("PUT returns 409 on a version conflict", async () => {
  const conflict = new Error("conditional");
  conflict.name = "ConditionalCheckFailedException";
  const ddb = stubDdb({ PutItemCommand: conflict });
  const core = createHandlerCore({ ddb, tableName: TABLE });
  const res = await core(makeEvent({ method: "PUT", body: { baseVersion: 1, data: {} } }));
  assert.equal(res.statusCode, 409);
});

test("PUT validates body shape, namespace, and size", async () => {
  const core = createHandlerCore({ ddb: stubDdb(), tableName: TABLE });
  const bad = async (body) =>
    (await core(makeEvent({ method: "PUT", body }))).statusCode;
  assert.equal(await bad({ baseVersion: -1, data: {} }), 400);
  assert.equal(await bad({ baseVersion: 0, data: { evil: "1" } }), 400);
  assert.equal(await bad({ baseVersion: 0, data: { "qc:x": 5 } }), 400);
  assert.equal(
    await bad({ baseVersion: 0, data: { "qc:x": "y".repeat(MAX_SNAPSHOT_BYTES) } }),
    413
  );
});

test("invalidSnapshotReason accepts a clean snapshot", () => {
  assert.equal(invalidSnapshotReason({ "qc:section:a": "1", "qc:card:b": "{}" }), null);
});

test("unknown methods 405", async () => {
  const core = createHandlerCore({ ddb: stubDdb(), tableName: TABLE });
  assert.equal((await core(makeEvent({ method: "DELETE" }))).statusCode, 405);
});
