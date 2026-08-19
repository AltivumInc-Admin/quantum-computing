/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import ChangelogPage, { metadata } from "@/app/changelog/page";
import { LocaleProvider } from "@/i18n";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

afterEach(() => {
  localStorage.clear();
});

describe("ChangelogPage", () => {
  it("carries honest, indexable metadata", () => {
    expect(metadata.title).toMatch(/changelog/i);
    expect(String(metadata.description ?? "")).not.toHaveLength(0);
  });

  it("is not marked noindex — unlike the walled glossary, this page is public", () => {
    // app/glossary/page.tsx sets robots: { index: false, follow: false } because
    // it sits behind the sign-up wall. Cloning that file would silently
    // de-index the one page whose job is to be found.
    expect(metadata.robots).toBeUndefined();
  });

  it("renders the changelog", () => {
    localStorage.setItem("qc:locale", "en");
    render(
      <LocaleProvider>
        <ChangelogPage />
      </LocaleProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Changelog" })).toBeInTheDocument();
  });
});
