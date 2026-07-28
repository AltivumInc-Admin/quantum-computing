// Maps Amplify/Cognito error names to i18n keys + an optional view to jump to.
// PreventUserExistenceErrors is ENABLED on the app client, so sign-in failures
// never reveal whether an account exists — hence the generic credentials message.
// Callers translate messageKey with t() so Spanish users see Spanish errors.

export type AuthView = "signIn" | "signUp" | "confirm" | "forgot" | "reset";

export type AuthErrorKey =
  | "auth.errors.incorrectCredentials"
  | "auth.errors.confirmEmailFirst"
  | "auth.errors.emailExists"
  | "auth.errors.codeMismatch"
  | "auth.errors.codeExpired"
  | "auth.errors.invalidPassword"
  | "auth.errors.tooManyAttempts"
  | "auth.errors.resetRequired"
  | "auth.errors.googleSessionActive"
  | "auth.errors.generic";

export interface MappedError {
  /** i18n key under auth.errors.* — translate with t(messageKey). */
  messageKey: AuthErrorKey;
  /** @deprecated use messageKey + t(); kept for callers mid-migration. */
  message: string;
  view?: AuthView;
}

const EN_FALLBACK: Record<AuthErrorKey, string> = {
  "auth.errors.incorrectCredentials": "Incorrect email or password.",
  "auth.errors.confirmEmailFirst":
    "Please confirm your email first — we just sent you a new code.",
  "auth.errors.emailExists": "An account with that email already exists.",
  "auth.errors.codeMismatch": "That code doesn't match. Check it and try again.",
  "auth.errors.codeExpired": "That code has expired. Request a new one.",
  "auth.errors.invalidPassword":
    "Password must be at least 8 characters with upper, lower, and a number.",
  "auth.errors.tooManyAttempts":
    "Too many attempts. Please wait a moment and try again.",
  "auth.errors.resetRequired":
    "You need to set a new password before signing in — request a reset code.",
  "auth.errors.googleSessionActive":
    "You're already signed in with Google. Reload this page to continue.",
  "auth.errors.generic": "Something went wrong. Please try again.",
};

/** Synthetic error names this app raises itself, for sign-in outcomes the SDK
 *  reports as a RESOLVED result rather than a throw (see auth-form's signInFresh). */
export const SIGN_IN_INCOMPLETE = "SignInIncomplete";
export const HOSTED_UI_SESSION_ACTIVE = "HostedUiSessionActive";

function errorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    return String((err as { name: unknown }).name);
  }
  return "";
}

function mapped(key: AuthErrorKey, view?: AuthView): MappedError {
  return { messageKey: key, message: EN_FALLBACK[key], view };
}

export function mapAuthError(err: unknown): MappedError {
  switch (errorName(err)) {
    case "NotAuthorizedException":
      return mapped("auth.errors.incorrectCredentials");
    case "UserNotConfirmedException":
      return mapped("auth.errors.confirmEmailFirst", "confirm");
    case "UsernameExistsException":
      return mapped("auth.errors.emailExists");
    case "CodeMismatchException":
      return mapped("auth.errors.codeMismatch");
    case "ExpiredCodeException":
      return mapped("auth.errors.codeExpired");
    case "InvalidPasswordException":
    case "InvalidParameterException":
      return mapped("auth.errors.invalidPassword");
    case "LimitExceededException":
    case "TooManyRequestsException":
      return mapped("auth.errors.tooManyAttempts");
    // Cognito answers a reset-required sign-in with a RESOLVED nextStep, not a
    // throw; auth-form converts it to this name so the user reaches the reset flow
    // instead of being routed to a workspace they cannot enter.
    case "PasswordResetRequiredException":
      return mapped("auth.errors.resetRequired", "forgot");
    case HOSTED_UI_SESSION_ACTIVE:
      return mapped("auth.errors.googleSessionActive");
    default:
      return mapped("auth.errors.generic");
  }
}
