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
