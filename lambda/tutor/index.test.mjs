/**
 * Offline tests for the tutor handler logic. They exercise createHandlerCore
 * (the real per-request body) against a stubbed Bedrock client + fixture corpus,
 * so the streaming loop, the error-sentinel path, and the paid-call gate are
 * covered with no AWS creds, no real model call, and no packaged corpus.json.
 *
 * Run: `cd lambda/tutor && npm install && node --test`
 * (npm install is required because index.mjs imports @aws-sdk/client-bedrock-runtime
 * at module top.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHandlerCore,
  TUTOR_ERROR_SENTINEL,
  OUT_OF_SCOPE_MESSAGE,
  TOO_LONG_MESSAGE,
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

// A stub Bedrock client that records the commands it was sent and streams three
// deltas (two with text, one text-less — which the handler must skip).
function okClient() {
  const sent = [];
  return {
    sent,
    send: async (command) => {
      sent.push(command);
      return {
        stream: (async function* () {
          yield { contentBlockDelta: { delta: { text: "Hel" } } };
          yield { contentBlockDelta: { delta: { text: "lo" } } };
          yield { contentBlockDelta: {} }; // text-less delta -> skipped
        })(),
      };
    },
  };
}

test("A: streams concatenated text deltas, skips text-less deltas, sends a grounded command", async () => {
  const client = okClient();
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, modelId: "model-x" })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    stream
  );
  assert.equal(stream.text(), "Hello");
  assert.equal(client.sent.length, 1);
  const { input } = client.sent[0]; // AWS SDK v3 command stores args under .input
  assert.equal(input.modelId, "model-x");
  assert.ok(input.system?.[0]?.text?.includes("LESSON TEXT:"), "system prompt has the grounding section");
  // Assert the section's ACTUAL text reaches the model, not just the static label —
  // a regression dropping section.text (the whole point of grounding) must fail here.
  assert.ok(input.system[0].text.includes("lesson body"), "grounding text reaches the model");
  assert.equal(input.messages?.[0]?.content?.[0]?.text, "hi");
});

test("B2: writes text then the error sentinel when the stream throws mid-flight", async () => {
  // send() resolves, then the delta loop throws after a chunk is already written —
  // the realistic streaming failure. The client scans with indexOf (not startsWith),
  // tolerating the sentinel after partial text, so assert includes() + text-before.
  const client = {
    send: async () => ({
      stream: (async function* () {
        yield { contentBlockDelta: { delta: { text: "partial" } } };
        throw new Error("mid-stream boom");
      })(),
    }),
  };
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, modelId: "m" })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    stream
  );
  const out = stream.text();
  assert.ok(out.startsWith("partial"), "already-streamed text is preserved");
  assert.ok(out.includes(TUTOR_ERROR_SENTINEL), "sentinel is emitted after the partial text");
});

test("B: writes the in-band error sentinel when the client throws", async () => {
  const client = {
    send: async () => {
      throw new Error("boom");
    },
  };
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, modelId: "m" })(
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
      send: async () => {
        called = true;
        return { stream: (async function* () {})() };
      },
    };
    const stream = makeStream();
    await createHandlerCore({ client, corpus: FIXTURE_CORPUS, modelId: "m" })({ body }, stream);
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
    send: async () => {
      called = true;
      return { stream: (async function* () {})() };
    },
  };
  const stream = makeStream();
  const huge = "x".repeat(17 * 1024); // > 16 KiB cap
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, modelId: "m" })(
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
    send: async () => {
      called = true;
      return { stream: (async function* () {})() };
    },
  };
  const stream = makeStream();
  // ~7k UTF-16 units but ~21 KiB of UTF-8 — under the OLD gate, over the real one.
  const glyphs = "⊗".repeat(7 * 1024);
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, modelId: "m" })(
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
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, modelId: "m" })(
    { body: JSON.stringify({ slug: "00-prereqs", question: long }) },
    stream
  );
  const sent = client.sent[0].input.messages[0].content[0].text;
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
    send: async () => ({
      stream: {
        [Symbol.asyncIterator]: () => ({
          next: () => stalls(), // outlives the 20ms deadline, then settles
        }),
      },
    }),
  };
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, modelId: "m", deadlineMs: 20 })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    stream
  );
  assert.ok(stream.text().startsWith(TUTOR_ERROR_SENTINEL), "deadline reaches the sentinel path");
});

test("F2: a send that never returns headers also hits the deadline", async () => {
  const client = { send: () => stalls() };
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, modelId: "m", deadlineMs: 20 })(
    { body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) },
    stream
  );
  assert.ok(stream.text().startsWith(TUTOR_ERROR_SENTINEL));
});

test("F3: a healthy stream is never cut by the deadline guard", async () => {
  const client = okClient();
  const stream = makeStream();
  await createHandlerCore({ client, corpus: FIXTURE_CORPUS, modelId: "m", deadlineMs: 5_000 })(
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
import { PROFILE_IDS, MODEL_LABELS, creditsForUsage } from "./tutor-billing.mjs";

/** Bedrock stub that also emits the usage metadata event, like the real
 *  ConverseStream does after the last delta. */
function meteredClient({ inputTokens = 6_000, outputTokens = 400 } = {}) {
  const sent = [];
  return {
    sent,
    send: async (command) => {
      sent.push(command);
      return {
        stream: (async function* () {
          yield { contentBlockDelta: { delta: { text: "Answer." } } };
          yield { metadata: { usage: { inputTokens, outputTokens } } };
        })(),
      };
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
    modelId: "app-profile-arn",
    verifier: okVerifier,
    wallet,
  })({ body: JSON.stringify({ slug: "00-prereqs", question: "hi" }) }, stream);
  assert.equal(stream.text(), "Hello"); // exactly today's bytes
  assert.equal(client.sent[0].input.modelId, "app-profile-arn"); // env default model
  assert.equal(wallet.calls.reads.length + wallet.calls.debits.length, 0, "wallet untouched");
});

test("M2: a Pro caller on a paid model reserves, streams, settles, and gets the meta trailer", async () => {
  // Usage sized BELOW the fixture prompt's worst-case reserve, so the settle
  // has a real (non-zero) refund to make. Expectations are computed from the
  // billing kernel rather than hardcoded, so a rate change cannot silently
  // turn this into the overshoot case (that case is M9's).
  const usage = { inputTokens: 200, outputTokens: 400 };
  const actual = creditsForUsage("opus-5", usage);
  const client = meteredClient(usage);
  const wallet = stubWallet({ tier: "pro", credits: 1_000 });
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    modelId: "app-profile-arn",
    verifier: okVerifier,
    wallet,
  })(paidEvent(), stream);

  // the paid model was actually invoked (its inference profile, not the default)
  assert.equal(client.sent[0].input.modelId, PROFILE_IDS["opus-5"]);

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
  const usage = { inputTokens: 200, outputTokens: 400 };
  const actual = creditsForUsage("opus-5", usage);
  const wallet = stubWallet({ tier: "pro", credits: 1_000 });
  const lines = [];
  const original = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try {
    await createHandlerCore({
      client: meteredClient(usage),
      corpus: FIXTURE_CORPUS,
      modelId: "app-profile-arn",
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
    await createHandlerCore({ client: okClient(), corpus: FIXTURE_CORPUS, modelId: "m" })(
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
    modelId: "m",
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
    modelId: "m",
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
    modelId: "m",
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
    modelId: "m",
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
    modelId: "app-profile-arn",
    verifier: okVerifier,
    wallet,
  })(paidEvent({ model: "haiku-4-5" }), stream);
  assert.equal(client.sent[0].input.modelId, "app-profile-arn", "haiku keeps the app profile");
  assert.equal(wallet.calls.debits.length, 0, "the funnel model never debits");
  const out = stream.text();
  const meta = JSON.parse(out.slice(out.indexOf(TUTOR_META_SENTINEL) + TUTOR_META_SENTINEL.length));
  assert.equal(meta.credits, 0);
});

test("M7: a mid-stream failure settles at zero — the reserve is fully refunded", async () => {
  const client = {
    send: async () => ({
      stream: (async function* () {
        yield { contentBlockDelta: { delta: { text: "par" } } };
        throw new Error("boom"); // dies before the usage metadata event
      })(),
    }),
  };
  const wallet = stubWallet({ tier: "pro" });
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    modelId: "m",
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
    modelId: "m",
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
  const client = meteredClient({ inputTokens: 500_000, outputTokens: 800 });
  const wallet = stubWallet({ tier: "pro" });
  const stream = makeStream();
  await createHandlerCore({
    client,
    corpus: FIXTURE_CORPUS,
    modelId: "m",
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
    modelId: "m",
    verifier: okVerifier,
    wallet,
  })(paidEvent(), stream);
  assert.equal(client.sent.length, 0, "no paid generation while a debt stands");
  assert.ok(stream.text().includes(INSUFFICIENT_CREDITS_MESSAGE));
});
