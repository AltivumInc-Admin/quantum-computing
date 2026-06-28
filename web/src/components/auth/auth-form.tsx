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
        <p role="alert" className="mt-4 text-sm text-warm-dark dark:text-warm-light">
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
