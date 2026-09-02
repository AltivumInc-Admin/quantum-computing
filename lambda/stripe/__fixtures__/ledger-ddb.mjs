// The stateful DynamoDB stub the money tests share.
//
// It lived inside index.test.mjs until 2026-09-02, when the money logic split
// out of index.mjs into wallet-store / fulfillment / clawback and each module
// gained direct tests. One stub for the webhook deliveries in index.test.mjs
// and for the direct calls in the module suites, so both assert the same
// arithmetic against the same transaction semantics — a stub that diverged
// between the two would let one suite pass on behaviour the other refutes.
//
// Under __fixtures__ like lambda/qpu's, which the repo-wide guards skip by
// name; and NOT a test file, so node --test never runs it as one.

/**
 * A stateful stub: TransactWriteItems is actually APPLIED to the row store, so a
 * withdraw-then-reinstate round trip can be asserted end to end. The plainer
 * walletDdb stub in index.test.mjs returns a fixed snapshot, which is right for single-event tests but cannot
 * express "the second event sees what the first one wrote" — and that sequence is
 * exactly where the dispute arithmetic goes wrong.
 *
 * Only the expression shapes this handler actually emits are supported:
 * `SET a = :x, b = :y` and `ADD credits :amt, clawbackOwedCredits :owed`.
 */
export function ledgerDdb(rows = {}) {
  const store = new Map(Object.entries(rows));
  const num = (item, k) => Number(item?.[k]?.N ?? 0);
  return {
    store,
    wallet: (sub) => store.get(`WALLET#${sub}`),
    receipt: (pi) => store.get(`RECEIPT#${pi}`),
    async send(cmd) {
      const name = cmd.constructor.name;
      if (name === "GetItemCommand") {
        const item = store.get(cmd.input.Key.pk.S);
        return item ? { Item: item } : {};
      }
      if (name !== "TransactWriteItemsCommand") return {};
      // Validate every condition BEFORE applying anything (transaction semantics).
      for (const leg of cmd.input.TransactItems) {
        const op = leg.Put ?? leg.Update ?? leg.ConditionCheck;
        const pk = (leg.Put ? leg.Put.Item.pk : op.Key.pk).S;
        const cond = op.ConditionExpression;
        if (!cond) continue;
        const cur = store.get(pk);
        if (cond.includes("attribute_not_exists(pk)") && cur) {
          const e = new Error("cancelled");
          e.name = "TransactionCanceledException";
          e.CancellationReasons = cmd.input.TransactItems.map((l) =>
            l === leg ? { Code: "ConditionalCheckFailed" } : { Code: "None" }
          );
          throw e;
        }
        const eq = cond.match(/(\w+) = (:\w+)/);
        if (eq && cur && num(cur, eq[1]) !== Number(op.ExpressionAttributeValues[eq[2]].N)) {
          const e = new Error("cancelled");
          e.name = "TransactionCanceledException";
          e.CancellationReasons = cmd.input.TransactItems.map((l) =>
            l === leg ? { Code: "ConditionalCheckFailed" } : { Code: "None" }
          );
          throw e;
        }
      }
      for (const leg of cmd.input.TransactItems) {
        if (leg.Put) {
          store.set(leg.Put.Item.pk.S, { ...leg.Put.Item });
          continue;
        }
        if (!leg.Update) continue;
        const pk = leg.Update.Key.pk.S;
        const item = { ...(store.get(pk) ?? { pk: { S: pk } }) };
        const vals = leg.Update.ExpressionAttributeValues ?? {};
        const expr = leg.Update.UpdateExpression;
        const setPart = expr.match(/SET (.*?)(?= ADD |$)/)?.[1];
        for (const a of setPart ? setPart.split(",") : []) {
          const [k, v] = a.split("=").map((s) => s.trim());
          if (vals[v]) item[k] = { ...vals[v] };
        }
        const addPart = expr.match(/ADD (.*)$/)?.[1];
        for (const a of addPart ? addPart.split(",") : []) {
          const [k, v] = a.trim().split(/\s+/);
          item[k] = { N: String(num(item, k) + Number(vals[v].N)) };
        }
        store.set(pk, item);
      }
      return {};
    },
  };
}

/**
 * Every command sent through `ddb`, recorded, then delegated — the shape of a
 * transaction can be asserted without giving up the stateful store.
 */
export function recording(ddb) {
  const calls = [];
  return {
    ...ddb,
    calls,
    async send(cmd) {
      calls.push({ name: cmd.constructor.name, input: cmd.input });
      return ddb.send(cmd);
    },
  };
}

/**
 * Stage a concurrent writer: `race(store, attempt)` runs against the row store
 * immediately BEFORE each of the first `times` TransactWriteItems, i.e. after
 * the caller's GetItem and before its conditional write — the exact window the
 * optimistic-concurrency legs exist to close. A `race` that throws makes the
 * transaction itself throw that error, which is how a TransactionConflict from
 * DynamoDB is staged.
 */
export function racing(ddb, race, { times = 1 } = {}) {
  let attempt = 0;
  return {
    ...ddb,
    async send(cmd) {
      if (cmd.constructor.name === "TransactWriteItemsCommand" && attempt < times) {
        attempt += 1;
        race(ddb.store, attempt);
      }
      return ddb.send(cmd);
    },
  };
}
