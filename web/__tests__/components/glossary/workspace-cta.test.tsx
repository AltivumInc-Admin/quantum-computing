/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

describe("WorkspaceCta", () => {
  const original = process.env.NEXT_PUBLIC_SIGNUP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SIGNUP_URL;
    else process.env.NEXT_PUBLIC_SIGNUP_URL = original;
    jest.resetModules();
  });

  it("shows a coming-soon teaser when the signup URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SIGNUP_URL;
    const { WorkspaceCta } = require("@/components/glossary/workspace-cta");
    render(<WorkspaceCta />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up/i })).toBeNull();
  });

  it("renders a signup link when the URL is set", () => {
    process.env.NEXT_PUBLIC_SIGNUP_URL = "https://signup.example.com";
    const { WorkspaceCta } = require("@/components/glossary/workspace-cta");
    render(<WorkspaceCta />);
    expect(screen.getByRole("link", { name: /sign up/i })).toHaveAttribute(
      "href",
      "https://signup.example.com"
    );
  });
});
