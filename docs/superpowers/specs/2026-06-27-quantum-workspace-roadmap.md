# The Quantum Workspace — Sub-Project Roadmap

**Date:** 2026-06-27
**Status:** Agreed decomposition. Sub-project 1 in active brainstorming.

"The Quantum Workspace" is a free, Cognito-gated area where a learner's progress
(section completion + spaced-repetition review cards) is persisted server-side and
synced across devices, with a dedicated signed-in dashboard. It is too large for a
single spec, so it is decomposed into four sub-projects, each with its own
spec → plan → implementation cycle. Strict build order: **1 → 2 → 3 → 4.**

Today, learner progress is local-only: `web/src/lib/progress-store.ts`
(`qc:section:*`) and `web/src/lib/review-store.ts` (`qc:card:*`, `qc:card-content:*`)
persist to `localStorage` — single-device, lost on browser-clear. The site is a
static export (`output: "export"`), so all auth runs client-side. The only existing
server surface is the tutor Lambda (SAM/CFN, edge-protected, wired via `NEXT_PUBLIC_*`).

## 1. Auth foundation — the Cognito login piece *(active)*

Cognito User Pool + App Client as infra-as-code (SAM/CFN, mirroring `lambda/tutor`),
plus the full client-side auth flow on the static export: sign-up → email confirmation
→ sign-in → sign-out → password reset, browser token/session handling, and
authenticated UI state (the `WorkspaceCta` flips to a real sign-up, an account/sign-in
control appears, a gated `/workspace` shell renders the signed-in state). Ships and is
testable on its own with no backend data. Everything else depends on it.

## 2. Sync backend (data plane)

A per-user store for progress + review cards: DynamoDB keyed by the Cognito `sub`,
fronted by a JWT-authorized API (authorized by the tokens from #1), with the same
edge/cost discipline as the tutor. Pure backend; testable via signed requests.

## 3. Frontend sync + merge

Teach `progress-store.ts` / `review-store.ts` to read/write the cloud store when
signed in — first-login local↔cloud merge, conflict resolution, offline-first writes.
The moment localStorage stops being single-device and the CTA's cross-device promise
becomes true.

## 4. Workspace dashboard

The dedicated signed-in experience at `/workspace`: synced progress, due-card counts,
streaks, "continue where you left off," account settings. Polish on top of 1–3.
