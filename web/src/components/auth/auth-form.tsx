"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signInWithRedirect,
  signOut,
  resetPassword,
  confirmResetPassword,
} from "aws-amplify/auth";
import {
  mapAuthError,
  HOSTED_UI_SESSION_ACTIVE,
  SIGN_IN_INCOMPLETE,
  type AuthView,
} from "@/lib/auth-errors";
import { hasUserPoolAdminScope } from "@/lib/auth-session";
import { allCriteriaMet } from "@/lib/password-policy";
import { PasswordField } from "./password-field";
import { PasswordChecklist } from "./password-checklist";
import { LogoMark } from "@/components/logo";
import { useLocale } from "@/i18n";

const primaryBtn =
  "w-full surface-accent inline-flex items-center justify-center rounded-control px-4 py-2.5 text-sm font-medium interactive focus-ring disabled:opacity-60";
const linkBtn =
  "text-sm text-accent-dark dark:text-accent-light hover:underline focus-ring rounded";

export function AuthForm() {
  const { t } = useLocale();
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
  // Google failure lands with ?error=google — resolve from the active dictionary
  // at first render (no setState-in-effect; locale is already available).
  const [error, setError] = useState<string | null>(() =>
    params.get("error") === "google" ? t("auth.googleFailed") : null,
  );
  const [busy, setBusy] = useState(false);
  // Resend-code feedback + a cooldown that guards rapid re-clicks straight into a
  // Cognito rate-limit and gives the user explicit confirmation a code was re-sent.
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendCooldown, setResendCooldown] = useState(0); // seconds remaining

  // Tick the cooldown down to zero, one second at a time.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
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
      setError(t(m.messageKey));
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

  const named = (name: string) => Object.assign(new Error(name), { name });

  // A resolved signIn is NOT a successful signIn. aws-amplify catches
  // UserNotConfirmedException / PasswordResetRequiredException inside
  // signInWithSRP and RESOLVES them as {isSignedIn:false, nextStep} — so treating
  // "did not throw" as "signed in" routed those users to /workspace, where the auth
  // wall bounced them back to /login with no error and no way forward. Convert each
  // incomplete outcome into the error name that already drives the right view, and
  // never let an unrecognized step fall through to a navigation.
  const assertSignedIn = (out: { isSignedIn?: boolean; nextStep?: { signInStep?: string } }) => {
    if (out?.isSignedIn) return;
    const step = out?.nextStep?.signInStep;
    if (step === "CONFIRM_SIGN_UP") throw named("UserNotConfirmedException");
    if (step === "RESET_PASSWORD") throw named("PasswordResetRequiredException");
    throw named(SIGN_IN_INCOMPLETE);
  };

  // signIn that survives a session already squatting in this tab. Amplify throws
  // UserAlreadyAuthenticatedException rather than switching users, and a "failed"
  // Google round-trip can leave exactly such a session behind (the token exchange
  // succeeds even when the UI reports failure).
  //
  // The recovery differs by session kind, because signOut() is not a local token
  // clear here: loginWith.oauth is always configured, so for a HOSTED-UI session
  // Amplify redirects the whole page to the Cognito /logout endpoint. Awaiting a
  // retry after that awaits a document that is already unloading — the user would
  // land on the home page, signed out, with their password silently discarded. So
  // only the native squatter gets the sign-out-and-retry; for a Google one we say
  // what is actually true and let them reload into the session they already have.
  const signInFresh = async () => {
    try {
      return await signIn({ username: email, password });
    } catch (err) {
      if ((err as { name?: string })?.name !== "UserAlreadyAuthenticatedException") throw err;
      if (!(await hasUserPoolAdminScope())) throw named(HOSTED_UI_SESSION_ACTIVE);
      await signOut();
      return await signIn({ username: email, password });
    }
  };

  const doSignIn = handle(async () => {
    assertSignedIn(await signInFresh());
    router.replace("/workspace");
  });
  const doSignUp = handle(async () => {
    await signUp({ username: email, password, options: { userAttributes: { email } } });
    setView("confirm");
  });
  const doConfirm = handle(async () => {
    await confirmSignUp({ username: email, confirmationCode: code });
    assertSignedIn(await signInFresh());
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
  // signInWithRedirect runs the same assertUserNotAuthenticated guard as signIn, so
  // it rejects under exactly the squatting-session state the ?error=google banner
  // invites the user to retry from. Firing it as `void` discarded that rejection:
  // the button did nothing, on every click, with no feedback whatsoever. Here the
  // hosted-UI sign-out redirect is the DESIRED outcome — it hands the user to
  // Cognito's /logout and back — so unlike signInFresh this path may sign out.
  const doGoogle = async () => {
    setError(null);
    try {
      await signInWithRedirect({ provider: "Google" });
    } catch (err) {
      if ((err as { name?: string })?.name === "UserAlreadyAuthenticatedException") {
        try {
          await signOut();
          await signInWithRedirect({ provider: "Google" });
          return;
        } catch {
          /* fall through to the banner below */
        }
      }
      setError(t(mapAuthError(err).messageKey));
    }
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
      setError(t(mapAuthError(err).messageKey));
    }
  };

  const title: Record<AuthView, string> = {
    signIn: t("auth.signIn"),
    signUp: t("auth.signUp"),
    confirm: t("auth.confirmEmail"),
    forgot: t("auth.forgotPassword"),
    reset: t("auth.resetPassword"),
  };

  const signUpInvalid = !allCriteriaMet(password) || password !== confirm;
  const resetInvalid = !allCriteriaMet(newPassword) || newPassword !== confirm;

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* The auth screen is the one full-page brand moment with no other
          chrome, so the |Q⟩ mark leads it. */}
      <LogoMark size={36} className="mb-5 text-(--ink)" />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-display-md tracking-tight text-(--ink) outline-none"
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
          {/* autocomplete="username" (not "email"): per the WHATWG autofill spec the
              login identifier field is "username" even when that identifier is an
              email address — it pairs with current-password in password managers. */}
          <Field
            id="email"
            name="email"
            label={t("auth.email")}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="username"
          />
          <PasswordField
            id="password"
            label={t("auth.password")}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            describedById={password ? "signin-pw-rules" : undefined}
          />
          {password && <PasswordChecklist id="signin-pw-rules" password={password} />}
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? t("auth.signingIn") : t("auth.signIn")}
          </button>
          <div className="flex items-center justify-between">
            <button type="button" className={linkBtn} onClick={() => goTo("forgot")}>
              {t("auth.forgotLink")}
            </button>
            <button type="button" className={linkBtn} onClick={() => goTo("signUp")}>
              {t("auth.createAccount")}
            </button>
          </div>
          <GoogleBlock onClick={() => void doGoogle()} />
        </form>
      )}

      {view === "signUp" && (
        <form onSubmit={doSignUp} className="mt-6 space-y-4">
          <Field
            id="email"
            name="email"
            label={t("auth.email")}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <PasswordField
            id="password"
            label={t("auth.password")}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            describedById={password ? "signup-pw-rules" : undefined}
          />
          <PasswordField
            id="confirm"
            label={t("auth.confirmPassword")}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          {password && <PasswordChecklist id="signup-pw-rules" password={password} confirm={confirm} />}
          <button type="submit" disabled={busy || signUpInvalid} className={primaryBtn}>
            {busy ? t("auth.creating") : t("auth.createAccount")}
          </button>
          <div className="text-center">
            <button type="button" className={linkBtn} onClick={() => goTo("signIn")}>
              {t("auth.alreadyHaveAccount")}
            </button>
          </div>
          <GoogleBlock onClick={() => void doGoogle()} />
        </form>
      )}

      {view === "confirm" && (
        <form onSubmit={doConfirm} className="mt-6 space-y-4">
          <p className="text-sm text-(--mut)">
            {t("auth.enterCode", { email: email || t("auth.yourAddress") })}
          </p>
          {/* one-time-code + numeric: Mail/Messages offer the emailed code as an
              autofill suggestion, and mobile keyboards open on digits. */}
          <Field
            id="code"
            name="code"
            label={t("auth.confirmationCode")}
            type="text"
            value={code}
            onChange={setCode}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]*"
          />
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? t("auth.confirming") : t("auth.confirmBtn")}
          </button>
          <div className="space-y-1 text-center">
            <button
              type="button"
              className={`${linkBtn} disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline`}
              onClick={() => void resend()}
              disabled={resendState === "sending" || resendCooldown > 0}
            >
              {resendCooldown > 0
                ? t("auth.resendCodeCooldown", { seconds: resendCooldown })
                : resendState === "sending"
                  ? t("auth.sending")
                  : t("auth.resendCode")}
            </button>
            {resendState === "sent" && (
              <p role="status" className="text-xs text-caption">
                {t("auth.codeOnWay")}
              </p>
            )}
          </div>
        </form>
      )}

      {view === "forgot" && (
        <form onSubmit={doForgot} className="mt-6 space-y-4">
          {/* "username" for the same reason as sign-in: this is the login identifier. */}
          <Field
            id="email"
            name="email"
            label={t("auth.email")}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="username"
          />
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? t("auth.sending") : t("auth.sendResetCode")}
          </button>
          <div className="text-center">
            <button type="button" className={linkBtn} onClick={() => goTo("signIn")}>
              {t("auth.backToSignIn")}
            </button>
          </div>
        </form>
      )}

      {view === "reset" && (
        <form onSubmit={doReset} className="mt-6 space-y-4">
          <Field
            id="code"
            name="code"
            label={t("auth.resetCode")}
            type="text"
            value={code}
            onChange={setCode}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]*"
          />
          <PasswordField
            id="newPassword"
            label={t("auth.newPassword")}
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            describedById={newPassword ? "reset-pw-rules" : undefined}
          />
          <PasswordField
            id="confirm"
            label={t("auth.confirmNewPassword")}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          {newPassword && <PasswordChecklist id="reset-pw-rules" password={newPassword} confirm={confirm} />}
          <button type="submit" disabled={busy || resetInvalid} className={primaryBtn}>
            {busy ? t("auth.saving") : t("auth.setNewPassword")}
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
  name,
  autoComplete,
  inputMode,
  pattern,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  name?: string;
  autoComplete?: string;
  inputMode?: "numeric";
  pattern?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-(--mut)">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        pattern={pattern}
        className="w-full rounded-control border border-(--bd) bg-(--field) px-3 py-2.5 text-sm text-(--ink) focus-ring"
      />
    </div>
  );
}

function GoogleBlock({ onClick }: { onClick: () => void }) {
  const { t } = useLocale();
  return (
    <>
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-(--bd)" />
        <span className="text-xs text-caption">{t("common.or")}</span>
        <span className="h-px flex-1 bg-(--bd)" />
      </div>
      <button
        type="button"
        onClick={onClick}
        className="w-full inline-flex items-center justify-center gap-2 rounded-control border border-(--bd) px-4 py-2.5 text-sm font-medium text-(--mut) interactive focus-ring"
      >
        {t("auth.continueWithGoogle")}
      </button>
    </>
  );
}
