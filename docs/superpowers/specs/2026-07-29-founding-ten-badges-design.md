# Founding Ten badges — design

**Date:** 2026-07-29
**Status:** approved design, pending implementation plan

## Purpose

Issue two scarce, numbered credentials and make each one publicly verifiable:

- **Charter Member 01–10** — the first ten members, unpaid.
- **Founding Patron 01–10** — the first ten paying members.

Each issued badge binds to a specific person, has a public proof-of-record URL a
third party can check, and appears in the holder's own account.

First issuance: **Charter Member 01/10 — Irving Salinas.**

## Constraints discovered

These shaped the design and are recorded so the reasoning survives.

1. **The repo is public** (`AltivumInc-Admin/quantum-computing`). Nothing
   checked in may contain an email address or a Cognito `sub`.
2. **The site is a static export** (`output: "export"`). No server at request
   time; every page must prerender. `/glossary/[term]` is the existing precedent
   for a prerendered dynamic route.
3. **No paying members exist.** The wallet table is empty, Stripe has zero
   charges, and the storefront has been closed since 2026-07-26. The ten
   founding-patron serials are therefore unissuable today and ship as open slots.
4. **These are conferred, not earned.** `credentials.ts` opens with "Each medal
   is earned, not awarded" and derives every existing medal from synced
   progress. Founding Ten badges are awarded for *position in time*, so they are
   a separate class with their own copy — never presented as study achievements.

## Binding: what a badge attaches to

A badge belongs to a **person**, but a Cognito `sub` identifies an **account
record**. That mismatch breaks in two ways, both observed in this project:

- An account deleted and recreated gets a new `sub`.
- The same person arriving via native sign-in vs Google gets two different
  `sub`s. Already live: one address in the pool holds both a native and a
  Google account.

The stable identifier is the **email**, which survives both cases and is carried
in the ID token by both auth methods.

**Key:** `emailHash` = SHA-256 of the email, lowercased and trimmed, hex-encoded.

Normalization is exactly `email.trim().toLowerCase()`. Deliberately no
provider-specific rules (no Gmail dot-stripping or `+`-tag removal): those vary
by provider and would make the hash unpredictable to compute by hand.

### Accepted weakness, stated plainly

An email hash is **not** strong protection — emails are enumerable, so anyone can
hash a guess and test it against the registry. Since the holder is already named
publicly on the proof page, the marginal disclosure is "this named person uses
this address." Accepted knowingly, in exchange for a binding that does not
silently detach.

## Data model

Single source of truth: `web/src/data/founding-ten.json`.

```json
{
  "charter": [
    {
      "serial": 1,
      "holder": "Irving Salinas",
      "issuedAt": "2026-07-29",
      "emailHash": "<sha256 hex>"
    }
  ],
  "patron": []
}
```

- `serial` — integer 1–10, unique within its cohort.
- `holder` — display name, shown publicly. Requires the holder's consent.
- `issuedAt` — ISO date (`YYYY-MM-DD`).
- `emailHash` — hex SHA-256 as defined above.

No email, no `sub`, no other PII. A person may hold one badge per cohort, so an
`emailHash` may appear once in `charter` and once in `patron`.

## Surfaces

### `/founding-ten` — public roster

All twenty slots. Issued ones show cohort, serial, holder name, issue date, and
link to the proof page. Unissued ones render as open. Anyone can count what
remains, which makes the scarcity claim self-evidently honest.

### `/founding-ten/[badge]` — proof of record

Slug is `charter-01`, `patron-07`, etc. Prerendered with
`generateStaticParams` over the issued rows only — an unissued serial has no
page. Shows the badge artwork, "Charter Member 01/10", holder name, issue date,
and a one-line statement of what the credential certifies. Carries its own OG
and Twitter metadata so a shared link previews correctly.

### `/credentials` — the holder's account view

A **Founding Ten** group above the earned medals, visually distinct from them,
with copy that says conferred-by-position and never implies study. Shows the
artwork, serial, issue date, a link to the public proof URL, and a copy-link
action. Renders nothing at all for users who hold no badge.

**Matching:** the auth bridge already resolves the email claim asynchronously on
hydrate; it computes `emailHash` there via `crypto.subtle.digest` and exposes it
through `AuthProvider`. The view then does a synchronous lookup, so no component
needs new async plumbing or a `setState`-in-effect.

## Artwork

Source files arrive as `badges/charter-member-01.png` and
`badges/founding-patron-01.png` at the repo root. They are renamed on import to
match the registry's cohort keys:

| Source | Committed as |
| --- | --- |
| `charter-member-<NN>.png` | `web/public/badges/charter-<NN>.png` |
| `founding-patron-<NN>.png` | `web/public/badges/patron-<NN>.png` |

Each ships as the 1200×1200 PNG original (downloadable, ~1.8 MB) plus a
committed **600×600 WebP** for on-page display. Static export means `next/image`
does not optimize at build time, so derivatives are committed rather than
generated. 600 px covers the largest on-page render (the proof page) at 2× on the
account card.

The serial is baked into the artwork, so **only issued serials need a file**.
Today that is exactly one: Charter 01.

## Issuance runbook

One PR per badge:

1. Add `web/public/badges/<cohort>-<NN>.png` and its WebP derivative.
2. Compute the hash: `node scripts/badge-email-hash.mjs <email>`.
3. Add the registry row.

Git history is the issuance ledger — public, append-only, and timestamped, which
is a stronger provenance claim for a scarce credential than a mutable database
row.

## CI verification

A check that runs in the **CodeBuild standby** — currently the merge gate, since
GitHub Actions is billing-locked, and the only CI here holding AWS credentials.
It lists the user pool, hashes each user's email with the same normalization, and
fails the build if any issued badge matches no enabled user.

It must be skipped rather than failed when credentials are absent (a local
`npm test` run has none), so the registry-integrity tests stay runnable offline
while the live check remains a CI-only gate.

This is what makes detachment **loud**. A holder who deletes and recreates their
account keeps the badge automatically (same email); a holder who changes their
email address turns the build red instead of vanishing silently.

## Testing

- **Registry integrity** — serials unique and within 1–10 per cohort; `issuedAt`
  is a valid ISO date; artwork exists for every issued row; no PII-shaped fields
  (`email`, `sub`) present anywhere in the file.
- **Hash function** — known-vector test; normalization lowercases and trims;
  differing case or surrounding whitespace produce the same hash.
- **Proof page** — renders for an issued serial; no page exists for an unissued
  one.
- **Account view** — a session whose email hashes into the registry sees its
  badge; any other session sees nothing rendered.
- **Roster** — issued and open counts match the registry.

## Out of scope

- **Revocation.** A PR revert covers it. Note that git history retains a name
  even after removal, so publishing one is effectively permanent.
- **Self-serve claiming.** Twenty badges, issued by hand.
- **Founding-patron automation.** Those serials cannot be issued until paid
  membership exists; the roster shows them as open until then.

## Risks

- **A holder changes their email.** The badge detaches; CI catches it; repair is
  a one-line PR. Chosen over silent failure.
- **A public name is permanent.** Git history retains it. Confirm consent before
  issuing.
- **The duplicate-account problem is adjacent.** Cognito has no account linking,
  so one person can hold two accounts. Email-based binding means the badge
  follows the person across both, which sidesteps the issue for this feature
  without fixing the underlying gap.
