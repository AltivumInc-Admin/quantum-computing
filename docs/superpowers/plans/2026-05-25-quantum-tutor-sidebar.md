# Curriculum-Aware Quantum Tutor in the Sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship an anchor-positioned, streaming AI tutor in the section sidebar — indexed against every `GUIDE.md`, every notebook cell, every `lib/` docstring. The tutor knows the reader's current section, streams answers with citations back to source paragraphs, refuses to answer when retrieval is weak, and never spoilers later sections.

**Architecture:** Build-time embedding script chunks GUIDEs + notebook cells, embeds via Voyage AI, and writes `web/public/corpus.json` (a few MB, served as a static asset). A Lambda function fetches `corpus.json` on cold start, does in-memory cosine similarity retrieval, hard-slices by `sectionSlug`, then streams Claude Sonnet 4.6 via Bedrock with citations as SSE events. The browser renders an anchor-positioned TutorPanel with `view-transition-name` on cited paragraphs for the "found it" highlight.

**Tech Stack:** Voyage AI `voyage-3-large` embeddings; AWS Bedrock + Claude Sonnet 4.6; AWS Lambda + API Gateway HTTP API (CloudFormation); CSS Anchor Positioning; View Transitions; SSE streaming; `localStorage` for conversation history.

---

## Objective

A reader on `/learn/02-algorithms` should be able to press `Cmd-K`, ask "Why does Grover need π/4 √N iterations?", and get a streamed paragraph that quotes the exact GUIDE section, with citation chips that highlight the source on click. The tutor refuses politely when asked about content from later sections, when asked questions unrelated to the curriculum, and when retrieval scores fall below a confidence floor — so it never hallucinates a wrong physics explanation.

## Prerequisites

- AWS account already provisioned for Amplify; will add Lambda + API Gateway + Bedrock model access in the same account.
- Bedrock model access enabled for `anthropic.claude-sonnet-4-6` in the deploying region.
- Voyage AI API key (set as Amplify env var; never client-exposed).
- Read: `web/src/components/sidebar.tsx`, `web/src/lib/content.ts`, `web/src/lib/sections.ts`, `infra/cloudformation/` existing templates.
- Decision: embedding model (recommend `voyage-3-large` for technical-content quality).
- Decision: inference path (recommend Bedrock — keeps everything in AWS; alt: direct Anthropic API).
- Decision: history storage (recommend client `localStorage`; no server-side PII).

## Step-by-Step Implementation

1. Corpus extractor
   - [ ] 1.1. Create `web/scripts/build-corpus.ts`. Use `tsx` to run.
   - [ ] 1.2. Walk repo root (`path.resolve(process.cwd(), "..")` per existing `content.ts` pattern), enumerate `*/GUIDE.md` and `*/notebooks/*.ipynb`.
   - [ ] 1.3. Chunk strategy: split `GUIDE.md` on `## ` and `### ` headings, keep each chunk ≤ 1500 chars (split on paragraph if needed). Split notebooks cell-by-cell.
   - [ ] 1.4. Emit each chunk as `{ id, sectionSlug, anchor, sourceType: "guide"|"notebook", text, headingPath }` where `anchor` is the slugified heading.
   - [ ] 1.5. Write intermediate `web/.corpus/chunks.json` (gitignored).

2. Embed the corpus
   - [ ] 2.1. Extend `build-corpus.ts` to call Voyage AI's `/v1/embeddings` endpoint with `voyage-3-large`, 128 chunks per batch.
   - [ ] 2.2. Content-hash each chunk; reuse embeddings from a prior `web/.corpus/embeddings-cache.json` when the hash matches.
   - [ ] 2.3. Write final `web/public/corpus.json`: `{ schemaVersion: 1, model: "voyage-3-large", chunks: [{ id, sectionSlug, anchor, headingPath, sourceType, text, embedding: number[] }] }`.
   - [ ] 2.4. Pretty-print size in build logs.

3. Wire into build
   - [ ] 3.1. Modify `web/package.json`:
     ```json
     "scripts": {
       "build": "next build",
       "prebuild": "tsx scripts/build-corpus.ts"
     }
     ```
   - [ ] 3.2. `npm install --save-dev tsx`.
   - [ ] 3.3. Add `web/.corpus/` and `web/public/corpus.json` to `web/.gitignore`.

4. Corpus quality eval
   - [ ] 4.1. Create `web/scripts/eval-corpus.ts` with 30 hand-curated `{question, expectedChunkIds[]}` pairs.
   - [ ] 4.2. For each, embed the question, score by cosine similarity against the corpus, check top-3 hit rate.
   - [ ] 4.3. Run: `tsx scripts/eval-corpus.ts` — assert ≥ 80% top-3 hit rate; fail otherwise.

5. Lambda handler
   - [ ] 5.1. `mkdir -p infra/tutor` with TypeScript Lambda boilerplate.
   - [ ] 5.2. `infra/tutor/package.json` deps: `@aws-sdk/client-bedrock-runtime`, `voyageai`.
   - [ ] 5.3. Create `infra/tutor/retrieval.ts` with:
     - `loadCorpus()` — fetches the static `corpus.json` from the same Amplify domain at cold start; caches in module scope.
     - `embedQuestion(q)` — Voyage `voyage-3-large`.
     - `topK(qVec, sectionSlug, k=5)` — cosine similarity; **slice to chunks where `sectionSlug` ≤ current**; sort.
     - Return `{ score, chunk }[]`.
   - [ ] 5.4. Create `infra/tutor/handler.ts`:
     - Accepts POST `{ question, sectionSlug, history }`.
     - If `question.length > 2000` or `history.length > 10`, return 400.
     - Calls `topK`; if `results[0].score < 0.55`, returns SSE refusal:
       ```
       data: {"type":"token","value":"I don't see this in the curriculum yet. The closest section is "}
       data: {"type":"citation","chunkId":"...","anchor":"..."}
       data: {"type":"done"}
       ```
     - Otherwise builds a system prompt:
       ```
       You are a quantum computing tutor for this learner. Use ONLY the provided excerpts.
       Cite chunks by their {id}. If the answer is not in the excerpts, say so.

       Current section: {sectionSlug}
       Excerpts:
         [chunk1.id]: {chunk1.text}
         ...
       ```
     - Streams Claude Sonnet 4.6 via `BedrockRuntimeClient.send(new InvokeModelWithResponseStreamCommand({ modelId: "anthropic.claude-sonnet-4-6-v1:0", ... }))`.
     - Translates Bedrock chunks to SSE `{ type: "token", value }` events.
     - Post-processes the model output to detect citation tokens (`[chunk-id]` patterns) and emits matched `{ type: "citation", chunkId, anchor }` events.

6. CloudFormation
   - [ ] 6.1. Create `infra/cloudformation/tutor-stack.yaml` with:
     - `AWS::Lambda::Function` (Node 20, 1024MB, 60s timeout, x86_64).
     - IAM role allowing `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`, `logs:*`.
     - `AWS::ApiGatewayV2::Api` (HTTP API).
     - `AWS::ApiGatewayV2::Route` POST `/tutor`.
     - Throttle: 5 req/sec, burst 10.
     - CloudWatch log group with 14-day retention.
     - Output: the public API URL.
   - [ ] 6.2. Deploy: `aws cloudformation deploy --template-file infra/cloudformation/tutor-stack.yaml --stack-name quantum-tutor --capabilities CAPABILITY_IAM`.
   - [ ] 6.3. Capture the API URL.

7. Amplify env
   - [ ] 7.1. Add `NEXT_PUBLIC_TUTOR_URL` to Amplify console (per environment).
   - [ ] 7.2. Add `VOYAGE_API_KEY` as a **build-time-only** Amplify env (used in `prebuild`, not exposed to client).

8. TutorPanel component
   - [ ] 8.1. Create `web/src/components/tutor/tutor-panel.tsx` (`"use client"`).
   - [ ] 8.2. Anchor positioning:
     ```css
     /* in globals.css */
     .tutor-trigger { anchor-name: --tutor-anchor; }
     .tutor-panel {
       position: absolute;
       position-anchor: --tutor-anchor;
       inset-area: bottom right;
       margin-top: 0.5rem;
     }
     @supports not (anchor-name: --x) {
       .tutor-panel { position: fixed; bottom: 5rem; right: 1rem; }
     }
     ```
   - [ ] 8.3. Open/close with `Cmd-K` / `Ctrl-K` keyboard shortcut.
   - [ ] 8.4. Read current section via `usePathname()`.
   - [ ] 8.5. Transcript area + textarea input + send button.

9. Streaming hook
   - [ ] 9.1. Create `web/src/components/tutor/use-tutor-stream.ts`.
   - [ ] 9.2. POST `{ question, sectionSlug, history }` to `process.env.NEXT_PUBLIC_TUTOR_URL`.
   - [ ] 9.3. Parse SSE event-by-event; append `token` events to current assistant message, push `citation` events into the message's `citations` array.

10. Citation chips with view-transition highlight
    - [ ] 10.1. Create `web/src/components/tutor/citation-chip.tsx`.
    - [ ] 10.2. On click, find `#${anchor}` in the page, scroll into view, apply `view-transition-name: cited-paragraph`, call `document.startViewTransition(() => element.classList.add("just-cited"))` with a 1.5s removal timeout.
    - [ ] 10.3. CSS for `.just-cited`: outline + accent glow with fade.

11. Sidebar CTA
    - [ ] 11.1. Modify `web/src/components/sidebar.tsx` — below the section nav, add:
      ```tsx
      <button
        className="tutor-trigger mt-6 w-full ..."
        onClick={() => setTutorOpen(true)}
      >
        <span>Ask the tutor</span>
        <kbd className="...">⌘K</kbd>
      </button>
      ```
    - [ ] 11.2. Lift `tutorOpen` state into a tutor provider that wraps `<main>` in `layout.tsx`.

12. Client-side history
    - [ ] 12.1. Persist conversations per `sectionSlug` in `localStorage` keyed `tutor:<sectionSlug>:history`.
    - [ ] 12.2. "Clear chat" button in TutorPanel.
    - [ ] 12.3. Never send history to a server-side store.

13. Anchors on GUIDE paragraphs
    - [ ] 13.1. Extend `web/src/components/markdown-renderer.tsx` to auto-assign `id="${slugify(headingText)}-pN"` on `h2`/`h3` and `p` elements so citations can deep-link.
    - [ ] 13.2. Update `build-corpus.ts` to write the same anchors into `corpus.json`.

14. CI eval gate
    - [ ] 14.1. Extend `eval-corpus.ts` to include 50 Q&A pairs scored by a Claude judge (separate Lambda or local script with API key).
    - [ ] 14.2. CI runs eval on every PR that touches `GUIDE.md`, `notebooks/`, or `tutor/`; fails if accuracy drops below 80%.

15. Abuse defenses
    - [ ] 15.1. API Gateway throttle: 5 req/min/IP, 100 req/day/IP (usage plan + API key per IP via Lambda authorizer, or WAF rate-rule).
    - [ ] 15.2. Lambda input sanitization: strip control chars, reject `<system>` patterns in user input.
    - [ ] 15.3. Refusal path for off-curriculum questions wraps the low-similarity gate.

16. Deploy & smoke test
    - [ ] 16.1. Open PR; deploy to Amplify preview.
    - [ ] 16.2. Smoke test:
      - Ask "what's the Bloch sphere?" on `/learn/00-foundations` → streams answer + ≥ 1 citation.
      - Ask "explain VQE" on `/learn/00-foundations` → refusal pointing to later section.
      - Ask "what's the capital of France?" → polite curriculum-domain refusal.
      - Hammer 6 rapid requests → 429.
    - [ ] 16.3. Commit: `feat(web): curriculum-aware tutor with retrieval-grounded streaming chat`.

## File & Code Changes

| Action | File Path | Description |
|--------|-----------|-------------|
| Create | `web/scripts/build-corpus.ts` | Walks repo, chunks, embeds, writes `corpus.json` |
| Create | `web/scripts/eval-corpus.ts` | Retrieval + judge eval harness |
| Create | `web/src/components/tutor/tutor-panel.tsx` | Anchor-positioned streaming chat panel |
| Create | `web/src/components/tutor/use-tutor-stream.ts` | SSE client hook |
| Create | `web/src/components/tutor/citation-chip.tsx` | Click → scroll + view-transition highlight |
| Create | `web/src/components/tutor/tutor-provider.tsx` | Open/close state context |
| Create | `web/__tests__/tutor.test.tsx` | Component + hook tests |
| Create | `infra/tutor/handler.ts` | Lambda streaming handler |
| Create | `infra/tutor/retrieval.ts` | Embedding + cosine similarity |
| Create | `infra/tutor/package.json` | Lambda deps |
| Create | `infra/cloudformation/tutor-stack.yaml` | API GW + Lambda + IAM + throttle |
| Modify | `web/package.json` | Add `tsx`, `prebuild` script |
| Modify | `web/src/components/sidebar.tsx` | Add "Ask the tutor" CTA |
| Modify | `web/src/components/markdown-renderer.tsx` | Stable anchors on paragraphs |
| Modify | `web/src/app/layout.tsx` | Wrap with `<TutorProvider>` |
| Modify | `web/src/app/globals.css` | Anchor positioning + `.just-cited` highlight |
| Modify | `web/.gitignore` | Ignore `.corpus/`, `public/corpus.json` |
| Modify | `amplify.yml` | Add `VOYAGE_API_KEY` build env; `NEXT_PUBLIC_TUTOR_URL` runtime env |

## Testing & Validation

- **Retrieval:** 30-query top-3 hit rate ≥ 80% (`eval-corpus.ts`).
- **Quality:** 50 Q&A pairs scored by Claude judge ≥ 80% (CI gated).
- **Lambda integration:** POST a known question, assert SSE stream contains `token` + `citation` events; cold-start latency < 2s.
- **Component tests:** TutorPanel renders, `Cmd-K` opens/closes, citation click triggers `startViewTransition` (mocked).
- **Manual:**
  - Curriculum question on the right section → streams + cites.
  - Question about a later section → polite refusal pointing forward.
  - Off-domain question → polite refusal.
  - 6 rapid requests → 429 from API Gateway.
- **Security:** No `VOYAGE_API_KEY` or Bedrock creds in client bundle; `grep -r "voyage\|sk-ant" web/.next/` returns nothing.
- **Rollback:** unset `NEXT_PUBLIC_TUTOR_URL`; sidebar button hides; site functions normally.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tutor hallucinates wrong physics | High | Critical | Retrieval floor (similarity < 0.55 → refuse); require ≥ 1 citation; eval-corpus CI gate; thumbs-down feedback channel |
| Bedrock costs spiral | Medium | High | API GW throttle 5/min/IP, 100/day/IP; 2000-char input cap; off-domain refusal short-circuits before Bedrock call |
| Spoilers from later sections | Medium | Low | Hard slice retrieval to chunks at or before current `sectionSlug`; document in panel UI |
| API key leak | Low | Critical | `VOYAGE_API_KEY` is build-time only; Bedrock IAM scoped to Lambda role; nothing in `NEXT_PUBLIC_*` |
| Embedding drift across builds | Low | Medium | Pin Voyage model version in `corpus.json`; embeddings cached by content hash; bump `schemaVersion` on incompatible changes |
| Cold start delays first token | Medium | Low | Provisioned concurrency (1 unit) or SnapStart on Lambda; "thinking..." UI; warm-up cron every 5 min |
| Prompt injection via question text | Medium | Medium | Sanitize input; system prompt is closed-vocabulary; refuse to reveal system prompt |
| `corpus.json` exceeds Lambda /tmp size | Low | Medium | Stream-parse on cold start; or split corpus per section and load on-demand |

## Dependencies & Order of Operations

- Steps 1–4 (corpus + eval) are the critical path.
- Step 5 (Lambda) requires step 2 (corpus.json shape) finalized.
- Step 6 (CloudFormation) can parallelize with step 5.
- Steps 8–11 (UI) require step 7 (env URL).
- Step 13 (anchors) can happen any time after step 1; must precede step 14 (eval).
- Step 14 (CI eval) wraps everything.
- Plan 3 benefits from Plan 1 + 2 being complete: the corpus is richer (named sims, runnable notebook IDs) and the tutor can suggest "open this gate sequence in the browser kernel".

## Estimated Effort

- **Complexity:** Medium
- **Time estimate:** 8–12 working days for one engineer.
- **Files affected:** 11 created, 7 modified.
