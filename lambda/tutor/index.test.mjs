/**
 * Offline tests for the tutor handler logic. They exercise createHandlerCore
 * (the real per-request body) against a stubbed Anthropic client + fixture
 * corpus, so the streaming loop, the error-sentinel path, and the paid-call gate
 * are covered with no AWS creds, no real model call, and no packaged corpus.json.
 *
 * The stub speaks the Anthropic Messages wire format: `messages.create()`
 * resolves to an async-iterable of stream events, and token usage arrives split
 * across `message_start` (the input legs) and `message_delta` (final output),
 * not in one trailing metadata event. That split is the thing most likely to be
 * got wrong, so the stub reproduces it exactly rather than flattening it.
 *
 * Run: `cd lambda/tutor && npm install && node --test`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHandlerCore,
  TUTOR_ERROR_SENTINEL,
  OUT_OF_SCOPE_MESSAGE,
  TOO_LONG_MESSAGE,
  USAGE_SHAPE_UNRECOGNIZED,
} from "./index.mjs";
import { MAX_QUESTION_CHARS } from "./tutor-core.mjs";

function makeStream() {
  const chunks = [];
  return {
    chunks,
    write: (s) => chunks.push(s),
    end: () => {},
    text: () => chunks.join(""),
  };
}

const FIXTURE_CORPUS = {
  "00-prereqs": { title: "Prereqs", headings: ["A"], text: "lesson body" },
};

/** One text delta, in the Anthropic stream-event shape. */
const textDelta = (text) => ({
  type: "content_block_delta",
  delta: { type: "text_delta", text },
});

// A stub client that records the request params it was sent and streams three
// deltas: two text ones, and one non-text (a thinking delta) which the handler
// must skip rather than concatenate into the learner's answer.
function okClient() {
  const sent = [];
  return {
    sent,
    messages: {
      create: async (params) => {
        sent.push(params);
        return (async function* () {
          yield textDelta("Hel");
          yield textDelta("lo");
          yield { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "hmm" } };
        })();
      },
    },
  };
}

test("A: streams concatenated text deltas, skips text-less deltas, sends a grounded command", async () => {
  const client = okClient();
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    stream
  );
  assert.equal(stream.text(), "Hello");
  assert.equal(client.sent.length, 1);
  const input = client.sent[0]; // the request params, verbatim
  assert.equal(input.model, MODEL_IDS["haiku-4-5"]);
  assert.ok(input.system?.[0]?.text?.includes("LESSON TEXT:"), "system prompt has the grounding section");
  // Assert the section's ACTUAL text reaches the model, not just the static label —
  // a regression dropping section.text (the whole point of grounding) must fail here.
  assert.ok(input.system[0].text.includes("lesson body"), "grounding text reaches the model");
  assert.equal(input.messages?.[0]?.content, "hi");
});

test("B2: writes text then the error sentinel when the stream throws mid-flight", async () => {
  // send() resolves, then the delta loop throws after a chunk is already written —
  // the realistic streaming failure. The client scans with indexOf (not startsWith),
  // tolerating the sentinel after partial text, so assert includes() + text-before.
  const client = {
    messages: {
      create: async () => (async function* () {
        yield textDelta("partial");
        throw new Error("mid-stream boom");
      })(),
    },
  };
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    stream
  );
  const out = stream.text();
  assert.ok(out.startsWith("partial"), "already-streamed text is preserved");
  assert.ok(out.includes(TUTOR_ERROR_SENTINEL), "sentinel is emitted after the partial text");
});

test("B: writes the in-band error sentinel when the client throws", async () => {
  const client = {
    messages: {
      create: async () => {
        throw new Error("boom");
      },
    },
  };
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    stream
  );
  assert.ok(stream.text().startsWith(TUTOR_ERROR_SENTINEL));
});

test("C: out-of-scope (unknown slug / empty question / __proto__) returns the message, no model call", async () => {
  const bodies = [
    JSON.stringify({ slug: "does-not-exist", question: "hi" }),
    JSON.stringify({ slug: "00-prereqs", question: "   " }),
    JSON.stringify({ slug: "__proto__", question: "hi" }), // inherited key must not slip past the guard
  ];
  for (const body of bodies) {
    let called = false;
    const client = {
      messages: {
        create: async () => {
          called = true;
          return (async function* () {})();
        },
      },
    };
    const stream = makeStream();
    await createHandlerCore({ client, corpus: FIXTURE_CORPUS })({ body }, stream);
    assert.equal(stream.text(), OUT_OF_SCOPE_MESSAGE, `body=${body}`);
    assert.equal(called, false, `model must not be called for body=${body}`);
  }
});

test("D: a body over MAX_BODY_BYTES is refused for LENGTH, not scope, with no model call", async () => {
  // The size gate used to share OUT_OF_SCOPE_MESSAGE with the unknown-slug and
  // empty-question paths, so an oversized paste told a learner sitting inside the
  // lesson she just asked about that her question was off-topic. The no-paid-call
  // guarantee is unchanged; only the claim the message makes is.
  let called = false;
  const client = {
    messages: {
      create: async () => {
        called = true;
        return (async function* () {})();
      },
    },
  };
  const stream = makeStream();
  const huge = "x".repeat(17 * 1024); // > 16 KiB cap
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS })(
    { body: JSON.stringify({ slug: "00-prereqs", question: huge }) },
    stream
  );
  assert.equal(stream.text(), TOO_LONG_MESSAGE);
  assert.notEqual(stream.text(), OUT_OF_SCOPE_MESSAGE, "length is not a scope problem");
  assert.equal(called, false);
});

test("D2: the size gate measures BYTES, so multi-byte glyphs cannot smuggle a huge body past it", async () => {
  // `event.body.length` counted UTF-16 code units, so a body of 3-byte glyphs
  // passed at up to ~48 KiB — three times the constant's stated limit.
  let called = false;
  const client = {
    messages: {
      create: async () => {
        called = true;
        return (async function* () {})();
      },
    },
  };
  const stream = makeStream();
  // ~7k UTF-16 units but ~21 KiB of UTF-8 — under the OLD gate, over the real one.
  const glyphs = "⊗".repeat(7 * 1024);
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS })(
    { body: JSON.stringify({ slug: "00-prereqs", question: glyphs }) },
    stream
  );
  assert.ok(Buffer.byteLength(glyphs, "utf8") > 16 * 1024, "fixture must exceed the byte cap");
  assert.equal(stream.text(), TOO_LONG_MESSAGE);
  assert.equal(called, false);
});

test("E: a question is sliced to the SHARED cap the client's textarea enforces", async () => {
  const client = okClient();
  const stream = makeStream();
  const long = "q".repeat(MAX_QUESTION_CHARS + 500);
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS })(
    { body: JSON.stringify({ slug: "00-prereqs", question: long }) },
    stream
  );
  const sent = client.sent[0].messages[0].content;
  assert.equal(sent.length, MAX_QUESTION_CHARS);
  // The cap is imported, never re-declared: a drift between the handler's slice
  // and the panel's maxLength is exactly what silent mid-word truncation was.
  assert.equal(MAX_QUESTION_CHARS, 2000);
});


/**
 * A stall that outlives the deadline and then settles harmlessly.
 *
 * Two traps here, both of which made these tests pass on Node 26 and fail on
 * CI's Node 20:
 *   1. `new Promise(() => {})` never settles, so the runner reports "Promise
 *      resolution is still pending but the event loop has already resolved".
 *   2. An UNREF'd timer is worse: the handler's own deadline guard also unrefs,
 *      so with both unref'd nothing holds the loop open, Node 20 drains it, and
 *      every pending subtest is cancelled (reported as `not ok` with `fail 0`).
 * So this timer is deliberately REF'd — it keeps the loop alive across the
 * ~20ms deadline — and it RESOLVES rather than rejects, so the discarded
 * race-loser can never surface as an unhandled rejection.
 */
function stalls(ms = 200) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ done: true, value: undefined }), ms);
  });
}

test("F: a stalled model stream hits the deadline and emits the sentinel", async () => {
  // The one failure the in-band sentinel cannot otherwise cover: nothing throws,
  // the stream simply never yields. Before the deadline this ran until the Lambda
  // Timeout killed the process — and a process kill never runs the catch, so no
  // sentinel was written and the client rendered the truncated body as a finished
  // answer. deadlineMs is injected (a few ms here, 45s in production).
  const client = {
    messages: {
      create: async () => ({
        [Symbol.asyncIterator]: () => ({
          next: () => stalls(), // outlives the 20ms deadline, then settles
        }),
      }),
    },
  };
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, deadlineMs: 20 })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    stream
  );
  assert.ok(stream.text().startsWith(TUTOR_ERROR_SENTINEL), "deadline reaches the sentinel path");
});

test("F2: a request that never returns headers also hits the deadline", async () => {
  const client = { messages: { create: () => stalls() } };
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, deadlineMs: 20 })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    stream
  );
  assert.ok(stream.text().startsWith(TUTOR_ERROR_SENTINEL));
});

test("F3: a healthy stream is never cut by the deadline guard", async () => {
  const client = okClient();
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, deadlineMs: 5_000 })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    stream
  );
  assert.equal(stream.text(), "Hello");
});

// ---- credit metering + model tiering (the paid tutor) -----------------------
// The wallet and the JWT verifier are INJECTED like everything else, so every
// money branch runs offline. The wire contract under test:
//   - a legacy request ({slug, question}) behaves byte-identically to today
//   - the Cognito token rides x-tutor-auth (Authorization belongs to OAC SigV4)
//   - haiku-4-5 is free for EVERYONE; paid models reserve -> stream -> settle
//   - {meta: true} opts into a trailing TUTOR_META_SENTINEL + JSON

import { TUTOR_META_SENTINEL } from "./tutor-core.mjs";
import {
  INSUFFICIENT_CREDITS_MESSAGE,
  SIGN_IN_REQUIRED_MESSAGE,
  NOT_IN_PLAN_MESSAGE,
} from "./index.mjs";
import { MODEL_IDS, MODEL_LABELS, MAX_OUTPUT_TOKENS, creditsForUsage } from "./tutor-billing.mjs";

/**
 * Stub that reports usage the way the real API does: SPLIT across two events.
 * `message_start` carries the input legs, `message_delta` carries the final
 * output_tokens. A stub that emitted both in one event would let a handler
 * reading only one of them pass — and reading only one silently undercharges
 * (input-only bills output at zero; delta-only makes the entire prompt free,
 * and on this workload the prompt is the expensive half).
 */
function meteredClient({ input_tokens = 6_000, output_tokens = 400, ...rest } = {}) {
  const sent = [];
  return {
    sent,
    messages: {
      create: async (params) => {
        sent.push(params);
        return (async function* () {
          yield { type: "message_start", message: { usage: { input_tokens, output_tokens: 0, ...rest } } };
          yield textDelta("Answer.");
          yield { type: "message_delta", usage: { output_tokens } };
        })();
      },
    },
  };
}

/** In-memory wallet double recording debits/credits; tier + balance settable. */
function stubWallet({ tier = "pro", credits = 1_000, debitFails = false } = {}) {
  const calls = { reads: [], debits: [], credits: [] };
  return {
    calls,
    readTier: async (sub) => {
      calls.reads.push(sub);
      return tier;
    },
    debit: async (sub, n) => {
      calls.debits.push({ sub, n });
      if (debitFails) {
        const e = new Error("conditional failed");
        e.name = "ConditionalCheckFailedException";
        throw e;
      }
    },
    credit: async (sub, n) => {
      calls.credits.push({ sub, n });
    },
  };
}

const okVerifier = { verify: async () => ({ sub: "user-1" }) };
const badVerifier = {
  verify: async () => {
    throw new Error("expired");
  },
};

const paidEvent = (over = {}) => ({
  headers: { "x-tutor-auth": "idtok" },
  body: JSON.stringify({ slug: "00-prereqs", question: "hi", model: "opus-5", meta: true, ...over }),
});

test("M1: a legacy request is byte-identical — no wallet, no verifier, no trailer", async () => {
  const client = okClient();
  const wallet = stubWallet();
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    wallet,
  })({ body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) }, stream);
  assert.equal(stream.text(), "Hello"); // exactly today's bytes
  assert.equal(client.sent[0].model, MODEL_IDS["haiku-4-5"]); // the free-tier default
  assert.equal(wallet.calls.reads.length + wallet.calls.debits.length, 0, "wallet untouched");
});

test("M2: a Pro caller on a paid model reserves, streams, settles, and gets the meta trailer", async () => {
  // Usage sized BELOW the fixture prompt's worst-case reserve, so the settle
  // has a real (non-zero) refund to make. Expectations are computed from the
  // billing kernel rather than hardcoded, so a rate change cannot silently
  // turn this into the overshoot case (that case is M9's).
  const usage = { input_tokens: 200, output_tokens: 400 };
  const actual = creditsForUsage("opus-5", usage);
  const client = meteredClient(usage);
  const wallet = stubWallet({ tier: "pro", credits: 1_000 });
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    wallet,
  })(paidEvent(), stream);

  // the paid model was actually invoked (its inference profile, not the default)
  assert.equal(client.sent[0].model, MODEL_IDS["opus-5"]);

  // reserve happened BEFORE the model call, against the verified sub
  assert.equal(wallet.calls.debits.length, 1);
  assert.equal(wallet.calls.debits[0].sub, "user-1");
  const reserved = wallet.calls.debits[0].n;
  assert.ok(reserved > actual, "fixture must exercise the refund path (reserve > actual)");

  // settle refunded exactly the difference between worst case and REAL usage
  assert.equal(wallet.calls.credits.length, 1);
  assert.equal(wallet.calls.credits[0].n, reserved - actual);

  // the trailer carries what actually happened
  const out = stream.text();
  const at = out.indexOf(TUTOR_META_SENTINEL);
  assert.ok(at > 0, "meta trailer present after the answer");
  assert.equal(out.slice(0, at), "Answer.");
  const meta = JSON.parse(out.slice(at + TUTOR_META_SENTINEL.length));
  assert.equal(meta.model, "opus-5");
  assert.equal(meta.credits, actual);
  assert.equal(meta.label, MODEL_LABELS["opus-5"]);
});

test("M12: a metered debit leaves a durable trace of both the reserve and the settle", async () => {
  // The only wallet writer with NO artifact. Stripe persists EVENT#/RECEIPT#;
  // the QPU persists fundedBy + creditsCharged on its task row; the tutor did a
  // bare UpdateItem and logged only failures. So "a learner says 40 credits
  // vanished" was answerable for two of three surfaces and unanswerable for the
  // third — the wallet table has no stream, so PITR gives restore, not history.
  //
  // Two lines make it a Logs Insights query. A reserve with no matching settle
  // is also how you find a stranded reservation, which nothing sweeps today.
  const usage = { input_tokens: 200, output_tokens: 400 };
  const actual = creditsForUsage("opus-5", usage);
  const wallet = stubWallet({ tier: "pro", credits: 1_000 });
  const lines = [];
  const original = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try {
    await createHandlerCore({
      client: meteredClient(usage),
      corpus: FIXTURE_CORPUS,
      verifier: okVerifier,
      wallet,
    })(paidEvent(), makeStream());
  } finally {
    console.log = original;
  }

  const parsed = lines.map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return {};
    }
  });
  const reserve = parsed.find((p) => p.tutorReserve);
  const settle = parsed.find((p) => p.tutorSettle);
  assert.ok(reserve, "a reserve must be traceable");
  assert.ok(settle, "a settle must be traceable");

  assert.equal(reserve.sub, "user-1");
  assert.equal(reserve.model, "opus-5");
  assert.equal(reserve.reservedCredits, wallet.calls.debits[0].n);
  assert.equal(settle.sub, "user-1");
  assert.equal(settle.chargedCredits, actual);
  assert.equal(settle.refundedCredits, wallet.calls.debits[0].n - actual);

  // Rule 6: credits only. A dollar figure here would put the cost basis in
  // CloudWatch, and the log group is not the private notes.
  const joined = JSON.stringify(parsed);
  assert.doesNotMatch(joined, /usd|dollar|\$\d/i, "log credits, never money");
  // And never the learner's question or the lesson text.
  assert.doesNotMatch(joined, /question|prompt|lessonText/i, "no learner content in the log");
});

test("M13: the FREE path stays byte-identical — no metering log when nothing is metered", async () => {
  // The free tutor is the pre-metering tutor. Tracing must live inside the
  // metered branch only, or every free question writes a log line for a debit
  // that never happened.
  const lines = [];
  const original = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try {
    await createHandlerCore({ client: okClient(), corpus: FIXTURE_CORPUS })(
      { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
      makeStream()
    );
  } finally {
    console.log = original;
  }
  assert.equal(
    lines.filter((l) => l.includes("tutorReserve") || l.includes("tutorSettle")).length,
    0,
    "the unmetered path must not log a debit"
  );
});

test("M3: insufficient credits refuses BEFORE any model call, with the exact message", async () => {
  const client = meteredClient();
  const wallet = stubWallet({ tier: "pro", debitFails: true });
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    wallet,
  })(paidEvent(), stream);
  assert.equal(client.sent.length, 0, "no paid generation without a committed reserve");
  assert.ok(stream.text().includes(TUTOR_ERROR_SENTINEL));
  assert.ok(stream.text().includes(INSUFFICIENT_CREDITS_MESSAGE));
  assert.equal(wallet.calls.credits.length, 0, "nothing to refund — nothing was reserved");
});

test("M4: a paid-model request without a valid token is refused, never silently downgraded", async () => {
  const client = meteredClient();
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: badVerifier,
    wallet: stubWallet(),
  })(paidEvent(), stream);
  assert.equal(client.sent.length, 0);
  assert.ok(stream.text().includes(SIGN_IN_REQUIRED_MESSAGE));

  // same for a request with NO token at all
  const stream2 = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    wallet: stubWallet(),
  })({ body: paidEvent().body }, stream2);
  assert.ok(stream2.text().includes(SIGN_IN_REQUIRED_MESSAGE));
});

test("M5: a tier explicitly asking for a model above it is refused, not substituted", async () => {
  // The UI only offers allowed models, so this is defense — but an explicit,
  // known, unauthorized ask must never be quietly served by a different model.
  const client = meteredClient();
  const wallet = stubWallet({ tier: "plus" });
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    wallet,
  })(paidEvent({ model: "fable-5" }), stream);
  assert.equal(client.sent.length, 0);
  assert.ok(stream.text().includes(NOT_IN_PLAN_MESSAGE));
  assert.equal(wallet.calls.debits.length, 0);
});

test("M6: haiku is free for a signed-in caller — answered, metered at zero, no debit", async () => {
  const client = meteredClient();
  const wallet = stubWallet({ tier: "pro" });
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    wallet,
  })(paidEvent({ model: "haiku-4-5" }), stream);
  assert.equal(client.sent[0].model, MODEL_IDS["haiku-4-5"], "haiku answers the free request");
  assert.equal(wallet.calls.debits.length, 0, "the funnel model never debits");
  const out = stream.text();
  const meta = JSON.parse(out.slice(out.indexOf(TUTOR_META_SENTINEL) + TUTOR_META_SENTINEL.length));
  assert.equal(meta.credits, 0);
});

test("M7: a mid-stream failure settles at zero — the reserve is fully refunded", async () => {
  const client = {
    messages: {
      create: async () => (async function* () {
        yield textDelta("par");
        throw new Error("boom"); // dies before either usage event
      })(),
    },
  };
  const wallet = stubWallet({ tier: "pro" });
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    wallet,
  })(paidEvent(), stream);
  assert.ok(stream.text().includes(TUTOR_ERROR_SENTINEL));
  assert.equal(wallet.calls.debits.length, 1);
  assert.equal(wallet.calls.credits.length, 1);
  // no usage report -> charged 0 -> the WHOLE reserve comes back
  assert.equal(wallet.calls.credits[0].n, wallet.calls.debits[0].n);
});

test("M8: without a configured wallet, a paid-model request is refused up front", async () => {
  const client = meteredClient();
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    // no wallet injected — metering not deployed
  })(paidEvent(), stream);
  assert.equal(client.sent.length, 0);
  assert.ok(stream.text().includes(TUTOR_ERROR_SENTINEL));
});

test("M9: the settle never charges more than the reserve, even if usage overshoots the estimate", async () => {
  // Real input tokens can exceed the char-based estimate. The doctrine is
  // fail-toward-undercharging: charged = min(actual, reserved), never a
  // negative "refund" that would push a wallet below zero.
  const client = meteredClient({ input_tokens: 500_000, output_tokens: 800 });
  const wallet = stubWallet({ tier: "pro" });
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    wallet,
  })(paidEvent(), stream);
  const reserved = wallet.calls.debits[0].n;
  // charged is capped at the reserve, so there is nothing to refund — and a
  // zero refund is never written to the wallet (no pointless DDB call, and no
  // negative "refund" that could drain a balance).
  assert.equal(wallet.calls.credits.length, 0);
  // the trailer reports exactly the reserve — the most this generation can cost
  const out = stream.text();
  const meta = JSON.parse(out.slice(out.indexOf(TUTOR_META_SENTINEL) + TUTOR_META_SENTINEL.length));
  assert.equal(meta.credits, reserved);
});

test("M10: a learner owing clawback credits cannot spend on a paid model", async () => {
  // Same product rule as the QPU debit: debt must be CLEARED first.
  const calls = [];
  const wallet = {
    readTier: async () => "pro",
    debit: async (s, n) => {
      calls.push({ s, n });
      const e = new Error("condition failed");
      e.name = "ConditionalCheckFailedException";
      throw e;
    },
    credit: async () => {},
  };
  const client = meteredClient();
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    wallet,
  })(paidEvent(), stream);
  assert.equal(client.sent.length, 0, "no paid generation while a debt stands");
  assert.ok(stream.text().includes(INSUFFICIENT_CREDITS_MESSAGE));
});

// ---- the REAL wallet wiring (buildWallet) -----------------------------------
// The stub wallets above prove the handler's sequencing; this proves the
// DynamoDB shape the production wallet actually sends. The refund (credit) leg
// is the one that can MINT: an unconditional ADD against a missing WALLET# key
// materializes a row holding credits nobody paid for (rule 11).

import { buildWallet } from "./index.mjs";

test("N1: buildWallet.credit never mints a missing wallet row — conditional, logged loudly, not thrown", async () => {
  const sent = [];
  const ddb = {
    send: async (cmd) => {
      sent.push(cmd.input);
      throw Object.assign(new Error("The conditional request failed"), {
        name: "ConditionalCheckFailedException",
      });
    },
  };
  const wallet = buildWallet({ table: "wallet", ddb });
  const errors = [];
  const original = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    // Must NOT throw: this is the refund path — the learner already lost the
    // generation, and a throw here would fail a response that already streamed.
    await wallet.credit("user-1", 40);
  } finally {
    console.error = original;
  }
  assert.match(
    sent[0].ConditionExpression ?? "",
    /attribute_exists\(pk\)/,
    "a refund must never create the wallet row",
  );
  assert.match(sent[0].UpdateExpression, /ADD credits :pos/);
  assert.equal(sent[0].ExpressionAttributeValues[":pos"].N, "40");
  assert.ok(
    errors.some((l) => l.includes("tutorRefundNoWalletRow")),
    "money owed a learner must alarm — the log line is the metric-filter hook",
  );
});

// ---- the request shape itself ---------------------------------------------
// Everything below is a 400 or a silent cost bug on the real API, and none of
// it is visible from the streamed text. The Bedrock-era handler would have hit
// the first two on its first paid request.

test("W1: no sampling parameters survive — they are a 400 on every paid model", async () => {
  const client = okClient();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    makeStream()
  );
  for (const banned of ["temperature", "top_p", "top_k"]) {
    assert.equal(client.sent[0][banned], undefined, `${banned} is rejected on Opus/Sonnet 4.7+`);
  }
});

test("W2: the lesson prefix carries a cache breakpoint, and the question sits outside it", async () => {
  // Tutor cost is input-dominated: the whole lesson is re-sent with every
  // question. Losing this breakpoint costs ~10x on input with no symptom the
  // learner or the logs would show.
  const client = okClient();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    makeStream()
  );
  const { system, messages } = client.sent[0];
  assert.deepEqual(system[0].cache_control, { type: "ephemeral" }, "no cache breakpoint on the prefix");
  assert.ok(system[0].text.includes("lesson body"), "the cached block must be the lesson");
  // The learner's question is the only varying part; inside the prefix it would
  // invalidate the cache on every single request.
  assert.equal(messages[0].content, "hi");
});

test("W3: fable-5 is sent no thinking config and a ceiling that fits its thinking", async () => {
  // fable-5 rejects thinking:{type:"disabled"} with a 400 — thinking is always
  // on — and thinking bills as output against this same max_tokens. An 800-token
  // ceiling would be spent reasoning and return a truncated answer.
  const client = meteredClient();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    verifier: okVerifier,
    wallet: stubWallet({ tier: "pro" }),
  })(paidEvent({ model: "fable-5" }), makeStream());

  const sent = client.sent[0];
  assert.equal(sent.model, MODEL_IDS["fable-5"]);
  assert.equal(sent.thinking, undefined, "any thinking config is a 400 on fable-5");
  assert.equal(sent.max_tokens, MAX_OUTPUT_TOKENS["fable-5"]);
  assert.ok(sent.max_tokens > MAX_OUTPUT_TOKENS["opus-5"], "fable-5 needs room to think");
});

test("W4: the reserve is sized against the model's OWN ceiling, not a shared constant", async () => {
  // The settle caps the charge at the reserve, so a reserve computed against
  // 800 output tokens while fable-5 may emit 4,000 silently absorbs the
  // difference. Comparing fable-5's reserve to opus-5's does NOT test this —
  // fable-5 reserves more either way because its rate is twice opus-5's, so
  // that assertion passes even against a hardcoded shared ceiling. (Verified
  // by mutation: it did.) Pin the exact figure instead.
  const reserveFor = async (model) => {
    const wallet = stubWallet({ tier: "pro", credits: 1_000_000 });
    const client = meteredClient();
    await createHandlerCore({
      client,
      corpus: FIXTURE_CORPUS,
      verifier: okVerifier,
      wallet,
    })(paidEvent({ model }), makeStream());
    return { reserved: wallet.calls.debits[0].n, sentCeiling: client.sent[0].max_tokens };
  };

  for (const model of ["opus-5", "fable-5"]) {
    const { reserved, sentCeiling } = await reserveFor(model);
    // The ceiling the reserve assumed and the ceiling actually sent to the API
    // must be the same number, or the bound is against a fiction.
    assert.equal(sentCeiling, MAX_OUTPUT_TOKENS[model], `${model}: wrong ceiling on the wire`);
    const worstRealCost = creditsForUsage(model, {
      input_tokens: 0,
      output_tokens: sentCeiling,
      cache_creation_input_tokens: 0,
    });
    assert.ok(
      reserved >= worstRealCost,
      `${model}: reserved ${reserved} < ${worstRealCost}, the cost of output alone at the ceiling`
    );
  }
});

test("W5: a paid generation whose usage cannot be read alarms instead of going quiet", async () => {
  // The migration's silent failure, at the handler level: a usage report in the
  // OLD provider's shape prices to 0, so a paid generation streams a full
  // answer and bills nothing. Without this log line nothing anywhere says so —
  // the response is 200, the text is correct, and Lambda Errors stays flat.
  const client = {
    sent: [],
    messages: {
      create: async (params) => {
        client.sent.push(params);
        return (async function* () {
          yield textDelta("Answer.");
          // Bedrock's camelCase spelling — what an un-migrated provider sends.
          yield { type: "message_delta", usage: { inputTokens: 5_000, outputTokens: 700 } };
        })();
      },
    },
  };
  const wallet = stubWallet({ tier: "pro" });
  const errors = [];
  const original = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    await createHandlerCore({
      client,
      corpus: FIXTURE_CORPUS,
      verifier: okVerifier,
      wallet,
    })(paidEvent(), makeStream());
  } finally {
    console.error = original;
  }

  assert.ok(
    errors.some((l) => l.includes(USAGE_SHAPE_UNRECOGNIZED)),
    "an unreadable usage report must be logged, or free inference is invisible"
  );
  // And it still fails toward undercharging: the whole reserve comes back.
  assert.equal(wallet.calls.credits[0].n, wallet.calls.debits[0].n);
});
