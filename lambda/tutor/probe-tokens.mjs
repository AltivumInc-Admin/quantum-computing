// Exact token count of every lesson's system prompt, measured by the model itself.
// Determines which lessons clear Claude Haiku 4.5's 4,096-token cache-checkpoint
// minimum — below it a cachePoint is accepted and silently does nothing.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { readFileSync } from "node:fs";
import { buildSystemPrompt } from "./tutor-core.mjs";

const MIN = 4096;
const client = new BedrockRuntimeClient({ region: "us-east-2" });
const corpus = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8"));

const rows = [];
for (const [slug, section] of Object.entries(corpus)) {
  const system = buildSystemPrompt(section);
  const res = await client.send(
    new ConverseCommand({
      modelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: "." }] }],
      inferenceConfig: { maxTokens: 1, temperature: 0.2 },
    }),
  );
  rows.push({ slug, chars: system.length, tokens: res.usage.inputTokens });
}

rows.sort((a, b) => a.tokens - b.tokens);
console.log(`\n  ${"slug".padEnd(22)} ${"chars".padStart(7)} ${"tokens".padStart(7)}  chars/tok  caches?`);
for (const r of rows) {
  console.log(
    `  ${r.slug.padEnd(22)} ${String(r.chars).padStart(7)} ${String(r.tokens).padStart(7)}` +
      `  ${(r.chars / r.tokens).toFixed(2).padStart(8)}  ${r.tokens >= MIN ? "yes" : "NO — under 4,096"}`,
  );
}
const ok = rows.filter((r) => r.tokens >= MIN).length;
console.log(`\n  ${ok}/${rows.length} lessons clear the ${MIN}-token minimum.`);
console.log(`  cacheable input: ${rows.filter(r=>r.tokens>=MIN).reduce((a,r)=>a+r.tokens,0)} of ${rows.reduce((a,r)=>a+r.tokens,0)} tokens across the corpus.`);
