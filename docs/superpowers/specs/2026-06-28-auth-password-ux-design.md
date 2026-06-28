# Auth Password UX Refinements — Design Spec

**Date:** 2026-06-28
**Status:** Approved (design), pending implementation plan
**Area:** `web/` (the `AuthForm` at `/login`, live on quantum.altivum.ai)
**Builds on:** `2026-06-27-workspace-auth-design.md` (the Cognito login, PR #76, live)

## Goal

Refine the live `AuthForm` password experience: a show/hide eyeball on every password
field; a live criteria checklist (red X → green check) reflecting the exact Cognito
password policy; a confirm-password field with a match indicator; and the same
treatment applied to the existing forgot-password reset step. Submit is gated on
validity where a new password is created.

## Why

The current form shows a static hint ("At least 8 characters, with upper, lower, and a
number.") and a single masked password field. Users can't see what they typed, get no
live feedback on which rules they've met, can't catch a typo'd password before submit,
and the forgot-password reset step has the same bare field. These refinements reduce
failed sign-ups (server-side `InvalidPasswordException` round-trips) and typo lockouts.

## Decisions (from brainstorming)

- **Eyeball (show/hide):** on every password field — sign-in password, sign-up password,
  sign-up confirm, reset new-password, reset confirm. Not on the 6-digit code fields.
- **Criteria checklist:** 4 rows — at least 8 characters, an uppercase letter, a
  lowercase letter, a number — each rendering a red X (unmet) or green check (met),
  updating live as the user types. Mirrors the Cognito policy in
  `infra/workspace/cognito.yaml` (MinimumLength 8, Require Lowercase/Uppercase/Numbers).
- **Confirm-password field + match row:** on sign-up and reset only. A "Passwords match"
  row shows red X until `confirm === password` (and confirm is non-empty).
- **Behavior by view:**

  | View | Eyeball | Checklist | Confirm field | Submit gating |
  |------|---------|-----------|---------------|---------------|
  | Sign-in | yes (password) | yes, **passive** | no | **not** gated (button only disabled while busy) |
  | Sign-up | yes (password + confirm) | yes | yes | disabled until all criteria met **and** passwords match |
  | Reset (new password) | yes (new + confirm) | yes | yes | disabled until all criteria met **and** passwords match |
  | Confirm-code / forgot-email | n/a (code/email) | — | — | unchanged |

- **Forgot-password (#5):** the existing `forgot` → `resetPassword` (email code) →
  `reset` → `confirmResetPassword` flow stays. Its `reset` step adopts the same
  `PasswordField` + checklist + confirm + gating. The "Forgot password?" link stays on
  the sign-in view. The reset email is verified end-to-end in the browser smoke (the
  still-pending manual gate from the auth foundation).
- **Color tokens:** add `--color-success` (green) and `--color-danger` (red), each with
  `-light`/`-dark` variants, to the `@theme inline` block in `globals.css`. The checklist
  uses them (met = success, unmet = danger). They are reusable by the future Workspace
  dashboard. (`--color-warm` stays the form's general error-text color; it is not
  repurposed for the checklist.)

## Architecture

Two focused presentational components plus one pure helper, composed by `AuthForm`.
Keeps `AuthForm` from growing and avoids duplicating the eyeball across five fields.

### File map

| File | Type | Responsibility |
|------|------|----------------|
| `web/src/lib/password-policy.ts` | module | Pure policy: `passwordCriteria()`, `allCriteriaMet()`, `PASSWORD_CRITERIA`. Single-sources the Cognito rule set. |
| `web/src/components/auth/password-field.tsx` | client | Labeled password input with an integrated show/hide eyeball toggle. |
| `web/src/components/auth/password-checklist.tsx` | client | The red→green criteria rows; optional "Passwords match" row. |
| `web/src/components/auth/auth-form.tsx` | modify | Compose the above; add `confirm` state; gate sign-up/reset submit; passive checklist on sign-in. |
| `web/src/app/globals.css` | modify | Add `--color-success*` and `--color-danger*` theme tokens. |

### `password-policy.ts` contract

```ts
export interface PasswordCriteria { length: boolean; upper: boolean; lower: boolean; number: boolean; }
export interface CriterionDef { key: keyof PasswordCriteria; label: string; test: (pw: string) => boolean; }

// Order = display order. Labels are the exact checklist copy.
export const PASSWORD_CRITERIA: CriterionDef[];   // length(>=8), upper, lower, number
export function passwordCriteria(pw: string): PasswordCriteria;
export function allCriteriaMet(pw: string): boolean;   // every criterion true
```

Labels: "At least 8 characters", "An uppercase letter", "A lowercase letter", "A number".
Tests: `pw.length >= 8`, `/[A-Z]/`, `/[a-z]/`, `/[0-9]/`. A comment cross-references the
CFN `PasswordPolicy` so the two stay in sync.

### `PasswordField` contract

```ts
function PasswordField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;        // e.g. "current-password" | "new-password"
  describedById?: string;       // optional aria-describedby (e.g. the checklist id)
}): JSX.Element;
```

- Renders the existing label + input markup, but the input `type` toggles between
  `"password"` and `"text"` via internal `visible` state.
- An eyeball `<button type="button">` is positioned at the inner-right of the field.
  `aria-label` is "Show password" when hidden, "Hide password" when visible; `aria-pressed={visible}`.
  Eye / eye-off inline SVGs (`aria-hidden`), matching the repo's inline-SVG convention.
- Input keeps the design-system field classes; right padding leaves room for the button.

### `PasswordChecklist` contract

```ts
function PasswordChecklist(props: {
  password: string;
  confirm?: string;   // when provided, appends a "Passwords match" row
  id?: string;        // so a field can aria-describedby it
}): JSX.Element;
```

- Renders one row per `PASSWORD_CRITERIA` item: an icon (green check if met, red X if
  unmet) + the label. When `confirm` is provided, appends a final row "Passwords match"
  whose met state is `confirm.length > 0 && confirm === password`.
- Each row is a list item with `aria-label="<label>: met" | ": not met"`; the icon is
  `aria-hidden`. State is conveyed by text/aria, **never color alone** (WCAG). A
  `data-met` attribute is present for tests.

### `AuthForm` changes

- Add `confirm` state (shared across sign-up and reset; views are mutually exclusive).
- **Checklist visibility:** render `PasswordChecklist` only once the relevant password
  field is non-empty — so an untouched form never shows a wall of red X's; the checklist
  appears on the first keystroke. (Applies to all three views.)
- **Confirm reset:** clear `confirm` to `""` on every `setView(...)` transition, so a
  confirm value never carries between the sign-up and reset views.
- **Sign-in:** password → `PasswordField` (`autoComplete="current-password"`); render
  `<PasswordChecklist password={password} />` as a passive hint; button gating unchanged
  (`disabled={busy}`); no confirm field.
- **Sign-up:** password + confirm → `PasswordField` (`autoComplete="new-password"`);
  render `<PasswordChecklist password={password} confirm={confirm} />`; replace the
  static hint text; button `disabled={busy || !allCriteriaMet(password) || password !== confirm}`.
- **Reset:** new-password + confirm → `PasswordField`; same checklist + gating as sign-up;
  keep the existing `code` field; button `disabled={busy || !allCriteriaMet(newPassword) || newPassword !== confirm}`.
- Clear `confirm` on view transitions where appropriate (so a stale confirm doesn't leak
  between sign-up and reset). Existing flows (signUp args, confirmSignUp, resetPassword,
  confirmResetPassword, Google, error mapping) are unchanged.

## Color tokens (`globals.css`, `@theme inline`)

```css
--color-success: oklch(0.72 0.15 150);
--color-success-light: oklch(0.82 0.13 150);
--color-success-dark: oklch(0.52 0.13 150);
--color-danger: oklch(0.62 0.20 25);
--color-danger-light: oklch(0.72 0.17 25);
--color-danger-dark: oklch(0.50 0.18 25);
```

Checklist usage: met → `text-success-dark dark:text-success-light`; unmet →
`text-danger-dark dark:text-danger-light` (final exact shades tuned for contrast during
build via the frontend-design pass; values above are the starting point).

## Testing (Jest)

- **`password-policy.test.ts`:** `passwordCriteria` per criterion (length boundary at 8,
  upper/lower/number presence/absence); `allCriteriaMet` true only when all four hold;
  `PASSWORD_CRITERIA` has the four expected keys/labels in order.
- **`password-field.test.tsx`:** renders a labeled password input (`type="password"` by
  default); clicking the toggle flips to `type="text"` and the button `aria-label` to
  "Hide password" (and back); typing calls `onChange`.
- **`password-checklist.test.tsx`:** four rows render; a met criterion row has
  `data-met="true"` (and a green-check, e.g. icon `aria-hidden` present) while an unmet
  one is `data-met="false"`; with `confirm` provided, a "Passwords match" row appears and
  flips `data-met` when `confirm === password`; row `aria-label` conveys "met"/"not met".
- **`auth-form.test.tsx` (update):**
  - Eyeball toggles the password field's visibility.
  - Sign-up: button is disabled until criteria pass **and** confirm matches; enabled when
    both hold; clicking then calls `signUp`. (Existing sign-up tests must fill the new
    confirm field with the matching value.)
  - Confirm mismatch keeps the sign-up button disabled and shows the unmet match row.
  - Sign-in: after typing into the password field the checklist renders, but the button is
    **not** gated by criteria (submitting with any non-empty password still calls `signIn`);
    no confirm field present.
  - Reset: new-password + confirm gating mirrors sign-up; "Set new password" disabled
    until valid. (Existing reset test fills the confirm field.)
  - Existing flow assertions (signUp/confirmSignUp/signIn/resetPassword/confirmResetPassword
    args, Google redirect, `?mode=signup`, `?error=google`, error mapping) still pass.
- **Real-path build:** `npm run build` static-exports `/login` cleanly; lint clean.
- **Browser smoke (manual, with the live env):** eyeball reveals text; checklist flips
  red→green as rules are met; sign-up button enables only when all green + match; reset
  step shows the same; and the forgot-password email round-trip completes (folds in the
  still-pending auth-foundation smoke).

## Accessibility & constraints

- Eyeball: real `<button>`, dynamic `aria-label` + `aria-pressed`; icon `aria-hidden`.
- Checklist: met/unmet conveyed by `aria-label` text, not color alone; icons `aria-hidden`.
- No emojis (inline SVG icons only). Contrast-guard test still passes (no `bg-accent` +
  `text-white`). New tokens chosen/tuned to meet AA on the form surfaces.
- Reduced motion: state changes are instant; no new animation required.
- Static-export safe: all client-side, no new env vars, no new runtime deps.

## Out of scope (YAGNI)

- A password strength/entropy meter (we show a fixed rules checklist).
- Changing the Cognito password policy.
- Show/hide toggles on the 6-digit confirmation/reset **code** fields.
- Any change to the email/Google/code flows themselves.

## Risks / notes

- **Policy drift:** `password-policy.ts` and the CFN `PasswordPolicy` must stay in sync;
  a cross-reference comment in each flags this (no runtime coupling is possible — the
  frontend can't read the pool's policy at build).
- **Existing test updates:** adding the confirm field + gating means the current sign-up
  and reset tests will fail until they fill the confirm field; the plan updates them in
  the same task as the gating change.
- **Token addition is global:** `--color-success`/`--color-danger` are new site-wide
  tokens; benign and reusable, but they touch `globals.css` `@theme`.
