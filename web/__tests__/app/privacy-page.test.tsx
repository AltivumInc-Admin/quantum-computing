/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import PrivacyPage, { metadata } from "@/app/privacy/page";

describe("PrivacyPage", () => {
  it("has honest page metadata", () => {
    expect(metadata.title).toMatch(/privacy/i);
  });

  it("states what is stored, where, and the opt-in email terms", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText(/what we store/i)).toBeInTheDocument();
    expect(screen.getAllByText(/us-east-2/).length).toBeGreaterThan(0);
    expect(screen.getByText(/what we don't collect/i)).toBeInTheDocument();
    expect(screen.getByText(/no analytics or tracking scripts/i)).toBeInTheDocument();
    expect(screen.getByText(/strictly opt-in/i)).toBeInTheDocument();
    expect(screen.getByText(/at most one email every 7 days/i)).toBeInTheDocument();
  });

  it("points at the real deletion control and gives a contact", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/delete account/i)).toBeInTheDocument();
    const mail = screen.getByRole("link", { name: /christian\.perez@altivum\.io/ });
    expect(mail).toHaveAttribute("href", "mailto:christian.perez@altivum.io");
  });

  it("carries its last-updated date", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/last updated 2026-07-12/i)).toBeInTheDocument();
  });
});
