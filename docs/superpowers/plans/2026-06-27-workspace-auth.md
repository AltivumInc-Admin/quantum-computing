# Workspace Auth (Cognito Login) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free Cognito-backed account (email/password + Google) to the static-export learning site — sign-up, email confirm, sign-in, sign-out, password reset — with authenticated UI state (nav account control, gated `/workspace` placeholder, real CTA), all env-gated so the site/CI are unaffected until the Cognito vars are set.

**Architecture:** A client `AuthProvider` (mirroring `ThemeProvider`) configures `aws-amplify` Auth from `NEXT_PUBLIC_COGNITO_*` env vars and exposes a `useAuth()` hook. Email/password runs fully in-app via the Amplify SDK; Google uses Cognito's hosted domain for an OAuth hop returning to `/auth/callback`. Every auth surface consults one `isAuthConfigured()` gate and is inert when unset. A CloudFormation template under `infra/workspace/` provisions the User Pool + public app client + Google IdP.

**Tech Stack:** Next.js 16 (`output: "export"`), React 19, `aws-amplify` v6 (modular `aws-amplify/auth` + `aws-amplify/utils`), Tailwind v4, Jest + ts-jest + @testing-library/react, CloudFormation.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-27-workspace-auth-design.md`. Sub-project #1 of `2026-06-27-quantum-workspace-roadmap.md`.
- Branch: `feat/workspace-auth` (already created and checked out).
- **No emojis** anywhere in UI text (global project rule).
- **Additive only:** nothing free today (`/review`, progress, lessons) moves behind login.
- **Env-gated like the tutor:** with the four config vars absent, the entire auth UI is inert (no nav control; CTA "coming soon"; `/login` and `/workspace` show "coming soon"). The static site and CI must stay green with no AWS.
- **Four config vars:** `NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `NEXT_PUBLIC_COGNITO_CLIENT_ID`, `NEXT_PUBLIC_COGNITO_DOMAIN`, `NEXT_PUBLIC_AWS_REGION`. `isAuthConfigured()` is true only when all four are present.
- **No secrets in the web bundle:** the four `NEXT_PUBLIC_*` values are public client identifiers only. The Google client secret lives only in the Cognito IdP config (CFN `NoEcho` param).
- **Retire `NEXT_PUBLIC_SIGNUP_URL`:** the only repo references are `web/src/components/glossary/workspace-cta.tsx` and its test — both updated in Task 10.
- **Test conventions:** component tests start with `/** @jest-environment jsdom */` as the FIRST line, then `import "@testing-library/jest-dom";`. Modules that transitively import `aws-amplify*` MUST mock it (Jest must never load the real ESM package). `next/link` and `next/navigation` are mocked per existing patterns (`__tests__/components/nav.test.tsx`, `__tests__/components/ask-tutor.test.tsx`).
- **Design tokens** (reuse, do not invent): primary button `surface-accent rounded-control px-4 py-2 text-sm font-medium`; focus `focus-ring`; cards `rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 shadow-(--shadow-resting)`; muted text `text-gray-600 dark:text-gray-400`; display heading `font-display text-display-md tracking-tight text-gray-900 dark:text-white`.
- Run tests from `web/`. Single file: `npx jest <path>`. Full suite: `npm test`. Lint: `npm run lint`. Build: `npm run build`.

---

### Task 1: `auth-config.ts` — the env gate

**Files:**
- Create: `web/src/lib/auth-config.ts`
- Test: `web/__tests__/lib/auth-config.test.ts`

**Interfaces:**
- Consumes: nothing (reads `process.env` at call time, like `ask-tutor.tsx`).
- Produces:
  - `interface CognitoConfig { userPoolId: string; userPoolClientId: string; domain: string; region: string; }`
  - `function cognitoConfig(): CognitoConfig | null`
  - `function isAuthConfigured(): boolean`
  - `function amplifyAuthConfig(): Record<string, unknown> | null` — the object passed to `Amplify.configure()`, or `null` when unconfigured. Uses `window.location.origin` for redirect URLs.

- [ ] **Step 1: Write the failing test**

`web/__tests__/lib/auth-config.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import { cognitoConfig, isAuthConfigured, amplifyAuthConfig } from "@/lib/auth-config";

const VARS = {
  NEXT_PUBLIC_COGNITO_USER_POOL_ID: "us-east-2_abc123",
  NEXT_PUBLIC_COGNITO_CLIENT_ID: "client123",
  NEXT_PUBLIC_COGNITO_DOMAIN: "quantum-altivum.auth.us-east-2.amazoncognito.com",
  NEXT_PUBLIC_AWS_REGION: "us-east-2",
};

function setAll() {
  for (const [k, v] of Object.entries(VARS)) process.env[k] = v;
}
function clearAll() {
  for (const k of Object.keys(VARS)) delete process.env[k];
}

describe("auth-config", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it("isAuthConfigured is false when no vars are set", () => {
    expect(isAuthConfigured()).toBe(false);
    expect(cognitoConfig()).toBeNull();
    expect(amplifyAuthConfig()).toBeNull();
  });

  it("isAuthConfigured is false when any single var is missing", () => {
    setAll();
    delete process.env.NEXT_PUBLIC_AWS_REGION;
    expect(isAuthConfigured()).toBe(false);
    expect(cognitoConfig()).toBeNull();
  });

  it("cognitoConfig returns the four values when all are set", () => {
    setAll();
    expect(isAuthConfigured()).toBe(true);
    expect(cognitoConfig()).toEqual({
      userPoolId: "us-east-2_abc123",
      userPoolClientId: "client123",
      domain: "quantum-altivum.auth.us-east-2.amazoncognito.com",
      region: "us-east-2",
    });
  });

  it("amplifyAuthConfig builds an Amplify Auth.Cognito object with oauth + callback URLs", () => {
    setAll();
    const cfg = amplifyAuthConfig() as Record<string, any>;
    const cognito = cfg.Auth.Cognito;
    expect(cognito.userPoolId).toBe("us-east-2_abc123");
    expect(cognito.userPoolClientId).toBe("client123");
    expect(cognito.loginWith.oauth.domain).toBe(
      "quantum-altivum.auth.us-east-2.amazoncognito.com"
    );
    expect(cognito.loginWith.oauth.scopes).toEqual(["openid", "email", "profile"]);
    expect(cognito.loginWith.oauth.responseType).toBe("code");
    expect(cognito.loginWith.oauth.redirectSignIn[0]).toMatch(/\/auth\/callback$/);
    expect(cognito.loginWith.oauth.redirectSignOut[0]).toMatch(/\/$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/auth-config.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth-config'`.

- [ ] **Step 3: Write minimal implementation**

`web/src/lib/auth-config.ts`:

```ts
// Single source of the Cognito env gate. Reads process.env at CALL TIME (not at
// import time) so tests can set/clear vars per-case, exactly like ask-tutor.tsx.
// All four values are PUBLIC client identifiers — safe to inline as NEXT_PUBLIC_*.
// The feature stays fully inert until all four are present (mirrors the tutor's
// NEXT_PUBLIC_TUTOR_URL gate).

export interface CognitoConfig {
  userPoolId: string;
  userPoolClientId: string;
  /** Hosted-UI domain HOST (no scheme), used only for the Google OAuth hop. */
  domain: string;
  /** Collected for the gate + the future sync-backend API client; the userPoolId
   *  already encodes the region for Amplify Auth itself. */
  region: string;
}

export function cognitoConfig(): CognitoConfig | null {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const region = process.env.NEXT_PUBLIC_AWS_REGION;
  if (!userPoolId || !userPoolClientId || !domain || !region) return null;
  return { userPoolId, userPoolClientId, domain, region };
}

export function isAuthConfigured(): boolean {
  return cognitoConfig() !== null;
}

export function amplifyAuthConfig(): Record<string, unknown> | null {
  const c = cognitoConfig();
  if (!c) return null;
  // Absolute redirect URIs must match the Cognito app client's allowed callback /
  // logout URLs. Deriving from the live origin covers prod and localhost:3000.
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://quantum.altivum.ai";
  return {
    Auth: {
      Cognito: {
        userPoolId: c.userPoolId,
        userPoolClientId: c.userPoolClientId,
        loginWith: {
          oauth: {
            domain: c.domain,
            scopes: ["openid", "email", "profile"],
            redirectSignIn: [`${origin}/auth/callback`],
            redirectSignOut: [`${origin}/`],
            responseType: "code",
          },
        },
      },
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/auth-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/auth-config.ts web/__tests__/lib/auth-config.test.ts
git commit -m "feat(web): Cognito env gate (auth-config) for Workspace auth

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `AuthProvider` + `useAuth`

**Files:**
- Create: `web/src/components/auth/auth-provider.tsx`
- Test: `web/__tests__/components/auth/auth-provider.test.tsx`
- Modify: `web/package.json` (add `aws-amplify`)

**Interfaces:**
- Consumes: `isAuthConfigured`, `amplifyAuthConfig` from `@/lib/auth-config`; `Amplify` from `aws-amplify`; `Hub` from `aws-amplify/utils`; `getCurrentUser`, `fetchUserAttributes`, `signOut` from `aws-amplify/auth`.
- Produces:
  - `type AuthStatus = "unconfigured" | "configuring" | "authenticated" | "unauthenticated";`
  - `interface AuthContextValue { status: AuthStatus; email: string | null; signOut: () => Promise<void>; }`
  - `function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element`
  - `function useAuth(): AuthContextValue`

- [ ] **Step 1: Install the dependency**

Run (from `web/`): `npm install aws-amplify`
Expected: `aws-amplify` added to `package.json` dependencies; `package-lock.json` updated.

- [ ] **Step 2: Write the failing test**

`web/__tests__/components/auth/auth-provider.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";

const configure = jest.fn();
jest.mock("aws-amplify", () => ({ Amplify: { configure: (...a: unknown[]) => configure(...a) } }));

let hubCb: ((p: { payload: { event: string } }) => void) | null = null;
const hubUnsub = jest.fn();
jest.mock("aws-amplify/utils", () => ({
  Hub: {
    listen: (_channel: string, cb: (p: { payload: { event: string } }) => void) => {
      hubCb = cb;
      return hubUnsub;
    },
  },
}));

const getCurrentUser = jest.fn();
const fetchUserAttributes = jest.fn();
const amplifySignOut = jest.fn();
jest.mock("aws-amplify/auth", () => ({
  getCurrentUser: () => getCurrentUser(),
  fetchUserAttributes: () => fetchUserAttributes(),
  signOut: () => amplifySignOut(),
}));

let configured = true;
jest.mock("@/lib/auth-config", () => ({
  isAuthConfigured: () => configured,
  amplifyAuthConfig: () => ({ Auth: { Cognito: {} } }),
}));

import { AuthProvider, useAuth } from "@/components/auth/auth-provider";

function Probe() {
  const { status, email, signOut } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{email ?? ""}</span>
      <button onClick={() => void signOut()}>out</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    configured = true;
    hubCb = null;
    configure.mockClear();
    getCurrentUser.mockReset();
    fetchUserAttributes.mockReset();
    amplifySignOut.mockReset();
  });

  it("stays unconfigured and never configures Amplify when the gate is off", async () => {
    configured = false;
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    expect(screen.getByTestId("status")).toHaveTextContent("unconfigured");
    expect(configure).not.toHaveBeenCalled();
  });

  it("configures Amplify and resolves to authenticated with the user email", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchUserAttributes.mockResolvedValue({ email: "a@b.com" });
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    expect(configure).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("email")).toHaveTextContent("a@b.com");
  });

  it("resolves to unauthenticated when there is no current user", async () => {
    getCurrentUser.mockRejectedValue(new Error("no user"));
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
  });

  it("re-hydrates on a Hub signedIn event and clears on signedOut", async () => {
    getCurrentUser.mockRejectedValueOnce(new Error("no user")); // initial: unauthenticated
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");

    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchUserAttributes.mockResolvedValue({ email: "c@d.com" });
    await act(async () => {
      hubCb!({ payload: { event: "signedIn" } });
    });
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("email")).toHaveTextContent("c@d.com");

    await act(async () => {
      hubCb!({ payload: { event: "signedOut" } });
    });
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    expect(screen.getByTestId("email")).toHaveTextContent("");
  });

  it("signOut delegates to Amplify", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchUserAttributes.mockResolvedValue({ email: "a@b.com" });
    amplifySignOut.mockResolvedValue(undefined);
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await act(async () => {
      screen.getByText("out").click();
    });
    expect(amplifySignOut).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest __tests__/components/auth/auth-provider.test.tsx`
Expected: FAIL — `Cannot find module '@/components/auth/auth-provider'`.

- [ ] **Step 4: Write minimal implementation**

`web/src/components/auth/auth-provider.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Amplify } from "aws-amplify";
import { Hub } from "aws-amplify/utils";
import {
  getCurrentUser,
  fetchUserAttributes,
  signOut as amplifySignOut,
} from "aws-amplify/auth";
import { amplifyAuthConfig, isAuthConfigured } from "@/lib/auth-config";

export type AuthStatus =
  | "unconfigured"
  | "configuring"
  | "authenticated"
  | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  email: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: "unconfigured",
  email: null,
  signOut: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isAuthConfigured();
  const [status, setStatus] = useState<AuthStatus>(
    configured ? "configuring" : "unconfigured"
  );
  const [email, setEmail] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    try {
      await getCurrentUser();
      const attrs = await fetchUserAttributes();
      setEmail(attrs.email ?? null);
      setStatus("authenticated");
    } catch {
      setEmail(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const cfg = amplifyAuthConfig();
    if (cfg) Amplify.configure(cfg);
    void hydrate();
    // Token exchange after the Google redirect fires "signInWithRedirect"; an
    // in-app signIn fires "signedIn". Re-hydrate on both; clear on sign-out.
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "signInWithRedirect":
          void hydrate();
          break;
        case "signedOut":
          setEmail(null);
          setStatus("unauthenticated");
          break;
      }
    });
    return unsubscribe;
  }, [configured, hydrate]);

  const signOut = useCallback(async () => {
    await amplifySignOut();
  }, []);

  return (
    <AuthContext.Provider value={{ status, email, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/components/auth/auth-provider.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/auth/auth-provider.tsx web/__tests__/components/auth/auth-provider.test.tsx web/package.json web/package-lock.json
git commit -m "feat(web): AuthProvider + useAuth (aws-amplify v6) for Workspace auth

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `auth-errors.ts` — friendly error mapping

**Files:**
- Create: `web/src/lib/auth-errors.ts`
- Test: `web/__tests__/lib/auth-errors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type AuthView = "signIn" | "signUp" | "confirm" | "forgot" | "reset";`
  - `interface MappedError { message: string; view?: AuthView; }`
  - `function mapAuthError(err: unknown): MappedError`

- [ ] **Step 1: Write the failing test**

`web/__tests__/lib/auth-errors.test.ts`:

```ts
import { mapAuthError } from "@/lib/auth-errors";

describe("mapAuthError", () => {
  it("maps NotAuthorizedException to a generic credentials message", () => {
    expect(mapAuthError({ name: "NotAuthorizedException" })).toEqual({
      message: "Incorrect email or password.",
    });
  });

  it("maps UserNotConfirmedException to a confirm-view jump", () => {
    expect(mapAuthError({ name: "UserNotConfirmedException" })).toEqual({
      message: "Please confirm your email first — we just sent you a new code.",
      view: "confirm",
    });
  });

  it("maps UsernameExistsException", () => {
    expect(mapAuthError({ name: "UsernameExistsException" }).message).toMatch(
      /already exists/i
    );
  });

  it("maps CodeMismatchException and ExpiredCodeException", () => {
    expect(mapAuthError({ name: "CodeMismatchException" }).message).toMatch(/code/i);
    expect(mapAuthError({ name: "ExpiredCodeException" }).message).toMatch(/expired/i);
  });

  it("maps InvalidPasswordException and LimitExceededException", () => {
    expect(mapAuthError({ name: "InvalidPasswordException" }).message).toMatch(/password/i);
    expect(mapAuthError({ name: "LimitExceededException" }).message).toMatch(/too many/i);
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(mapAuthError({ name: "SomethingElse" })).toEqual({
      message: "Something went wrong. Please try again.",
    });
    expect(mapAuthError("not even an object")).toEqual({
      message: "Something went wrong. Please try again.",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/auth-errors.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth-errors'`.

- [ ] **Step 3: Write minimal implementation**

`web/src/lib/auth-errors.ts`:

```ts
// Maps Amplify/Cognito error names to friendly copy + an optional view to jump to.
// PreventUserExistenceErrors is ENABLED on the app client, so sign-in failures
// never reveal whether an account exists — hence the generic credentials message.

export type AuthView = "signIn" | "signUp" | "confirm" | "forgot" | "reset";

export interface MappedError {
  message: string;
  view?: AuthView;
}

function errorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    return String((err as { name: unknown }).name);
  }
  return "";
}

export function mapAuthError(err: unknown): MappedError {
  switch (errorName(err)) {
    case "NotAuthorizedException":
      return { message: "Incorrect email or password." };
    case "UserNotConfirmedException":
      return {
        message: "Please confirm your email first — we just sent you a new code.",
        view: "confirm",
      };
    case "UsernameExistsException":
      return { message: "An account with that email already exists." };
    case "CodeMismatchException":
      return { message: "That code doesn't match. Check it and try again." };
    case "ExpiredCodeException":
      return { message: "That code has expired. Request a new one." };
    case "InvalidPasswordException":
    case "InvalidParameterException":
      return {
        message: "Password must be at least 8 characters with upper, lower, and a number.",
      };
    case "LimitExceededException":
    case "TooManyRequestsException":
      return { message: "Too many attempts. Please wait a moment and try again." };
    default:
      return { message: "Something went wrong. Please try again." };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/auth-errors.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/auth-errors.ts web/__tests__/lib/auth-errors.test.ts
git commit -m "feat(web): friendly Cognito error mapping (auth-errors)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `AccountMenu` (nav account control)

**Files:**
- Create: `web/src/components/auth/account-menu.tsx`
- Test: `web/__tests__/components/auth/account-menu.test.tsx`

**Interfaces:**
- Consumes: `useAuth` from `@/components/auth/auth-provider`; `Link` from `next/link`.
- Produces: `function AccountMenu(): JSX.Element | null`.

**Behavior:** `unconfigured` → `null`; `configuring`/`unauthenticated` → "Sign in" link to `/login`; `authenticated` → a button labeled with the email that toggles a dropdown (Workspace link, Sign out button). Closes on Escape and outside-click. The initial render is deterministic for both `configuring` and `unconfigured`, so no separate mounted gate is needed (the provider starts in those states on both server and first client render).

- [ ] **Step 1: Write the failing test**

`web/__tests__/components/auth/account-menu.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

const signOut = jest.fn();
let mockAuth = {
  status: "unauthenticated" as
    | "unconfigured"
    | "configuring"
    | "authenticated"
    | "unauthenticated",
  email: null as string | null,
  signOut,
};
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

import { AccountMenu } from "@/components/auth/account-menu";

describe("AccountMenu", () => {
  beforeEach(() => {
    signOut.mockReset();
    mockAuth = { status: "unauthenticated", email: null, signOut };
  });

  it("renders nothing when unconfigured", () => {
    mockAuth.status = "unconfigured";
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a Sign in link when unauthenticated", () => {
    render(<AccountMenu />);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("renders the email and a menu with Workspace + Sign out when authenticated", () => {
    mockAuth = { status: "authenticated", email: "a@b.com", signOut };
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: /a@b\.com/i });
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole("link", { name: /workspace/i })).toHaveAttribute(
      "href",
      "/workspace"
    );
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("calls signOut from the menu", () => {
    mockAuth = { status: "authenticated", email: "a@b.com", signOut };
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("closes the menu on Escape", () => {
    mockAuth = { status: "authenticated", email: "a@b.com", signOut };
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/components/auth/account-menu.test.tsx`
Expected: FAIL — `Cannot find module '@/components/auth/account-menu'`.

- [ ] **Step 3: Write minimal implementation**

`web/src/components/auth/account-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";

export function AccountMenu() {
  const { status, email, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (status === "unconfigured") return null;

  if (status !== "authenticated") {
    return (
      <Link
        href="/login"
        className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-accent dark:hover:text-accent-light interactive focus-ring"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-accent dark:hover:text-accent-light interactive focus-ring"
      >
        <span className="truncate">{email}</span>
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 rounded-card border border-gray-200/70 dark:border-white/[0.08] bg-(--surface-1) p-1.5 shadow-(--shadow-resting)"
        >
          <Link
            href="/workspace"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-control px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 interactive focus-ring"
          >
            Workspace
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="block w-full rounded-control px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 interactive focus-ring"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/components/auth/account-menu.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/auth/account-menu.tsx web/__tests__/components/auth/account-menu.test.tsx
git commit -m "feat(web): AccountMenu nav control (three auth states)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `AuthForm` (the `/login` view-state machine)

**Files:**
- Create: `web/src/components/auth/auth-form.tsx`
- Test: `web/__tests__/components/auth/auth-form.test.tsx`

**Interfaces:**
- Consumes: `signUp`, `confirmSignUp`, `resendSignUpCode`, `signIn`, `signInWithRedirect`, `resetPassword`, `confirmResetPassword` from `aws-amplify/auth`; `useRouter`, `useSearchParams` from `next/navigation`; `mapAuthError`, `AuthView` from `@/lib/auth-errors`.
- Produces: `function AuthForm(): JSX.Element`.

**Behavior:** A single component holding `view: AuthView` (initial from `?mode=signup` → `signUp`, else `signIn`), `email`/`password`/`code`/`newPassword` fields, `error`, `busy`. On success the relevant action routes to `/workspace` (sign-in, confirm) or advances the view (sign-up → confirm, forgot → reset, reset → signIn). "Continue with Google" calls `signInWithRedirect({ provider: "Google" })`. Errors run through `mapAuthError`; a mapped `view` switches the view (and for the confirm jump, a fresh code is requested). An `aria-live="polite"` region announces errors. Uses `useSearchParams`, so the **page** (Task 6) wraps it in `<Suspense>`.

- [ ] **Step 1: Write the failing test**

`web/__tests__/components/auth/auth-form.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signUp = jest.fn();
const confirmSignUp = jest.fn();
const resendSignUpCode = jest.fn();
const signIn = jest.fn();
const signInWithRedirect = jest.fn();
const resetPassword = jest.fn();
const confirmResetPassword = jest.fn();
jest.mock("aws-amplify/auth", () => ({
  signUp: (...a: unknown[]) => signUp(...a),
  confirmSignUp: (...a: unknown[]) => confirmSignUp(...a),
  resendSignUpCode: (...a: unknown[]) => resendSignUpCode(...a),
  signIn: (...a: unknown[]) => signIn(...a),
  signInWithRedirect: (...a: unknown[]) => signInWithRedirect(...a),
  resetPassword: (...a: unknown[]) => resetPassword(...a),
  confirmResetPassword: (...a: unknown[]) => confirmResetPassword(...a),
}));

const replace = jest.fn();
let mockSearch = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

import { AuthForm } from "@/components/auth/auth-form";

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("AuthForm", () => {
  beforeEach(() => {
    [signUp, confirmSignUp, resendSignUpCode, signIn, signInWithRedirect, resetPassword, confirmResetPassword, replace].forEach(
      (m) => m.mockReset()
    );
    mockSearch = "";
  });

  it("defaults to the sign-in view", () => {
    render(<AuthForm />);
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("opens the create-account view when ?mode=signup", () => {
    mockSearch = "mode=signup";
    render(<AuthForm />);
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("signs in and routes to /workspace", async () => {
    signIn.mockResolvedValue({ isSignedIn: true });
    render(<AuthForm />);
    fill(/email/i, "a@b.com");
    fill(/password/i, "Password1");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith({ username: "a@b.com", password: "Password1" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/workspace"));
  });

  it("shows a friendly message on bad credentials", async () => {
    signIn.mockRejectedValue({ name: "NotAuthorizedException" });
    render(<AuthForm />);
    fill(/email/i, "a@b.com");
    fill(/password/i, "wrong");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect email or password/i);
  });

  it("jumps to the confirm view (and resends a code) for an unconfirmed user", async () => {
    signIn.mockRejectedValue({ name: "UserNotConfirmedException" });
    resendSignUpCode.mockResolvedValue({});
    render(<AuthForm />);
    fill(/email/i, "a@b.com");
    fill(/password/i, "Password1");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("button", { name: /confirm/i })).toBeInTheDocument();
    await waitFor(() => expect(resendSignUpCode).toHaveBeenCalledWith({ username: "a@b.com" }));
  });

  it("signs up and advances to the confirm view", async () => {
    mockSearch = "mode=signup";
    signUp.mockResolvedValue({ isSignUpComplete: false });
    render(<AuthForm />);
    fill(/email/i, "new@b.com");
    fill(/password/i, "Password1");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        username: "new@b.com",
        password: "Password1",
        options: { userAttributes: { email: "new@b.com" } },
      })
    );
    expect(await screen.findByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("confirms the code, auto signs in, and routes to /workspace", async () => {
    mockSearch = "mode=signup";
    signUp.mockResolvedValue({ isSignUpComplete: false });
    confirmSignUp.mockResolvedValue({ isSignUpComplete: true });
    signIn.mockResolvedValue({ isSignedIn: true });
    render(<AuthForm />);
    fill(/email/i, "new@b.com");
    fill(/password/i, "Password1");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    const codeInput = await screen.findByLabelText(/code/i);
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() =>
      expect(confirmSignUp).toHaveBeenCalledWith({ username: "new@b.com", confirmationCode: "123456" })
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/workspace"));
  });

  it("starts a Google sign-in via redirect", () => {
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(signInWithRedirect).toHaveBeenCalledWith({ provider: "Google" });
  });

  it("runs the forgot-password flow into the reset view", async () => {
    resetPassword.mockResolvedValue({});
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    fill(/email/i, "a@b.com");
    fireEvent.click(screen.getByRole("button", { name: /send reset code/i }));
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({ username: "a@b.com" }));
    expect(await screen.findByRole("button", { name: /set new password/i })).toBeInTheDocument();
  });

  it("surfaces the Google error from ?error=google", () => {
    mockSearch = "error=google";
    render(<AuthForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(/google sign-in/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/components/auth/auth-form.test.tsx`
Expected: FAIL — `Cannot find module '@/components/auth/auth-form'`.

- [ ] **Step 3: Write minimal implementation**

`web/src/components/auth/auth-form.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signInWithRedirect,
  resetPassword,
  confirmResetPassword,
} from "aws-amplify/auth";
import { mapAuthError, type AuthView } from "@/lib/auth-errors";

const primaryBtn =
  "w-full surface-accent inline-flex items-center justify-center rounded-control px-4 py-2.5 text-sm font-medium interactive focus-ring disabled:opacity-60";
const linkBtn =
  "text-sm text-accent dark:text-accent-light hover:underline focus-ring rounded";

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<AuthView>(
    params.get("mode") === "signup" ? "signUp" : "signIn"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "google" ? "Google sign-in didn't complete. Please try again." : null
  );
  const [busy, setBusy] = useState(false);

  const handle = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      const m = mapAuthError(err);
      setError(m.message);
      if (m.view) {
        setView(m.view);
        if (m.view === "confirm") {
          try {
            await resendSignUpCode({ username: email });
          } catch {
            /* best effort — the message already tells them to check email */
          }
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const doSignIn = handle(async () => {
    await signIn({ username: email, password });
    router.replace("/workspace");
  });
  const doSignUp = handle(async () => {
    await signUp({ username: email, password, options: { userAttributes: { email } } });
    setView("confirm");
  });
  const doConfirm = handle(async () => {
    await confirmSignUp({ username: email, confirmationCode: code });
    await signIn({ username: email, password });
    router.replace("/workspace");
  });
  const doForgot = handle(async () => {
    await resetPassword({ username: email });
    setView("reset");
  });
  const doReset = handle(async () => {
    await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
    setView("signIn");
  });
  const doGoogle = () => {
    void signInWithRedirect({ provider: "Google" });
  };
  const resend = () => {
    void resendSignUpCode({ username: email });
  };

  const title: Record<AuthView, string> = {
    signIn: "Sign in",
    signUp: "Create your account",
    confirm: "Confirm your email",
    forgot: "Reset your password",
    reset: "Set a new password",
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
        {title[view]}
      </h1>

      {error && (
        <p role="alert" aria-live="polite" className="mt-4 text-sm text-warm-dark dark:text-warm-light">
          {error}
        </p>
      )}

      {view === "signIn" && (
        <form onSubmit={doSignIn} className="mt-6 space-y-4">
          <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
          <Field id="password" label="Password" type="password" value={password} onChange={setPassword} />
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="flex items-center justify-between">
            <button type="button" className={linkBtn} onClick={() => setView("forgot")}>
              Forgot password?
            </button>
            <button type="button" className={linkBtn} onClick={() => setView("signUp")}>
              Create account
            </button>
          </div>
          <GoogleBlock onClick={doGoogle} />
        </form>
      )}

      {view === "signUp" && (
        <form onSubmit={doSignUp} className="mt-6 space-y-4">
          <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
          <Field id="password" label="Password" type="password" value={password} onChange={setPassword} />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            At least 8 characters, with upper, lower, and a number.
          </p>
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Creating…" : "Create account"}
          </button>
          <div className="text-center">
            <button type="button" className={linkBtn} onClick={() => setView("signIn")}>
              Already have an account? Sign in
            </button>
          </div>
          <GoogleBlock onClick={doGoogle} />
        </form>
      )}

      {view === "confirm" && (
        <form onSubmit={doConfirm} className="mt-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Enter the 6-digit code we emailed to {email || "your address"}.
          </p>
          <Field id="code" label="Confirmation code" type="text" value={code} onChange={setCode} />
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Confirming…" : "Confirm"}
          </button>
          <div className="text-center">
            <button type="button" className={linkBtn} onClick={resend}>
              Resend code
            </button>
          </div>
        </form>
      )}

      {view === "forgot" && (
        <form onSubmit={doForgot} className="mt-6 space-y-4">
          <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Sending…" : "Send reset code"}
          </button>
          <div className="text-center">
            <button type="button" className={linkBtn} onClick={() => setView("signIn")}>
              Back to sign in
            </button>
          </div>
        </form>
      )}

      {view === "reset" && (
        <form onSubmit={doReset} className="mt-6 space-y-4">
          <Field id="code" label="Reset code" type="text" value={code} onChange={setCode} />
          <Field
            id="newPassword"
            label="New password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
          />
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 focus-ring"
      />
    </div>
  );
}

function GoogleBlock({ onClick }: { onClick: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700/60" />
        <span className="text-xs text-gray-400">or</span>
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700/60" />
      </div>
      <button
        type="button"
        onClick={onClick}
        className="w-full inline-flex items-center justify-center gap-2 rounded-control border border-gray-200 dark:border-gray-700/50 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 interactive focus-ring"
      >
        Continue with Google
      </button>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/components/auth/auth-form.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 5: Lint the new file**

Run: `npm run lint`
Expected: no errors (in particular, no `no-unused-vars`).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/auth/auth-form.tsx web/__tests__/components/auth/auth-form.test.tsx
git commit -m "feat(web): AuthForm view-state machine (sign-in/up/confirm/forgot/reset + Google)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `/login` route

**Files:**
- Create: `web/src/app/login/page.tsx`
- Test: `web/__tests__/app/login-page.test.tsx`

**Interfaces:**
- Consumes: `AuthForm` from `@/components/auth/auth-form`; `useAuth` from `@/components/auth/auth-provider`; `isAuthConfigured` from `@/lib/auth-config`; `useRouter` from `next/navigation`; React `Suspense`.
- Produces: default-exported `LoginPage` client component.

**Behavior:** unconfigured → "Accounts are coming soon" panel; authenticated → redirect to `/workspace`; otherwise render `<Suspense><AuthForm/></Suspense>` (Suspense is required because `AuthForm` reads `useSearchParams` under static export).

- [ ] **Step 1: Write the failing test**

`web/__tests__/app/login-page.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("@/components/auth/auth-form", () => ({
  AuthForm: () => {
    const React = require("react");
    return React.createElement("div", { "data-testid": "auth-form" }, "form");
  },
}));

let configured = true;
jest.mock("@/lib/auth-config", () => ({ isAuthConfigured: () => configured }));

let mockAuth = { status: "unauthenticated" as string };
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

import LoginPage from "@/app/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    configured = true;
    mockAuth = { status: "unauthenticated" };
    replace.mockReset();
  });

  it("shows a coming-soon panel when auth is unconfigured", () => {
    configured = false;
    render(<LoginPage />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByTestId("auth-form")).toBeNull();
  });

  it("renders the auth form when unauthenticated", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("auth-form")).toBeInTheDocument();
  });

  it("redirects to /workspace when already authenticated", () => {
    mockAuth = { status: "authenticated" };
    render(<LoginPage />);
    expect(replace).toHaveBeenCalledWith("/workspace");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/app/login-page.test.tsx`
Expected: FAIL — `Cannot find module '@/app/login/page'`.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/login/page.tsx`:

```tsx
"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { useAuth } from "@/components/auth/auth-provider";
import { isAuthConfigured } from "@/lib/auth-config";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") router.replace("/workspace");
  }, [status, router]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
      {!isAuthConfigured() ? (
        <div className="w-full max-w-sm rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 text-center shadow-(--shadow-resting)">
          <p className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
            The Quantum Workspace
          </p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Free accounts are coming soon.
          </p>
        </div>
      ) : (
        <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
          <AuthForm />
        </Suspense>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/app/login-page.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/login/page.tsx web/__tests__/app/login-page.test.tsx
git commit -m "feat(web): /login route (AuthForm + coming-soon gate + authed redirect)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `/auth/callback` route

**Files:**
- Create: `web/src/app/auth/callback/page.tsx`
- Test: `web/__tests__/app/auth-callback-page.test.tsx`

**Interfaces:**
- Consumes: `useAuth` from `@/components/auth/auth-provider`; `Hub` from `aws-amplify/utils`; `useRouter` from `next/navigation`.
- Produces: default-exported `CallbackPage` client component.

**Behavior:** `unconfigured` → redirect `/`; `authenticated` → redirect `/workspace`; a Hub `signInWithRedirect_failure` → redirect `/login?error=google`; while `configuring`/`unauthenticated` (pre-exchange) → show "Signing you in…". Routing reacts to `status` so that when the provider hydrates after the OAuth exchange (`status` → `authenticated`), the effect re-runs and navigates.

- [ ] **Step 1: Write the failing test**

`web/__tests__/app/auth-callback-page.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

let hubCb: ((p: { payload: { event: string } }) => void) | null = null;
const hubUnsub = jest.fn();
jest.mock("aws-amplify/utils", () => ({
  Hub: {
    listen: (_c: string, cb: (p: { payload: { event: string } }) => void) => {
      hubCb = cb;
      return hubUnsub;
    },
  },
}));

let mockAuth = { status: "configuring" as string };
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

import CallbackPage from "@/app/auth/callback/page";

describe("CallbackPage", () => {
  beforeEach(() => {
    mockAuth = { status: "configuring" };
    replace.mockReset();
    hubCb = null;
  });

  it("shows a signing-in message while configuring", () => {
    render(<CallbackPage />);
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("routes to /workspace once authenticated", () => {
    mockAuth = { status: "authenticated" };
    render(<CallbackPage />);
    expect(replace).toHaveBeenCalledWith("/workspace");
  });

  it("routes home when unconfigured", () => {
    mockAuth = { status: "unconfigured" };
    render(<CallbackPage />);
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("routes to /login?error=google on a redirect failure event", () => {
    render(<CallbackPage />);
    hubCb!({ payload: { event: "signInWithRedirect_failure" } });
    expect(replace).toHaveBeenCalledWith("/login?error=google");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/app/auth-callback-page.test.tsx`
Expected: FAIL — `Cannot find module '@/app/auth/callback/page'`.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/auth/callback/page.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Hub } from "aws-amplify/utils";
import { useAuth } from "@/components/auth/auth-provider";

export default function CallbackPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unconfigured") {
      router.replace("/");
      return;
    }
    if (status === "authenticated") {
      router.replace("/workspace");
      return;
    }
    // Still waiting on the token exchange. Success arrives as a provider state
    // change (status -> authenticated, re-running this effect). The only thing
    // we must catch ourselves is an explicit failure.
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect_failure") {
        router.replace("/login?error=google");
      }
    });
    return unsubscribe;
  }, [status, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">Signing you in…</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/app/auth-callback-page.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/auth/callback/page.tsx web/__tests__/app/auth-callback-page.test.tsx
git commit -m "feat(web): /auth/callback route (Google redirect return)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `/workspace` route (placeholder)

**Files:**
- Create: `web/src/app/workspace/page.tsx`
- Test: `web/__tests__/app/workspace-page.test.tsx`

**Interfaces:**
- Consumes: `useAuth` from `@/components/auth/auth-provider`; `useRouter` from `next/navigation`; `getSections` from `@/lib/sections`; `completedCount` from `@/lib/progress-store`.
- Produces: default-exported `WorkspacePage` client component.

**Behavior:** `unconfigured` → coming-soon panel; `unauthenticated` → redirect `/login`; `configuring` → "Loading…"; `authenticated` → "Your Workspace", "Signed in as {email}", a *"N of M sections complete on this device — not yet synced"* teaser (from `completedCount(getSections().map(s => s.slug))`), a note that sync is coming, and a Sign out button (calls `signOut()` then routes to `/`).

- [ ] **Step 1: Write the failing test**

`web/__tests__/app/workspace-page.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getSections } from "@/lib/sections";

const signOut = jest.fn();
let mockAuth = {
  status: "authenticated" as string,
  email: "a@b.com" as string | null,
  signOut,
};
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

import WorkspacePage from "@/app/workspace/page";

describe("WorkspacePage", () => {
  beforeEach(() => {
    signOut.mockReset();
    replace.mockReset();
    mockAuth = { status: "authenticated", email: "a@b.com", signOut };
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("shows the signed-in identity and the local-progress teaser", () => {
    render(<WorkspacePage />);
    expect(screen.getByText(/signed in as/i)).toHaveTextContent("a@b.com");
    const total = getSections().length;
    expect(screen.getByText(new RegExp(`of ${total} sections`, "i"))).toBeInTheDocument();
    expect(screen.getByText(/not yet synced/i)).toBeInTheDocument();
  });

  it("redirects to /login when unauthenticated", () => {
    mockAuth = { status: "unauthenticated", email: null, signOut };
    render(<WorkspacePage />);
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("shows a coming-soon panel when unconfigured", () => {
    mockAuth = { status: "unconfigured", email: null, signOut };
    render(<WorkspacePage />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("signs out and routes home", async () => {
    signOut.mockResolvedValue(undefined);
    render(<WorkspacePage />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/app/workspace-page.test.tsx`
Expected: FAIL — `Cannot find module '@/app/workspace/page'`.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/workspace/page.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getSections } from "@/lib/sections";
import { completedCount } from "@/lib/progress-store";

export default function WorkspacePage() {
  const router = useRouter();
  const { status, email, signOut } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "unconfigured") {
    return (
      <Shell>
        <p className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
          The Quantum Workspace
        </p>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Free accounts are coming soon.
        </p>
      </Shell>
    );
  }

  if (status !== "authenticated") {
    return (
      <Shell>
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      </Shell>
    );
  }

  const sections = getSections();
  const done = completedCount(sections.map((s) => s.slug));

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  return (
    <Shell>
      <h1 className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
        Your Workspace
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Signed in as <span className="font-medium text-gray-900 dark:text-white">{email}</span>
      </p>

      <div className="mt-6 rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 shadow-(--shadow-resting)">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {done} of {sections.length} sections complete on this device — not yet synced.
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Your progress and review cards will sync to your account in a coming release,
          so they follow you across devices.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="mt-6 inline-flex items-center rounded-control border border-gray-200 dark:border-gray-700/50 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 interactive focus-ring"
      >
        Sign out
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">{children}</div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/app/workspace-page.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/workspace/page.tsx web/__tests__/app/workspace-page.test.tsx
git commit -m "feat(web): /workspace placeholder (identity + local-progress teaser + sign out)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Wire-up — mount `AuthProvider` and add `AccountMenu` to the nav

**Files:**
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/components/nav.tsx`
- Modify: `web/__tests__/components/nav.test.tsx` (mock `AccountMenu` so the nav suite stays isolated from `aws-amplify`)

**Interfaces:**
- Consumes: `AuthProvider` from `@/components/auth/auth-provider`; `AccountMenu` from `@/components/auth/account-menu`.
- Produces: nothing new.

- [ ] **Step 1: Update the nav test to mock AccountMenu (write the failing expectation)**

Add these to `web/__tests__/components/nav.test.tsx` — the `AccountMenu` mock (so rendering `Nav` does not pull in `aws-amplify`), and an assertion that the nav renders it:

```tsx
jest.mock("@/components/auth/account-menu", () => ({
  AccountMenu: () => {
    const React = require("react");
    return React.createElement("div", { "data-testid": "account-menu" }, "account-menu");
  },
}));
```

And a new test inside `describe("Nav", ...)`:

```tsx
it("should render the AccountMenu", () => {
  render(<Nav />);
  expect(screen.getByTestId("account-menu")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the nav test to verify the new case fails**

Run: `npx jest __tests__/components/nav.test.tsx`
Expected: FAIL — `Unable to find ... account-menu` (the nav does not render it yet).

- [ ] **Step 3: Add `AccountMenu` to the nav**

In `web/src/components/nav.tsx`, import it and place it in the right-hand cluster:

```tsx
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { ReviewNavBadge } from "./review-nav-badge";
import { AccountMenu } from "./auth/account-menu";
```

Change the right cluster from:

```tsx
        <div className="flex items-center gap-1.5">
          <ReviewNavBadge />
          <ThemeToggle />
        </div>
```

to:

```tsx
        <div className="flex items-center gap-1.5">
          <ReviewNavBadge />
          <AccountMenu />
          <ThemeToggle />
        </div>
```

- [ ] **Step 4: Mount `AuthProvider` in the layout**

In `web/src/app/layout.tsx`, import the provider and wrap the app body. Add the import:

```tsx
import { AuthProvider } from "@/components/auth/auth-provider";
```

Wrap the existing children of `ThemeProvider` so the tree becomes:

```tsx
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AuthProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-control focus:bg-accent-dark focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus-ring"
            >
              Skip to content
            </a>
            <Nav />
            <main id="main" tabIndex={-1} className="outline-none">
              {children}
            </main>
            <Footer />
            <AskTutor />
          </AuthProvider>
        </ThemeProvider>
```

- [ ] **Step 5: Run the nav test + full suite**

Run: `npx jest __tests__/components/nav.test.tsx`
Expected: PASS (5 tests).

Run: `npm test`
Expected: all suites PASS (existing + new auth suites).

- [ ] **Step 6: Commit**

```bash
git add web/src/app/layout.tsx web/src/components/nav.tsx web/__tests__/components/nav.test.tsx
git commit -m "feat(web): mount AuthProvider + AccountMenu in the app shell

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Re-point the Workspace CTA to `/login` and retire `NEXT_PUBLIC_SIGNUP_URL`

**Files:**
- Modify: `web/src/components/glossary/workspace-cta.tsx`
- Modify: `web/__tests__/components/glossary/workspace-cta.test.tsx`

**Interfaces:**
- Consumes: `isAuthConfigured` from `@/lib/auth-config`; `Link` from `next/link`.
- Produces: nothing new.

**Behavior:** gate on `isAuthConfigured()` (not the retired `NEXT_PUBLIC_SIGNUP_URL`); configured → "Sign up free" link to `/login?mode=signup`; unconfigured → "Sign-up coming soon".

- [ ] **Step 1: Rewrite the test (write the new failing expectations)**

Replace `web/__tests__/components/glossary/workspace-cta.test.tsx` with:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

let configured = false;
jest.mock("@/lib/auth-config", () => ({ isAuthConfigured: () => configured }));

import { WorkspaceCta } from "@/components/glossary/workspace-cta";

describe("WorkspaceCta", () => {
  beforeEach(() => {
    configured = false;
  });

  it("shows a coming-soon teaser when auth is unconfigured", () => {
    render(<WorkspaceCta />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up/i })).toBeNull();
  });

  it("links to /login?mode=signup when auth is configured", () => {
    configured = true;
    render(<WorkspaceCta />);
    expect(screen.getByRole("link", { name: /sign up/i })).toHaveAttribute(
      "href",
      "/login?mode=signup"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/components/glossary/workspace-cta.test.tsx`
Expected: FAIL — the component still reads `NEXT_PUBLIC_SIGNUP_URL` and uses a plain `<a>` to an external URL.

- [ ] **Step 3: Rewrite the component**

Replace `web/src/components/glossary/workspace-cta.tsx` with:

```tsx
import Link from "next/link";
import { isAuthConfigured } from "@/lib/auth-config";

// Env-gated sign-up CTA, mirroring the tutor's gate: a live link to the in-app
// /login (create-account) when Cognito is configured, a "coming soon" teaser
// otherwise. Gated on isAuthConfigured() — the four NEXT_PUBLIC_COGNITO_* / region
// vars set in Amplify — which replaced the old NEXT_PUBLIC_SIGNUP_URL.
export function WorkspaceCta() {
  const configured = isAuthConfigured();
  return (
    <aside className="mt-12 rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 shadow-(--shadow-resting)">
      <p className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
        The Quantum Workspace
      </p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Track your progress and go deeper across the whole curriculum. Free account.
      </p>
      <div className="mt-4">
        {configured ? (
          <Link
            href="/login?mode=signup"
            className="surface-accent inline-flex items-center rounded-control px-4 py-2 text-sm font-medium"
          >
            Sign up free
          </Link>
        ) : (
          <span className="inline-flex items-center rounded-control border border-gray-200 dark:border-white/10 px-4 py-2 text-sm font-medium text-gray-400 dark:text-gray-500">
            Sign-up coming soon
          </span>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/components/glossary/workspace-cta.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Confirm `NEXT_PUBLIC_SIGNUP_URL` is fully retired**

Run: `grep -rn "NEXT_PUBLIC_SIGNUP_URL" web --include="*.ts" --include="*.tsx"`
Expected: no matches.

- [ ] **Step 6: Run the glossary suites that render the CTA (regression check)**

`TermDetail` renders `WorkspaceCta`. With Cognito env unset, `isAuthConfigured()` is
false, so the CTA renders the inert "coming soon" span (no `next/link` rendered).

Run: `npx jest __tests__/components/glossary/term-detail.test.tsx __tests__/app/glossary-term-page.test.tsx`
Expected: PASS. If either test asserted the old `NEXT_PUBLIC_SIGNUP_URL`/link behavior, update only those assertions to the new "coming soon" copy (do not weaken unrelated assertions).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/glossary/workspace-cta.tsx web/__tests__/components/glossary/workspace-cta.test.tsx
git commit -m "feat(web): point Workspace CTA at /login, gate on isAuthConfigured (retire NEXT_PUBLIC_SIGNUP_URL)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Cognito infrastructure (`infra/workspace/`)

**Files:**
- Create: `infra/workspace/cognito.yaml`
- Create: `infra/workspace/README.md`

**Interfaces:** none (infra + docs; consumed operationally, not by code).

This task has no Jest test. Its gate is template validity + a complete, accurate README. CI has no AWS, so the live exercise is the manual release gate (below).

- [ ] **Step 1: Write the CloudFormation template**

`infra/workspace/cognito.yaml`:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: >
  The Quantum Workspace — Cognito user pool + public SPA app client + hosted
  domain + Google identity provider. Backs the free account on quantum.altivum.ai
  (sub-project #1). No app secrets reach the web bundle; the Google client secret
  lives only here (NoEcho).

Parameters:
  GoogleClientId:
    Type: String
    Description: OAuth 2.0 Web client ID from Google Cloud Console.
  GoogleClientSecret:
    Type: String
    NoEcho: true
    Description: OAuth 2.0 Web client secret from Google Cloud Console.
  DomainPrefix:
    Type: String
    Default: quantum-altivum
    Description: >
      Hosted-UI domain prefix -> <prefix>.auth.<region>.amazoncognito.com. Used only
      for the Google OAuth hop. Must be globally unique within the region.
  SiteUrl:
    Type: String
    Default: https://quantum.altivum.ai
    Description: Production site origin (for callback/logout URLs).

Resources:
  UserPool:
    Type: AWS::Cognito::UserPool
    DeletionPolicy: Retain
    Properties:
      UserPoolName: quantum-workspace
      UsernameAttributes:
        - email
      AutoVerifiedAttributes:
        - email
      AccountRecoverySetting:
        RecoveryMechanisms:
          - Name: verified_email
            Priority: 1
      AdminCreateUserConfig:
        AllowAdminCreateUserOnly: false
      Policies:
        PasswordPolicy:
          MinimumLength: 8
          RequireLowercase: true
          RequireUppercase: true
          RequireNumbers: true
          RequireSymbols: false
      EmailConfiguration:
        EmailSendingAccount: COGNITO_DEFAULT
      DeletionProtection: ACTIVE
      Schema:
        - Name: email
          AttributeDataType: String
          Required: true
          Mutable: true
      UserPoolTags:
        Project: quantum
        Feature: workspace-auth
        CostCategory: auth

  GoogleIdP:
    Type: AWS::Cognito::UserPoolIdentityProvider
    Properties:
      UserPoolId: !Ref UserPool
      ProviderName: Google
      ProviderType: Google
      ProviderDetails:
        client_id: !Ref GoogleClientId
        client_secret: !Ref GoogleClientSecret
        authorize_scopes: "openid email profile"
      AttributeMapping:
        email: email

  UserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    # The client lists Google as a supported IdP, so it must exist first.
    DependsOn: GoogleIdP
    Properties:
      ClientName: quantum-workspace-web
      UserPoolId: !Ref UserPool
      GenerateSecret: false
      ExplicitAuthFlows:
        - ALLOW_USER_SRP_AUTH
        - ALLOW_REFRESH_TOKEN_AUTH
      PreventUserExistenceErrors: ENABLED
      SupportedIdentityProviders:
        - COGNITO
        - Google
      AllowedOAuthFlowsUserPoolClient: true
      AllowedOAuthFlows:
        - code
      AllowedOAuthScopes:
        - openid
        - email
        - profile
      CallbackURLs:
        - !Sub "${SiteUrl}/auth/callback"
        - http://localhost:3000/auth/callback
      LogoutURLs:
        - !Sub "${SiteUrl}/"
        - http://localhost:3000/
      AccessTokenValidity: 60
      IdTokenValidity: 60
      RefreshTokenValidity: 30
      TokenValidityUnits:
        AccessToken: minutes
        IdToken: minutes
        RefreshToken: days

  UserPoolDomain:
    Type: AWS::Cognito::UserPoolDomain
    Properties:
      Domain: !Ref DomainPrefix
      UserPoolId: !Ref UserPool

Outputs:
  UserPoolId:
    Description: NEXT_PUBLIC_COGNITO_USER_POOL_ID
    Value: !Ref UserPool
  UserPoolClientId:
    Description: NEXT_PUBLIC_COGNITO_CLIENT_ID
    Value: !Ref UserPoolClient
  HostedDomain:
    Description: NEXT_PUBLIC_COGNITO_DOMAIN (host only)
    Value: !Sub "${DomainPrefix}.auth.${AWS::Region}.amazoncognito.com"
  Region:
    Description: NEXT_PUBLIC_AWS_REGION
    Value: !Ref AWS::Region
```

- [ ] **Step 2: Validate the template**

Run (preferred, no AWS creds needed if installed): `cfn-lint infra/workspace/cognito.yaml`
Expected: no errors.

Fallback (requires AWS creds): `aws cloudformation validate-template --template-body file://infra/workspace/cognito.yaml`
Expected: prints the parameters/outputs with no error.

If neither tool is available, verify the YAML parses: `python3 -c "import yaml,sys; yaml.safe_load(open('infra/workspace/cognito.yaml'))"` — note that this does not validate CFN semantics, only YAML syntax (CloudFormation uses non-standard tags like `!Ref`, so use a loader that ignores unknown tags or rely on `cfn-lint`).

> Note for the validator: plain `yaml.safe_load` chokes on `!Ref`/`!Sub`. Prefer
> `cfn-lint`. If only PyYAML is available, register no-op constructors for the `!`
> tags or skip to `cfn-lint`/`validate-template`.

- [ ] **Step 3: Write the README**

`infra/workspace/README.md`:

````markdown
# The Quantum Workspace — Cognito auth (sub-project #1)

Provisions the free-account identity layer for quantum.altivum.ai: a Cognito user
pool, a public SPA app client (PKCE, no secret), a hosted domain (for the Google
OAuth hop), and Google as an identity provider. The web app (`web/`) consumes the
stack outputs as four `NEXT_PUBLIC_*` env vars. Mirrors `lambda/tutor/` in spirit:
infra-as-code, cost-tagged, env-gated on the frontend.

## Prerequisites

1. **Google OAuth client.** In Google Cloud Console → APIs & Services → Credentials,
   create an **OAuth 2.0 Client ID** of type **Web application**. Add the authorized
   redirect URI (the domain prefix is chosen up front, so this is known before the
   stack exists):

   ```
   https://quantum-altivum.auth.us-east-2.amazoncognito.com/oauth2/idpresponse
   ```

   Note the **Client ID** and **Client secret**.
2. AWS CLI v2 configured for the same account as the tutor (region **us-east-2**).

## Deploy

```bash
aws cloudformation deploy \
  --region us-east-2 \
  --stack-name quantum-workspace-auth \
  --template-file infra/workspace/cognito.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    GoogleClientId=<google-client-id> \
    GoogleClientSecret=<google-client-secret>

# Read the outputs:
aws cloudformation describe-stacks --region us-east-2 \
  --stack-name quantum-workspace-auth \
  --query "Stacks[0].Outputs"
```

## Wire up the frontend

Set these in the Amplify app environment (and in `web/.env.local` for local testing),
from the stack outputs, then redeploy:

| Env var | From output |
|---|---|
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `UserPoolId` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | `UserPoolClientId` |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | `HostedDomain` |
| `NEXT_PUBLIC_AWS_REGION` | `Region` |

Until all four are set, the auth UI stays inert (no nav account control; the CTA reads
"Sign-up coming soon"; `/login` and `/workspace` show "coming soon").

## Real-path smoke test (release gate)

With the four vars in `web/.env.local`, run `npm run dev` and in a real browser:

1. **Sign up** with a real email → receive the Cognito confirmation email → enter the
   code → you are auto signed-in and land on `/workspace`.
2. **Sign out**, then **sign in** again.
3. **Forgot password** → receive the reset email → set a new password → sign in.
4. **Continue with Google** → Google consent → `/auth/callback` → `/workspace`.
5. Error paths: a wrong password shows "Incorrect email or password."; an unconfirmed
   user is routed to the confirm view with a fresh code.

## Teardown

`DeletionProtection: ACTIVE` and `DeletionPolicy: Retain` guard the pool. To delete:

```bash
aws cognito-idp update-user-pool --region us-east-2 --user-pool-id <id> \
  --deletion-protection INACTIVE
aws cloudformation delete-stack --region us-east-2 --stack-name quantum-workspace-auth
```

Then unset the four env vars in Amplify and remove the Google OAuth client.

## Cost

Cognito's monthly-active-user free tier covers expected volume. `COGNITO_DEFAULT`
email has a low daily cap and a generic sender — fine to start; SES (verified domain,
higher limits, branded sender) is the production upgrade and requires no app changes.
````

- [ ] **Step 4: Commit**

```bash
git add infra/workspace/cognito.yaml infra/workspace/README.md
git commit -m "feat(infra): Cognito user pool + Google IdP for the Quantum Workspace

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final integration checks (run after all tasks)

- [ ] **Full unit suite:** `npm test` — all suites PASS (existing + new auth suites).
- [ ] **Lint:** `npm run lint` — clean (no unused vars, no `react-hooks` warnings).
- [ ] **Static export (env UNSET — proves the site is unaffected):**
  `npm run build` succeeds and emits `out/login/index.html`, `out/auth/callback/index.html`, `out/workspace/index.html`. With no Cognito env, grep the built home and a glossary term page to confirm the auth UI is inert:
  - the nav HTML contains no "Sign in" control,
  - a glossary term page still shows "Sign-up coming soon" (CTA inert).
- [ ] **Static export (env SET — optional local check):** set the four vars in `web/.env.local`, `npm run build`, confirm the same routes build and the CTA markup links to `/login?mode=signup`.

## Manual verification (release gate — per the project's "run the real thing" rule)

Not automatable in CI (no AWS). Before flipping the env vars live in Amplify, deploy
`infra/workspace/cognito.yaml`, set the four vars in `web/.env.local`, and complete the
five-step browser smoke test documented in `infra/workspace/README.md` (email sign-up +
confirm, sign-out/in, password reset, Google, and the two error paths). Only then set
the vars in Amplify and redeploy.
```
