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
import { createHandlerCore, TUTOR_ERROR_SENTINEL, OUT_OF_SCOPE_MESSAGE } from "./index.mjs";

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

test("D: a body over MAX_BODY_BYTES is rejected as out-of-scope, no model call", async () => {
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
  assert.equal(stream.text(), OUT_OF_SCOPE_MESSAGE);
  assert.equal(called, false);
});
