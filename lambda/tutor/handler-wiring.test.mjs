/**
 * Offline tests for the PRODUCTION wiring of index.mjs — the part index.test.mjs
 * structurally cannot reach.
 *
 * `handler` is only built when `awslambda.streamifyResponse` exists, which is
 * never true under a plain `node --test`, so three things had no test at all:
 * the `HttpResponseStream.from(..., { statusCode, headers })` contract the
 * browser's byte-stream reader depends on, the fact that the wrapper actually
 * invokes the core, and the `process.env.TUTOR_MODEL_ID` read — a two-sided
 * contract with template.yaml whose breakage makes every ConverseStreamCommand
 * fail and hands 100% of learners the error sentinel.
 *
 * This file installs a fake `awslambda` global and dynamically imports the
 * module, so the real wiring runs with no Lambda runtime, no AWS creds and no
 * packaged corpus. `node --test` runs each file in its own process, so the fake
 * global cannot leak into index.test.mjs.
 *
 * Run: `cd lambda/tutor && npm ci && npm test`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const recorded = [];

// Import the SDK FIRST: it installs its own `awslambda` global (an empty object),
// which would otherwise clobber the fake installed below. index.mjs capability-
// checks for streamifyResponse precisely because that stub exists.
await import("@aws-sdk/client-bedrock-runtime");

globalThis.awslambda = {
  streamifyResponse: (fn) => fn,
  HttpResponseStream: {
    from: (responseStream, init) => {
      recorded.push(init);
      return responseStream;
    },
  },
};

const { handler, OUT_OF_SCOPE_MESSAGE } = await import("./index.mjs");

test("the streaming handler is constructed when the runtime provides awslambda", () => {
  assert.equal(typeof handler, "function", "handler must exist inside the Lambda runtime");
});

test("it commits 200 with text/plain — the contract the client's byte reader depends on", async () => {
  const chunks = [];
  const sink = { write: (s) => chunks.push(s), end: () => {} };

  // A slug no corpus can contain, so this exercises the wiring without a real
  // Bedrock call — the module-scope client here is the production one.
  await handler({ body: JSON.stringify({ slug: "__wiring-probe__", question: "hi" }) }, sink);

  assert.equal(recorded.length, 1, "HttpResponseStream.from must be called once per invocation");
  const init = recorded[0];
  assert.equal(init.statusCode, 200, "the response is committed as 200 before the model call");
  assert.equal(
    init.headers["Content-Type"],
    "text/plain; charset=utf-8",
    "the client reads raw bytes, not JSON or SSE"
  );
  // The wrapper must actually RUN the core, not merely build it: the refusal for
  // the unknown slug is the observable proof that the core executed and wrote to
  // the sink the wrapper handed it.
  assert.equal(chunks.join(""), OUT_OF_SCOPE_MESSAGE);
});

test("every env var the handler reads is declared in template.yaml", () => {
  // The same code-to-template pinning idiom template.test.mjs uses for the metric
  // filter's log term, applied to the variable that makes the function work at
  // all: rename either side and the model id is undefined, every model call
  // fails, and nothing outside CloudWatch says why.
  const source = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
  const template = readFileSync(new URL("./template.yaml", import.meta.url), "utf8");

  const read = [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.ok(read.includes("TUTOR_MODEL_ID"), "the handler must still read TUTOR_MODEL_ID");

  const declared = template.slice(template.indexOf("Environment:"));
  for (const name of new Set(read)) {
    assert.match(
      declared,
      new RegExp(`^\\s+${name}:`, "m"),
      `${name} is read by index.mjs but not declared under Environment: Variables:`
    );
  }
});
