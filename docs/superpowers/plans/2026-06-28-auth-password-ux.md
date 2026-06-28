# Auth Password UX Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a show/hide eyeball, a live red→green password-criteria checklist, and a confirm-password field with a match row to the live `AuthForm`, gating sign-up/reset submit on validity.

**Architecture:** A pure `password-policy.ts` (single-sources the Cognito rules) + two presentational components (`PasswordField`, `PasswordChecklist`) composed by `AuthForm`. Two new semantic color tokens (`--color-success`, `--color-danger`) drive the checklist.

**Tech Stack:** Next.js 16 static export, React 19, Tailwind v4 (`@theme inline`), Jest + ts-jest + @testing-library/react. No new runtime deps.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-28-auth-password-ux-design.md`. Branch: `feat/auth-password-ux` (already checked out) — never switch branches.
- All work under `web/`. Run from the web dir: `cd /Users/cperez/dev/altivum-dev/quantum/web && npx jest <path>`; `npm run lint`; `npm run build`.
- **No emojis** — inline SVG icons only.
- **Criteria (verbatim):** "At least 8 characters" (`pw.length >= 8`), "An uppercase letter" (`/[A-Z]/`), "A lowercase letter" (`/[a-z]/`), "A number" (`/[0-9]/`) — in that order. Must mirror the Cognito `PasswordPolicy` in `infra/workspace/cognito.yaml`.
- **Behavior:** sign-in = eyeball + passive checklist (shown once password non-empty), no confirm, button gated only by `busy`. Sign-up & reset = eyeball + checklist + confirm field + button disabled until `allCriteriaMet(pw) && pw === confirm`.
- **A11y:** eyeball is a real `<button>` with dynamic `aria-label` ("Show password"/"Hide password") + `aria-pressed`; checklist rows convey met/unmet via `aria-label` text (not color alone); all icons `aria-hidden`.
- **Checklist visibility:** render only when the relevant password field is non-empty.
- **Confirm reset:** clear `confirm` to `""` on every view navigation.
- Static-export safe: client-side only, no new env vars, no new deps. Contrast-guard test must still pass.
- TDD throughout; commit per task with the exact message shown (keep the Co-Authored-By line).

---

### Task 1: `password-policy.ts` — the pure rule set

**Files:**
- Create: `web/src/lib/password-policy.ts`
- Test: `web/__tests__/lib/password-policy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface PasswordCriteria { length: boolean; upper: boolean; lower: boolean; number: boolean; }`
  - `interface CriterionDef { key: keyof PasswordCriteria; label: string; test: (pw: string) => boolean; }`
  - `const PASSWORD_CRITERIA: CriterionDef[]` (four items, in display order)
  - `function passwordCriteria(pw: string): PasswordCriteria`
  - `function allCriteriaMet(pw: string): boolean`

- [ ] **Step 1: Write the failing test**

`web/__tests__/lib/password-policy.test.ts`:

```ts
import { passwordCriteria, allCriteriaMet, PASSWORD_CRITERIA } from "@/lib/password-policy";

describe("password-policy", () => {
  it("PASSWORD_CRITERIA lists the four rules, in order, with the exact labels", () => {
    expect(PASSWORD_CRITERIA.map((c) => c.key)).toEqual(["length", "upper", "lower", "number"]);
    expect(PASSWORD_CRITERIA.map((c) => c.label)).toEqual([
      "At least 8 characters",
      "An uppercase letter",
      "A lowercase letter",
      "A number",
    ]);
  });

  it("passwordCriteria flags each rule independently", () => {
    expect(passwordCriteria("")).toEqual({ length: false, upper: false, lower: false, number: false });
    expect(passwordCriteria("abcdefgh")).toEqual({ length: true, upper: false, lower: true, number: false });
    expect(passwordCriteria("ABCDEFG1")).toEqual({ length: true, upper: true, lower: false, number: true });
    expect(passwordCriteria("Ab1")).toEqual({ length: false, upper: true, lower: true, number: true });
  });

  it("length boundary is exactly 8", () => {
    expect(passwordCriteria("Aa1xxxx").length).toBe(false); // 7 chars
    expect(passwordCriteria("Aa1xxxxx").length).toBe(true); // 8 chars
  });

  it("allCriteriaMet is true only when every rule holds", () => {
    expect(allCriteriaMet("Password1")).toBe(true);
    expect(allCriteriaMet("password1")).toBe(false); // no upper
    expect(allCriteriaMet("PASSWORD1")).toBe(false); // no lower
    expect(allCriteriaMet("Passwords")).toBe(false); // no number
    expect(allCriteriaMet("Pass1")).toBe(false); // too short
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/password-policy.test.ts`
Expected: FAIL — `Cannot find module '@/lib/password-policy'`.

- [ ] **Step 3: Write minimal implementation**

`web/src/lib/password-policy.ts`:

```ts
// Single source of the client-side password rules shown in the AuthForm checklist.
// These MUST mirror the Cognito User Pool PasswordPolicy in infra/workspace/cognito.yaml
// (MinimumLength 8, RequireUppercase, RequireLowercase, RequireNumbers). The static
// frontend cannot read the pool's policy, so keep the two in sync by hand.

export interface PasswordCriteria {
  length: boolean;
  upper: boolean;
  lower: boolean;
  number: boolean;
}

export interface CriterionDef {
  key: keyof PasswordCriteria;
  label: string;
  test: (pw: string) => boolean;
}

// Order here is the checklist display order.
export const PASSWORD_CRITERIA: CriterionDef[] = [
  { key: "length", label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { key: "upper", label: "An uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { key: "lower", label: "A lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { key: "number", label: "A number", test: (pw) => /[0-9]/.test(pw) },
];

export function passwordCriteria(pw: string): PasswordCriteria {
  return PASSWORD_CRITERIA.reduce((acc, c) => {
    acc[c.key] = c.test(pw);
    return acc;
  }, {} as PasswordCriteria);
}

export function allCriteriaMet(pw: string): boolean {
  return PASSWORD_CRITERIA.every((c) => c.test(pw));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/password-policy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/password-policy.ts web/__tests__/lib/password-policy.test.ts
git commit -m "feat(web): password-policy helper (single-sources the Cognito rule set)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `PasswordField` — input + eyeball toggle

**Files:**
- Create: `web/src/components/auth/password-field.tsx`
- Test: `web/__tests__/components/auth/password-field.test.tsx`

**Interfaces:**
- Consumes: nothing (self-contained client component).
- Produces: `function PasswordField(props: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete?: string; describedById?: string; }): JSX.Element`

- [ ] **Step 1: Write the failing test**

`web/__tests__/components/auth/password-field.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { PasswordField } from "@/components/auth/password-field";

describe("PasswordField", () => {
  it("renders a labeled password input, masked by default", () => {
    render(<PasswordField id="pw" label="Password" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles visibility and updates the button label/state", () => {
    render(<PasswordField id="pw" label="Password" value="secret" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(hide);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("calls onChange when the user types", () => {
    const onChange = jest.fn();
    render(<PasswordField id="pw" label="Password" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/components/auth/password-field.test.tsx`
Expected: FAIL — `Cannot find module '@/components/auth/password-field'`.

- [ ] **Step 3: Write minimal implementation**

`web/src/components/auth/password-field.tsx`:

```tsx
"use client";

import { useState } from "react";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  describedById,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  describedById?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          aria-describedby={describedById}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 pr-11 text-sm text-gray-800 dark:text-gray-200 focus-ring"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-control px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 interactive focus-ring"
        >
          {visible ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/components/auth/password-field.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/auth/password-field.tsx web/__tests__/components/auth/password-field.test.tsx
git commit -m "feat(web): PasswordField with show/hide eyeball toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `PasswordChecklist` + success/danger color tokens

**Files:**
- Create: `web/src/components/auth/password-checklist.tsx`
- Modify: `web/src/app/globals.css` (add tokens in the `@theme inline` block)
- Test: `web/__tests__/components/auth/password-checklist.test.tsx`

**Interfaces:**
- Consumes: `PASSWORD_CRITERIA` from `@/lib/password-policy`.
- Produces: `function PasswordChecklist(props: { password: string; confirm?: string; id?: string; }): JSX.Element`

- [ ] **Step 1: Write the failing test**

`web/__tests__/components/auth/password-checklist.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PasswordChecklist } from "@/components/auth/password-checklist";

describe("PasswordChecklist", () => {
  it("reflects each criterion for the given password", () => {
    render(<PasswordChecklist password="abcdefgh" />); // length + lower met; upper + number not
    expect(screen.getByLabelText("At least 8 characters: met")).toHaveAttribute("data-met", "true");
    expect(screen.getByLabelText("A lowercase letter: met")).toHaveAttribute("data-met", "true");
    expect(screen.getByLabelText("An uppercase letter: not met")).toHaveAttribute("data-met", "false");
    expect(screen.getByLabelText("A number: not met")).toHaveAttribute("data-met", "false");
  });

  it("marks every row met for a compliant password", () => {
    render(<PasswordChecklist password="Password1" />);
    for (const label of ["At least 8 characters", "An uppercase letter", "A lowercase letter", "A number"]) {
      expect(screen.getByLabelText(`${label}: met`)).toBeInTheDocument();
    }
  });

  it("omits the Passwords match row when confirm is undefined", () => {
    render(<PasswordChecklist password="Password1" />);
    expect(screen.queryByLabelText(/passwords match/i)).toBeNull();
  });

  it("adds a Passwords match row that flips when confirm equals password", () => {
    const { rerender } = render(<PasswordChecklist password="Password1" confirm="" />);
    expect(screen.getByLabelText("Passwords match: not met")).toHaveAttribute("data-met", "false");
    rerender(<PasswordChecklist password="Password1" confirm="Password1" />);
    expect(screen.getByLabelText("Passwords match: met")).toHaveAttribute("data-met", "true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/components/auth/password-checklist.test.tsx`
Expected: FAIL — `Cannot find module '@/components/auth/password-checklist'`.

- [ ] **Step 3: Add the color tokens to `globals.css`**

In `web/src/app/globals.css`, inside the `@theme inline { ... }` block, immediately after the line `--color-warm-dark: oklch(0.52 0.12 75);`, add:

```css
  --color-success: oklch(0.72 0.15 150);
  --color-success-light: oklch(0.82 0.13 150);
  --color-success-dark: oklch(0.52 0.13 150);
  --color-danger: oklch(0.62 0.2 25);
  --color-danger-light: oklch(0.72 0.17 25);
  --color-danger-dark: oklch(0.5 0.18 25);
```

Verify: `grep -nE '\-\-color-(success|danger)' web/src/app/globals.css`
Expected: 6 matching lines.

- [ ] **Step 4: Write minimal implementation**

`web/src/components/auth/password-checklist.tsx`:

```tsx
"use client";

import { PASSWORD_CRITERIA } from "@/lib/password-policy";

function Row({ met, label }: { met: boolean; label: string }) {
  return (
    <li
      data-met={met ? "true" : "false"}
      aria-label={`${label}: ${met ? "met" : "not met"}`}
      className={`flex items-center gap-2 text-xs ${
        met ? "text-success-dark dark:text-success-light" : "text-danger-dark dark:text-danger-light"
      }`}
    >
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        {met ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </span>
      {label}
    </li>
  );
}

export function PasswordChecklist({
  password,
  confirm,
  id,
}: {
  password: string;
  confirm?: string;
  id?: string;
}) {
  return (
    <ul id={id} className="mt-2 space-y-1">
      {PASSWORD_CRITERIA.map((c) => (
        <Row key={c.key} met={c.test(password)} label={c.label} />
      ))}
      {confirm !== undefined && (
        <Row met={confirm.length > 0 && confirm === password} label="Passwords match" />
      )}
    </ul>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/components/auth/password-checklist.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: clean (exit 0).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/auth/password-checklist.tsx web/__tests__/components/auth/password-checklist.test.tsx web/src/app/globals.css
git commit -m "feat(web): PasswordChecklist (red->green criteria + match row) + success/danger tokens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Integrate into `AuthForm` (eyeball, checklist, confirm, gating)

**Files:**
- Modify: `web/src/components/auth/auth-form.tsx`
- Modify: `web/__tests__/components/auth/auth-form.test.tsx`

**Interfaces:**
- Consumes: `PasswordField` (Task 2), `PasswordChecklist` (Task 3), `allCriteriaMet` (Task 1).
- Produces: no new exports (same `AuthForm`).

- [ ] **Step 1: Replace the test file with the updated suite (write the failing tests)**

Replace the entire contents of `web/__tests__/components/auth/auth-form.test.tsx` with:

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

// Exact-label fill avoids the ambiguity between "Password" and "Confirm password".
function fill(label: string, value: string) {
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

  it("signs in and routes to /workspace (login is NOT gated by the criteria)", async () => {
    signIn.mockResolvedValue({ isSignedIn: true });
    render(<AuthForm />);
    fill("Email", "a@b.com");
    fill("Password", "weak"); // deliberately fails the criteria
    const btn = screen.getByRole("button", { name: /^sign in$/i });
    expect(btn).toBeEnabled(); // not gated
    fireEvent.click(btn);
    await waitFor(() => expect(signIn).toHaveBeenCalledWith({ username: "a@b.com", password: "weak" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/workspace"));
  });

  it("shows the password checklist on sign-in once the field has content", () => {
    render(<AuthForm />);
    expect(screen.queryByLabelText(/at least 8 characters/i)).toBeNull();
    fill("Password", "x");
    expect(screen.getByLabelText(/at least 8 characters/i)).toBeInTheDocument();
    // no confirm field on sign-in
    expect(screen.queryByLabelText("Confirm password")).toBeNull();
  });

  it("toggles password visibility via the eyeball", () => {
    render(<AuthForm />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  });

  it("shows a friendly message on bad credentials", async () => {
    signIn.mockRejectedValue({ name: "NotAuthorizedException" });
    render(<AuthForm />);
    fill("Email", "a@b.com");
    fill("Password", "Password1");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect email or password/i);
  });

  it("jumps to the confirm view (and resends a code) for an unconfirmed user", async () => {
    signIn.mockRejectedValue({ name: "UserNotConfirmedException" });
    resendSignUpCode.mockResolvedValue({});
    render(<AuthForm />);
    fill("Email", "a@b.com");
    fill("Password", "Password1");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("button", { name: /confirm/i })).toBeInTheDocument();
    await waitFor(() => expect(resendSignUpCode).toHaveBeenCalledWith({ username: "a@b.com" }));
  });

  it("gates sign-up until the criteria pass AND the confirm matches", () => {
    mockSearch = "mode=signup";
    render(<AuthForm />);
    const btn = screen.getByRole("button", { name: /create account/i });
    fill("Email", "new@b.com");
    fill("Password", "Password1"); // meets criteria, confirm still empty
    expect(btn).toBeDisabled();
    fill("Confirm password", "Password2"); // mismatch
    expect(btn).toBeDisabled();
    fill("Confirm password", "Password1"); // match
    expect(btn).toBeEnabled();
  });

  it("keeps sign-up disabled for a too-weak password even if confirm matches", () => {
    mockSearch = "mode=signup";
    render(<AuthForm />);
    fill("Email", "new@b.com");
    fill("Password", "weak");
    fill("Confirm password", "weak");
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
  });

  it("signs up with the right args once valid and advances to the confirm view", async () => {
    mockSearch = "mode=signup";
    signUp.mockResolvedValue({ isSignUpComplete: false });
    render(<AuthForm />);
    fill("Email", "new@b.com");
    fill("Password", "Password1");
    fill("Confirm password", "Password1");
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
    fill("Email", "new@b.com");
    fill("Password", "Password1");
    fill("Confirm password", "Password1");
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

  it("runs forgot -> reset and gates the reset submit until valid", async () => {
    resetPassword.mockResolvedValue({});
    confirmResetPassword.mockResolvedValue({});
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    fill("Email", "a@b.com");
    fireEvent.click(screen.getByRole("button", { name: /send reset code/i }));
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({ username: "a@b.com" }));

    const setBtn = await screen.findByRole("button", { name: /set new password/i });
    fireEvent.change(screen.getByLabelText("Reset code"), { target: { value: "654321" } });
    fill("New password", "Password1");
    expect(setBtn).toBeDisabled(); // confirm empty
    fill("Confirm new password", "Password1");
    expect(setBtn).toBeEnabled();
    fireEvent.click(setBtn);
    await waitFor(() =>
      expect(confirmResetPassword).toHaveBeenCalledWith({
        username: "a@b.com",
        confirmationCode: "654321",
        newPassword: "Password1",
      })
    );
  });

  it("surfaces the Google error from ?error=google", () => {
    mockSearch = "error=google";
    render(<AuthForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(/google sign-in/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/components/auth/auth-form.test.tsx`
Expected: FAIL — the confirm field, eyeball, checklist, and gating don't exist yet (e.g., `Unable to find a label "Confirm password"`, button not disabled).

- [ ] **Step 3: Replace `auth-form.tsx` with the integrated version**

Replace the entire contents of `web/src/components/auth/auth-form.tsx` with:

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
import { allCriteriaMet } from "@/lib/password-policy";
import { PasswordField } from "./password-field";
import { PasswordChecklist } from "./password-checklist";

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
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "google" ? "Google sign-in didn't complete. Please try again." : null
  );
  const [busy, setBusy] = useState(false);

  // Navigate between views, clearing the confirm field + any error so a confirm
  // value never carries between the sign-up and reset views.
  const goTo = (v: AuthView) => {
    setConfirm("");
    setError(null);
    setView(v);
  };

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
        setConfirm("");
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

  const signUpInvalid = !allCriteriaMet(password) || password !== confirm;
  const resetInvalid = !allCriteriaMet(newPassword) || newPassword !== confirm;

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
        {title[view]}
      </h1>

      {error && (
        <p role="alert" className="mt-4 text-sm text-warm-dark dark:text-warm-light">
          {error}
        </p>
      )}

      {view === "signIn" && (
        <form onSubmit={doSignIn} className="mt-6 space-y-4">
          <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            describedById={password ? "signin-pw-rules" : undefined}
          />
          {password && <PasswordChecklist id="signin-pw-rules" password={password} />}
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="flex items-center justify-between">
            <button type="button" className={linkBtn} onClick={() => goTo("forgot")}>
              Forgot password?
            </button>
            <button type="button" className={linkBtn} onClick={() => goTo("signUp")}>
              Create account
            </button>
          </div>
          <GoogleBlock onClick={doGoogle} />
        </form>
      )}

      {view === "signUp" && (
        <form onSubmit={doSignUp} className="mt-6 space-y-4">
          <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            describedById={password ? "signup-pw-rules" : undefined}
          />
          <PasswordField
            id="confirm"
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          {password && <PasswordChecklist id="signup-pw-rules" password={password} confirm={confirm} />}
          <button type="submit" disabled={busy || signUpInvalid} className={primaryBtn}>
            {busy ? "Creating…" : "Create account"}
          </button>
          <div className="text-center">
            <button type="button" className={linkBtn} onClick={() => goTo("signIn")}>
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
            <button type="button" className={linkBtn} onClick={() => goTo("signIn")}>
              Back to sign in
            </button>
          </div>
        </form>
      )}

      {view === "reset" && (
        <form onSubmit={doReset} className="mt-6 space-y-4">
          <Field id="code" label="Reset code" type="text" value={code} onChange={setCode} />
          <PasswordField
            id="newPassword"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            describedById={newPassword ? "reset-pw-rules" : undefined}
          />
          <PasswordField
            id="confirm"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          {newPassword && <PasswordChecklist id="reset-pw-rules" password={newPassword} confirm={confirm} />}
          <button type="submit" disabled={busy || resetInvalid} className={primaryBtn}>
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/components/auth/auth-form.test.tsx`
Expected: PASS (14 tests).

- [ ] **Step 5: Run the full suite + lint**

Run: `npm test`
Expected: all suites PASS.

Run: `npm run lint`
Expected: clean (exit 0).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/auth/auth-form.tsx web/__tests__/components/auth/auth-form.test.tsx
git commit -m "feat(web): integrate eyeball + criteria checklist + confirm + gating into AuthForm

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final integration checks (after all tasks)

- [ ] **Full suite:** `cd web && npm test` — all suites pass (existing + 4 new/updated auth suites).
- [ ] **Lint:** `npm run lint` — clean.
- [ ] **Static export:** `npm run build` — succeeds; `out/login.html` emitted; the new `--color-success`/`--color-danger` utilities compile (no Tailwind "unknown utility" error for `text-success-dark`/`text-danger-dark`).

## Manual verification (browser, against the live env)

The unit tests cover behavior; confirm the visual/real path on quantum.altivum.ai (or `npm run dev` with the Cognito env set):

- The eyeball reveals/masks the password on sign-in, sign-up, and reset.
- The checklist appears on first keystroke and each row flips **red X → green check** as the rule is met.
- "Create account" / "Set new password" stay disabled until every row is green **and** "Passwords match" is green.
- The forgot-password flow: "Forgot password?" → email → **reset code email arrives** → enter code + new password (same checklist + confirm) → set → sign in. (This also closes the still-pending auth-foundation reset-email smoke.)
- Dark and light mode both legible; the green/red have adequate contrast on the form surface.
```
