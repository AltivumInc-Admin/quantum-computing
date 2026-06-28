"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
  // Resend-code feedback + a cooldown that guards rapid re-clicks straight into a
  // Cognito rate-limit and gives the user explicit confirmation a code was re-sent.
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendCooldown, setResendCooldown] = useState(0); // seconds remaining

  // Tick the cooldown down to zero, one second at a time.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // When the flow advances to a new view, move focus to its heading so the
  // screen reader announces the new step and keyboard focus doesn't drop to
  // <body> (the just-clicked submit button unmounts). Comparing the prior view
  // skips the initial mount — and StrictMode's mount double-invoke — so first
  // load never steals focus from the email field / browser autofill.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevViewRef = useRef(view);
  useEffect(() => {
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    headingRef.current?.focus({ preventScroll: true });
  }, [view]);

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
            setResendCooldown(30); // reflect the just-sent code on the manual button
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
  const resend = async () => {
    if (resendState === "sending" || resendCooldown > 0) return; // guard double-click + cooldown
    setResendState("sending");
    setError(null);
    try {
      await resendSignUpCode({ username: email });
      setResendState("sent");
      setResendCooldown(30);
    } catch (err) {
      setResendState("error");
      setError(mapAuthError(err).message);
    }
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
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-display-md tracking-tight text-gray-900 dark:text-white outline-none"
      >
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
          <div className="space-y-1 text-center">
            <button
              type="button"
              className={`${linkBtn} disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline`}
              onClick={() => void resend()}
              disabled={resendState === "sending" || resendCooldown > 0}
            >
              {resendCooldown > 0
                ? `Resend code (${resendCooldown}s)`
                : resendState === "sending"
                  ? "Sending…"
                  : "Resend code"}
            </button>
            {resendState === "sent" && (
              <p role="status" className="text-xs text-gray-500 dark:text-gray-400">
                A new code is on its way.
              </p>
            )}
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
