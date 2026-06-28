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
