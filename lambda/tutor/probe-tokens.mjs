// Exact token count of every lesson's system prompt, and which models will
// actually cache it.
//
// The minimum cacheable prefix is per-model and NOT monotonic across
// generations — 4,096 tokens on Claude Haiku 4.5 but only 512 on Opus 5. Under
// the minimum the request is accepted and simply does not cache: no error, no
// warning, `cache_creation_input_tokens: 0`. Tutor cost is input-dominated (the
// whole lesson rides along with every question), so a lesson that quietly stops
// caching is a large, invisible cost regression.
//
// Uses count_tokens, which bills nothing and generates nothing — the previous
// Bedrock version ran a real 1-token generation on every lesson to read the
// input count off the usage report.
//
//   SECRET_ID=quantum-tutor node lambda/tutor/probe-tokens.mjs
//   # or: ANTHROPIC_API_KEY=... node lambda/tutor/probe-tokens.mjs
import Anthropic from "@anthropic-ai/sdk";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { readFileSync } from "node:fs";
import { buildSystemPrompt } from "./tutor-core.mjs";
import { MODEL_IDS } from "./tutor-billing.mjs";

/** Minimum cacheable prefix, per model. Not monotonic — check, do not infer. */
const CACHE_MIN = {
  "haiku-4-5": 4096,
  "sonnet-5": 1024,
  "opus-5": 512,
  "fable-5": 512,
};

async function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const sm = new SecretsManagerClient({});
  const res = await sm.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ID ?? "quantum-tutor" }));
  return JSON.parse(res.SecretString).apiKey;
}

const client = new Anthropic({ apiKey: await apiKey() });
const corpus = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8"));

const rows = [];
for (const [slug, section] of Object.entries(corpus)) {
  const system = buildSystemPrompt(section);
  // Count against the cheapest roster model; the tokenizer is shared across the
  // current generation, so one count answers for all of them.
  const res = await client.messages.countTokens({
    model: MODEL_IDS["haiku-4-5"],
    system: [{ type: "text", text: system }],
    messages: [{ role: "user", content: "." }],
  });
  rows.push({ slug, chars: system.length, tokens: res.input_tokens });
}

rows.sort((a, b) => a.tokens - b.tokens);
const models = Object.keys(CACHE_MIN);

console.log(`\n  ${"slug".padEnd(22)} ${"chars".padStart(7)} ${"tokens".padStart(7)}  chars/tok  caches on`);
for (const r of rows) {
  const caches = models.filter((m) => r.tokens >= CACHE_MIN[m]);
  console.log(
    `  ${r.slug.padEnd(22)} ${String(r.chars).padStart(7)} ${String(r.tokens).padStart(7)}` +
      `  ${(r.chars / r.tokens).toFixed(2).padStart(8)}  ${caches.length ? caches.join(", ") : "NOTHING"}`,
  );
}

console.log("");
const total = rows.reduce((a, r) => a + r.tokens, 0);
for (const m of models) {
  const hit = rows.filter((r) => r.tokens >= CACHE_MIN[m]);
  const cacheable = hit.reduce((a, r) => a + r.tokens, 0);
  console.log(
    `  ${m.padEnd(10)} min ${String(CACHE_MIN[m]).padStart(5)}  ` +
      `${String(hit.length).padStart(2)}/${rows.length} lessons  ` +
      `${cacheable}/${total} tokens cacheable (${((cacheable / total) * 100).toFixed(0)}%)`,
  );
}
console.log(
  "\n  A lesson that caches on nothing pays full input price on every question.\n" +
    "  The fix is longer lesson text, not a code change.\n",
);
