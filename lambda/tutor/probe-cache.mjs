// Measure what the provider ACTUALLY reports when prompt caching is on.
//
// Two questions the docs do not settle, both of which change the billing math:
//   1. Does `input_tokens` INCLUDE cached tokens, or is it the uncached remainder?
//      If it excludes them, caching silently drops most of what creditsForUsage bills.
//   2. Does a given lesson clear this model's minimum cacheable prefix? Below it,
//      inference still succeeds and simply does not cache — no error, no warning.
//
// Both were answered against Amazon Bedrock and their answers are baked into
// tutor-billing.mjs (input_tokens is the uncached remainder; cache read 0.1x,
// write 1.25x). This re-runs them against the first-party API so those constants
// stay measured rather than inherited — same questions, new provider.
//
// Runs the REAL system prompt against the REAL model, twice (write then read).
// Cost is a couple of cents.
//
//   SECRET_ID=quantum-tutor node lambda/tutor/probe-cache.mjs
//   PROBE_MODEL=opus-5 node lambda/tutor/probe-cache.mjs
import Anthropic from "@anthropic-ai/sdk";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { readFileSync } from "node:fs";
import { buildSystemPrompt } from "./tutor-core.mjs";
import { MODEL_IDS, MAX_OUTPUT_TOKENS, modelRequestOptions } from "./tutor-billing.mjs";

const MODEL = process.env.PROBE_MODEL || "haiku-4-5";
if (!MODEL_IDS[MODEL]) {
  console.error(`PROBE_MODEL must be one of: ${Object.keys(MODEL_IDS).join(", ")}`);
  process.exit(2);
}

async function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const sm = new SecretsManagerClient({});
  const res = await sm.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ID ?? "quantum-tutor" }));
  return JSON.parse(res.SecretString).apiKey;
}

const client = new Anthropic({ apiKey: await apiKey() });
const corpus = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8"));

const ask = async (system, question, withCache) => {
  const res = await client.messages.create({
    model: MODEL_IDS[MODEL],
    ...modelRequestOptions(MODEL),
    max_tokens: Math.min(64, MAX_OUTPUT_TOKENS[MODEL]),
    system: withCache
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : [{ type: "text", text: system }],
    messages: [{ role: "user", content: question }],
  });
  return res.usage;
};

const show = (label, u) =>
  console.log(
    `  ${label.padEnd(26)} in=${String(u.input_tokens).padStart(6)} ` +
      `out=${String(u.output_tokens).padStart(4)} ` +
      `cacheRead=${String(u.cache_read_input_tokens ?? "-").padStart(6)} ` +
      `cacheWrite=${String(u.cache_creation_input_tokens ?? "-").padStart(6)}`,
  );

console.log(`\nprobing ${MODEL} (${MODEL_IDS[MODEL]})`);

for (const slug of ["03-algorithms", "05-quantum-chemistry"]) {
  const system = buildSystemPrompt(corpus[slug]);
  console.log(`\n== ${slug}  (system prompt ${system.length} chars) ==`);

  const base = await ask(system, "In one sentence, what is this lesson about?", false);
  show("no cache_control", base);

  const w = await ask(system, "In one sentence, what is this lesson about?", true);
  show("cache_control (1st: write)", w);

  const r = await ask(system, "In one word, name the topic.", true);
  show("cache_control (2nd: read)", r);

  const cached = Number(r.cache_read_input_tokens ?? 0);
  console.log(
    cached > 0
      ? `  => CACHING ENGAGED: ${cached} tokens read from cache`
      : `  => NO CACHE HIT — this lesson is under ${MODEL}'s minimum cacheable prefix`,
  );
  // The inclusive/exclusive question is only answerable when something actually
  // cached. Below the minimum prefix both runs bill the same full input, and the
  // naive comparison lands in the "INCLUDE" branch and cries double-counting on a
  // perfectly healthy lesson. Say "unanswered" rather than raise a false alarm.
  console.log(
    cached === 0
      ? `  => input_tokens ${base.input_tokens} (no cache) vs ${r.input_tokens} (cache read): ` +
        "UNANSWERED — nothing cached, so this run cannot tell inclusive from exclusive"
      : `  => input_tokens ${base.input_tokens} (no cache) vs ${r.input_tokens} (cache read): ` +
        (r.input_tokens < base.input_tokens * 0.5
          ? "EXCLUSIVE — input_tokens is the UNCACHED REMAINDER, which is what readUsage assumes"
          : "input_tokens appears to INCLUDE cached tokens — readUsage would DOUBLE-COUNT, fix it"),
  );
}
