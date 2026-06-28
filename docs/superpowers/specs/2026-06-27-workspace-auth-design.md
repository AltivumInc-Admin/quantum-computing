# Workspace Auth (Cognito Login) — Design Spec

**Date:** 2026-06-27
**Status:** Approved (design), pending implementation plan
**Area:** `web/` (Next.js 16 static-export learning site) + `infra/workspace/` (new)
**Sub-project:** #1 of the Quantum Workspace roadmap — see `2026-06-27-quantum-workspace-roadmap.md`

## Goal

Give the site a free, Cognito-backed account: learners can **sign up, confirm,
sign in, sign out, and reset their password** with email/password, or **sign in with
Google**. A signed-in identity surfaces in the app (a nav account control, a gated
`/workspace` placeholder, and a real "Sign up free" CTA). This is the foundation the
later sub-projects (sync backend, data merge, dashboard) build on; it ships and is
testable on its own with **no backend data store**.

## Why

"The Quantum Workspace" CTA on the glossary term pages promises a free account that
will "track your progress across devices." That requires (eventually) syncing the
currently local-only progress/review data, which in turn requires an identity. This
sub-project establishes that identity. Today there is no auth code; the CTA is gated
on an unset `NEXT_PUBLIC_SIGNUP_URL` and reads "Sign-up coming soon."

## Decisions (from brainstorming)

- **Sign-in methods:** email + password **and** Google.
- **Auth engine:** `aws-amplify` Auth (v6 modular client) powering **our own custom
  UI**. It is the only option that cleanly does both in-app SRP email/password flows
  and Google federation (`signInWithRedirect`), plus token storage + auto-refresh +
  `Hub` events, under `output: "export"`. (Hosted-UI-for-everything and raw
  `amazon-cognito-identity-js` + hand-rolled OAuth were both rejected.)
- **Hybrid flow:** email/password runs fully in-app (custom forms, no redirect);
  **Google** uses the Cognito hosted domain for the OAuth hop, triggered from a
  "Continue with Google" button and returning to an `/auth/callback` route.
- **Additive scope:** everything free today stays free and ungated (`/review`,
  progress, lessons keep working from `localStorage`, no login). Signing in only
  *adds* an account identity + a gated `/workspace` placeholder. Nothing existing
  moves behind the login wall.
- **Env-gated like the tutor:** with the Cognito config vars absent (today's build,
  or any contributor without AWS), the entire auth UI stays inert — no nav control,
  CTA stays "coming soon", `/login` and `/workspace` render a graceful "coming soon".
  The static site and CI are unaffected until the vars are set in Amplify.
- **Infra as code:** a CloudFormation/SAM template under `infra/workspace/`, mirroring
  `lambda/tutor` (least-privilege, cost-tagged, README-documented).

## Architecture

A new client-side `AuthProvider` (mirroring the existing `ThemeProvider`) configures
Amplify from `NEXT_PUBLIC_COGNITO_*` env vars and exposes a `useAuth()` hook. All
auth-related UI consults the same `isAuthConfigured()` gate so the feature is inert
when unconfigured.

### File map

| File | Type | Responsibility |
|------|------|----------------|
| `infra/workspace/cognito.yaml` | CFN | User Pool + public App Client (PKCE, no secret) + hosted domain + Google IdP; outputs pool/client/domain/region; cost-tagged. |
| `infra/workspace/README.md` | docs | Google prerequisite, deploy/teardown, Amplify env wiring, real-path smoke steps. Mirrors `lambda/tutor/README.md`. |
| `web/src/lib/auth-config.ts` | module | Reads `NEXT_PUBLIC_COGNITO_*`; exports `isAuthConfigured()` + the Amplify config object. Single source of the gate. |
| `web/src/components/auth/auth-provider.tsx` | client | Configures Amplify once; holds `{status, email}`; subscribes to `Hub`; exposes `useAuth()`. Wraps the app in `layout.tsx`. |
| `web/src/components/auth/account-menu.tsx` | client | Nav control: null when unconfigured; "Sign in" → `/login` when signed out; email/initial button + dropdown (Workspace, Sign out) when signed in. |
| `web/src/components/auth/auth-form.tsx` | client | The `/login` view-state machine: `signIn \| signUp \| confirm \| forgot \| reset` + "Continue with Google". |
| `web/src/lib/auth-errors.ts` | module | Maps Amplify/Cognito error names to friendly copy + a target view. |
| `web/src/app/login/page.tsx` | route | Hosts `AuthForm` (or "coming soon" when unconfigured); redirects to `/workspace` if already authenticated. |
| `web/src/app/auth/callback/page.tsx` | route | "Signing you in…"; lets Amplify finish the Google code exchange, then routes to `/workspace` (failure → `/login?error=google`). |
| `web/src/app/workspace/page.tsx` | route | Gated placeholder: signed-in → identity + sync-coming preview + sign out; signed-out → redirect `/login`; unconfigured → "coming soon". |
| `web/src/components/glossary/workspace-cta.tsx` | modify | Re-point: gate on `isAuthConfigured()`, link to `/login?mode=signup`; retire `NEXT_PUBLIC_SIGNUP_URL`. |
| `web/src/app/layout.tsx` | modify | Wrap children in `<AuthProvider>`. |
| `web/src/components/nav.tsx` | modify | Add `<AccountMenu />` to the right cluster (by `ThemeToggle`). |
| `package.json` | modify | add `aws-amplify`. |

### `useAuth()` contract

```ts
type AuthStatus = "unconfigured" | "configuring" | "authenticated" | "unauthenticated";
interface AuthContextValue {
  status: AuthStatus;
  email: string | null;        // null unless authenticated
  signOut: () => Promise<void>;
}
export function useAuth(): AuthContextValue;
```

`auth-config.ts`:

```ts
export function isAuthConfigured(): boolean; // all four config vars present (3 NEXT_PUBLIC_COGNITO_* + NEXT_PUBLIC_AWS_REGION)
export function amplifyAuthConfig(): object | null; // Amplify.configure() input, or null
```

## Auth flows

- **Sign-up:** `/login` "Create account" → `signUp({ username: email, password, options: { userAttributes: { email } } })` → Cognito emails a 6-digit code → "confirm" view → `confirmSignUp({ username, confirmationCode })` → auto `signIn` → `/workspace`. "Resend code" → `resendSignUpCode`.
- **Sign-in:** `signIn({ username: email, password })` → `/workspace`. Errors mapped: `UserNotConfirmedException` → switch to confirm view (+ resend); `NotAuthorizedException` → "Incorrect email or password".
- **Forgot password:** `resetPassword({ username: email })` → Cognito emails a code → reset view → `confirmResetPassword({ username, confirmationCode, newPassword })` → back to sign-in.
- **Google:** "Continue with Google" → `signInWithRedirect({ provider: "Google" })` → Cognito hosted domain → Google → `/auth/callback`. Amplify completes the code exchange on load; `Hub` `signInWithRedirect` success → `/workspace`, `signInWithRedirect_failure` → `/login?error=google`.
- **Sign-out:** `signOut()` → state clears → route to `/`.
- **Session hydration:** `AuthProvider` mounts in `configuring`; calls `getCurrentUser()` + `fetchUserAttributes()` → `authenticated` (with email) or `unauthenticated`; subscribes to `Hub` for live changes. When `!isAuthConfigured()`, status is fixed at `unconfigured` and Amplify is never configured.

## UI surfaces

- **Nav `AccountMenu`** — `unconfigured` → renders nothing (nav identical to today); `configuring`/`unauthenticated` → "Sign in" link → `/login`; `authenticated` → email/initial button → dropdown (Workspace → `/workspace`, Sign out). SSR-safe: renders neutral until mounted (like the theme toggle) to avoid hydration mismatch. Keyboard accessible; closes on Escape/outside-click.
- **`/login` (`AuthForm`)** — one page, view-state machine; "Continue with Google" + an "or" divider; labeled inputs, inline validation, `aria-live` error region, friendly server-error mapping. Already authenticated → redirect `/workspace`. `?mode=signup` opens the create-account view. Unconfigured → "Accounts are coming soon" panel (no form). Built to the design system via the frontend-design plugin (`surface-accent` button, `focus-ring`, dark mode, no emojis).
- **`/auth/callback`** — centered "Signing you in…" with a spinner; success → `/workspace`, failure → `/login?error=google`; unconfigured → redirect `/`.
- **`/workspace`** (placeholder this sub-project) — authenticated → "Your Workspace", "Signed in as {email}", an honest preview that progress/review will sync here in a later release, a *"N of 7 sections complete on this device — not yet synced"* teaser read from the existing `progress-store` (`completedCount`), and a Sign out button. Signed-out → client redirect `/login`. Unconfigured → "coming soon".
- **`WorkspaceCta`** — gate on `isAuthConfigured()`; configured → "Sign up free" → `/login?mode=signup`; else the current "coming soon". `NEXT_PUBLIC_SIGNUP_URL` is retired.

## Infrastructure (`infra/workspace/cognito.yaml`)

CloudFormation, region **us-east-2** (co-located with the tutor account). Cognito MAU
free tier covers expected volume.

- **`AWS::Cognito::UserPool`** — `UsernameAttributes: [email]`, `AutoVerifiedAttributes: [email]`, `Policies.PasswordPolicy` (MinimumLength 8, require upper/lower/number), `AccountRecoverySetting` = verified_email, `AdminCreateUserConfig.AllowAdminCreateUserOnly: false` (self sign-up), `EmailConfiguration: { EmailSendingAccount: COGNITO_DEFAULT }`, `DeletionProtection: ACTIVE`, schema `email` (required, mutable), `UserPoolTags: { Project: quantum, Feature: workspace-auth, CostCategory: auth }`.
- **`AWS::Cognito::UserPoolClient`** — `GenerateSecret: false`; `ExplicitAuthFlows: [ALLOW_USER_SRP_AUTH, ALLOW_REFRESH_TOKEN_AUTH]`; `PreventUserExistenceErrors: ENABLED`; `SupportedIdentityProviders: [COGNITO, Google]` (`DependsOn` the Google IdP); `AllowedOAuthFlows: [code]`; `AllowedOAuthScopes: [openid, email, profile]`; `AllowedOAuthFlowsUserPoolClient: true`; `CallbackURLs: [https://quantum.altivum.ai/auth/callback, http://localhost:3000/auth/callback]`; `LogoutURLs: [https://quantum.altivum.ai/, http://localhost:3000/]`; token validity access/id 60 min, refresh 30 days.
- **`AWS::Cognito::UserPoolDomain`** — `Domain: quantum-altivum` → `quantum-altivum.auth.us-east-2.amazoncognito.com`.
- **`AWS::Cognito::UserPoolIdentityProvider` (Google)** — `ProviderName: Google`, `ProviderType: Google`, `ProviderDetails: { client_id: !Ref GoogleClientId, client_secret: !Ref GoogleClientSecret, authorize_scopes: "openid email profile" }`, `AttributeMapping: { email: email }`.
- **Parameters** — `GoogleClientId`, `GoogleClientSecret` (`NoEcho: true`); `DomainPrefix` (default `quantum-altivum`).
- **Outputs** — `UserPoolId`, `UserPoolClientId`, `HostedDomain` (full host), `Region` (`!Ref AWS::Region`).

**Manual prerequisite (documented in the README):** create a Google OAuth 2.0 Web
client in Google Cloud Console with authorized redirect URI
`https://quantum-altivum.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`; pass its
id/secret to the stack. The domain prefix is chosen up front, so the redirect URI is
known before the stack exists.

## Environment variables (Amplify)

`NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `NEXT_PUBLIC_COGNITO_CLIENT_ID`,
`NEXT_PUBLIC_COGNITO_DOMAIN`, `NEXT_PUBLIC_AWS_REGION` — set in the Amplify app after
deploy, then redeploy. `NEXT_PUBLIC_SIGNUP_URL` is removed.

## Security & static-export constraints

- **Token storage:** localStorage (Amplify default) — the only viable store for a pure
  static SPA with no server to set httpOnly cookies. Named residual risk: XSS token
  theft. Mitigation: the site renders no user-generated content and sanitizes markdown,
  so the injection surface is small. Revisit if a server frontend is ever added.
- **Public client, no secret:** SRP for passwords, PKCE (`code` flow) for Google.
- **`PreventUserExistenceErrors: ENABLED`** — no account enumeration.
- **No secrets in the bundle:** the four `NEXT_PUBLIC_*` values are public client
  identifiers (pool id, client id, hosted domain, region). The Google **client secret**
  lives only in the Cognito IdP config (CFN `NoEcho` param), never in the web app.
- **No MFA / advanced security / custom WAF** in v1 — Cognito self-throttles its auth
  APIs and the hosted domain has AWS protections; noted as future options.

## Testing

- **Unit (Jest):** mock `aws-amplify/auth` (and `aws-amplify`) the way `react-markdown`
  is mocked. Cover:
  - `auth-config`: `isAuthConfigured()` true only when all four config vars present
    (3 `NEXT_PUBLIC_COGNITO_*` + `NEXT_PUBLIC_AWS_REGION`); config object shape when
    set, `null` when not.
  - `AuthProvider`: `configuring` → `authenticated`/`unauthenticated`; `Hub` events
    update state; `signOut` clears; fixed `unconfigured` when not configured (Amplify
    never configured).
  - `AccountMenu`: three states render correctly (null / "Sign in" / email + menu);
    menu opens/closes; Sign out calls through.
  - `AuthForm`: view transitions; per-view validation; calls the right Amplify fn per
    view; Google button calls `signInWithRedirect`; error mapping
    (`UserNotConfirmedException` → confirm view, `NotAuthorizedException` → friendly).
  - `/workspace`: authenticated renders identity; unauthenticated redirects to `/login`.
  - `/auth/callback`: routes to `/workspace` on `Hub` success, `/login?error=google` on
    failure.
  - `WorkspaceCta`: configured → link to `/login?mode=signup`; unconfigured → "coming
    soon".
- **Build (real-path, no AWS):** `npm run build` static-exports `/login`,
  `/auth/callback`, `/workspace`. With the env **unset**, assert the auth UI is inert —
  no account control in the nav, CTA reads "coming soon" — proving the live site is
  unaffected. Lint + types clean. CI stays green without AWS because Amplify is mocked
  in unit tests and the build runs with env unset.
- **Real path (the gate — "run the real thing"):** deploy `cognito.yaml`, set the four
  vars in `web/.env.local`, and exercise in a real browser:
  1. Sign up with a real email → receive the Cognito confirmation email → confirm →
     auto sign-in → land on `/workspace`.
  2. Sign out → sign in again.
  3. Forgot password → receive the reset email → reset → sign in.
  4. Google → consent → `/auth/callback` → `/workspace`.
  5. Error paths: wrong-password message; unconfirmed user routed to the confirm view.
  These steps live in `infra/workspace/README.md` with the Google prerequisite,
  deploy/teardown commands, and the Amplify env wiring.

## Out of scope (YAGNI)

- The sync backend, local↔cloud data merge, and full Workspace dashboard
  (sub-projects 2–4).
- MFA; Cognito advanced security; SES email (documented as the production upgrade);
  custom Cognito domain (the `amazoncognito.com` prefix domain is used); social IdPs
  beyond Google; profile editing; account deletion UI.

## Risks / notes

- **Email deliverability:** `COGNITO_DEFAULT` email has a low daily cap and a generic
  sender. Fine for initial/low volume; SES (verified domain, higher limits, branded
  sender) is the documented production upgrade and does not change app code.
- **Google prerequisite ordering:** the hosted-domain prefix is chosen up front so the
  Google redirect URI is known before deploy; the README spells out the order.
- **Hydration:** auth state is unknown on first paint; `AccountMenu` and gated pages
  render neutral/loading until the provider resolves, avoiding SSR/CSR mismatch under
  static export.
- **CTA gating change:** the CTA's gate moves from `NEXT_PUBLIC_SIGNUP_URL` to
  `isAuthConfigured()`, and its target from an external URL to the internal `/login`.
  The four Cognito vars must be set in Amplify for the CTA to go live.
