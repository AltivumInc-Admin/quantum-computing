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
          next: () => new Promise(() => {}), // never settles
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
  const client = { send: () => new Promise(() => {}) };
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
