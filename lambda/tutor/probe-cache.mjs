// Measure what Bedrock ACTUALLY reports when a cachePoint is used.
//
// Two questions the docs do not settle, both of which change the billing math:
//   1. Does `usage.inputTokens` INCLUDE cached tokens, or is it the uncached remainder?
//      If it excludes them, adding a cachePoint silently drops what creditsForUsage bills.
//   2. Does our SMALLEST lesson clear Claude Haiku 4.5's 4,096-token checkpoint minimum?
//      Below it, inference still succeeds and simply does not cache — silently.
//
// Runs the REAL system prompt against the REAL model, twice (write then read).
// Cost is a couple of cents. Usage:  node lambda/tutor/probe-cache.mjs
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { readFileSync } from "node:fs";
import { buildSystemPrompt } from "./tutor-core.mjs";

const MODEL = process.env.PROBE_MODEL || "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const client = new BedrockRuntimeClient({ region: "us-east-2" });
const corpus = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8"));

const ask = async (system, question, withCache) => {
  const res = await client.send(
    new ConverseCommand({
      modelId: MODEL,
      system: withCache
        ? [{ text: system }, { cachePoint: { type: "default" } }]
        : [{ text: system }],
      messages: [{ role: "user", content: [{ text: question }] }],
      inferenceConfig: { maxTokens: 64, temperature: 0.2 },
    }),
  );
  return res.usage;
};

const show = (label, u) =>
  console.log(
    `  ${label.padEnd(26)} in=${String(u.inputTokens).padStart(6)} ` +
      `out=${String(u.outputTokens).padStart(4)} ` +
      `cacheRead=${String(u.cacheReadInputTokens ?? "-").padStart(6)} ` +
      `cacheWrite=${String(u.cacheWriteInputTokens ?? "-").padStart(6)} ` +
      `total=${String(u.totalTokens).padStart(6)}`,
  );

for (const slug of ["03-algorithms", "05-quantum-chemistry"]) {
  const system = buildSystemPrompt(corpus[slug]);
  console.log(`\n== ${slug}  (system prompt ${system.length} chars) ==`);

  const base = await ask(system, "In one sentence, what is this lesson about?", false);
  show("no cachePoint", base);

  const w = await ask(system, "In one sentence, what is this lesson about?", true);
  show("cachePoint (1st: write)", w);

  const r = await ask(system, "In one word, name the topic.", true);
  show("cachePoint (2nd: read)", r);

  const cached = Number(r.cacheReadInputTokens ?? 0);
  console.log(
    cached > 0
      ? `  => CACHING ENGAGED: ${cached} tokens read from cache`
      : `  => NO CACHE HIT — likely under the 4,096-token checkpoint minimum`,
  );
  console.log(
    `  => inputTokens ${base.inputTokens} (no cache) vs ${r.inputTokens} (cache read): ` +
      (cached > 0 && r.inputTokens < base.inputTokens * 0.5
        ? "EXCLUSIVE — inputTokens is the UNCACHED REMAINDER, so creditsForUsage would undercharge"
        : "inputTokens appears to INCLUDE cached tokens — billing shape unchanged"),
  );
}
