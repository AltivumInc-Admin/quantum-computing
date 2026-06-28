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

  // Reaches the confirm view via sign-up (which does NOT auto-resend), so the manual
  // resend button starts idle with no cooldown.
  async function toConfirmView() {
    mockSearch = "mode=signup";
    signUp.mockResolvedValue({ isSignUpComplete: false });
    render(<AuthForm />);
    fill("Email", "new@b.com");
    fill("Password", "Password1");
    fill("Confirm password", "Password1");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    return screen.findByRole("button", { name: /^resend code$/i });
  }

  it("resend: success confirms a code was sent and starts a cooldown", async () => {
    resendSignUpCode.mockResolvedValue({});
    const resendBtn = await toConfirmView();
    fireEvent.click(resendBtn);
    await waitFor(() =>
      expect(resendSignUpCode).toHaveBeenCalledWith({ username: "new@b.com" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/code is on its way/i);
    expect(screen.getByRole("button", { name: /resend code \(\d+s\)/i })).toBeDisabled();
  });

  it("resend: failure surfaces a mapped error and does not throw", async () => {
    resendSignUpCode.mockRejectedValue({ name: "LimitExceededException" });
    const resendBtn = await toConfirmView();
    fireEvent.click(resendBtn);
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });

  it("resend: rapid double-click only sends one code", async () => {
    resendSignUpCode.mockResolvedValue({});
    const resendBtn = await toConfirmView();
    fireEvent.click(resendBtn);
    fireEvent.click(resendBtn); // immediately again — guarded by sending/cooldown + disabled
    await waitFor(() => expect(resendSignUpCode).toHaveBeenCalledTimes(1));
  });
});
