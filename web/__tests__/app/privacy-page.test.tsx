/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import PrivacyPage, { metadata } from "@/app/privacy/page";
import { LocaleProvider } from "@/i18n";

function renderPrivacy(locale: "en" | "es" = "en") {
  localStorage.setItem("qc:locale", locale);
  return render(
    <LocaleProvider>
      <PrivacyPage />
    </LocaleProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("PrivacyPage", () => {
  it("has honest page metadata", () => {
    expect(metadata.title).toMatch(/privacy/i);
  });

  it("states what is stored, where, and the opt-in email terms", () => {
    renderPrivacy();
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText(/what we store/i)).toBeInTheDocument();
    expect(screen.getAllByText(/us-east-2/).length).toBeGreaterThan(0);
    expect(screen.getByText(/what we don't collect/i)).toBeInTheDocument();
    expect(screen.getByText(/no analytics or tracking scripts/i)).toBeInTheDocument();
    expect(screen.getByText(/strictly opt-in/i)).toBeInTheDocument();
    expect(screen.getByText(/at most one email every 7 days/i)).toBeInTheDocument();
  });

  it.each(["en", "es"] as const)(
    "names the tutor's real processor in %s: Anthropic, not Amazon Bedrock",
    (locale) => {
      // The tutor moved off Bedrock to Anthropic's first-party API (2026-08-17). A
      // privacy page is exactly the surface that must name where a question actually
      // goes, so the old wording is barred, not just the new one asserted — and it is
      // barred PER LOCALE: an en-only lock recreates the exact gap that let the
      // sponsorship copy outlive its withdrawal (the es half shipped unpinned).
      renderPrivacy(locale);
      expect(screen.getAllByText(/Anthropic/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/Bedrock/)).not.toBeInTheDocument();
      // The hardware-run bullet's justification is spend limits, not a "sponsored
      // budget" nobody holds (qpu-core.mjs LIFETIME_CAP_MICROS = 0).
      expect(screen.queryByText(/sponsor\w*|patrocin\w*/i)).not.toBeInTheDocument();
    },
  );

  it("points at the real deletion control and gives a contact", () => {
    renderPrivacy();
    expect(screen.getByText(/delete account/i)).toBeInTheDocument();
    const mail = screen.getByRole("link", { name: /christian\.perez@altivum\.io/ });
    expect(mail).toHaveAttribute("href", "mailto:christian.perez@altivum.io");
  });

  it("carries its last-updated date", () => {
    renderPrivacy();
    expect(screen.getByText(/last updated 2026-07-12/i)).toBeInTheDocument();
  });
});
