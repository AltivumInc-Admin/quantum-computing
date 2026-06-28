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
