/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { ChangelogPageContent } from "@/components/changelog/changelog-page-content";
import { LocaleProvider } from "@/i18n";
import { CHANGELOG, type ChangeEntry } from "@/lib/changelog";
import { CHANGELOG_ES } from "@/lib/changelog-es";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

function renderChangelog(locale: "en" | "es" = "en", entries?: ChangeEntry[]) {
  localStorage.setItem("qc:locale", locale);
  return render(
    <LocaleProvider>
      <ChangelogPageContent entries={entries} />
    </LocaleProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("ChangelogPageContent", () => {
  it("renders every entry's English title", () => {
    renderChangelog("en");
    for (const entry of CHANGELOG) {
      expect(screen.getByText(entry.title)).toBeInTheDocument();
    }
  });

  it("renders the Spanish twin, not the English text, in Spanish", () => {
    // useLocale() falls back to a working English-only value with no provider,
    // so an en-only test passes while asserting nothing about localization.
    renderChangelog("es");
    for (const entry of CHANGELOG) {
      expect(screen.getByText(CHANGELOG_ES[entry.id].body)).toBeInTheDocument();
      expect(screen.queryByText(entry.body)).not.toBeInTheDocument();
    }
  });

  it("gives every entry a heading carrying its id, so #<id> resolves forever", () => {
    renderChangelog("en");
    for (const entry of CHANGELOG) {
      // getElementById, NOT querySelector: ids begin with a digit, which is a
      // valid HTML id but an invalid bare CSS selector — and jsdom does not
      // implement CSS.escape (verified), so the escaping workaround throws.
      const el = document.getElementById(entry.id);
      expect(el).not.toBeNull();
      // Anchored elements must clear the sticky header.
      expect(el).toHaveClass("scroll-mt-24");
    }
  });

  it("labels each entry with its kind, localized", () => {
    renderChangelog("en");
    const labels = CHANGELOG.map((e) => ({ new: "New", improved: "Improved", fixed: "Fixed" })[e.kind]);
    for (const label of new Set(labels)) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it.each(["en", "es"] as const)("heads each month group with a localized date in %s", (locale) => {
    renderChangelog(locale);
    const expected = locale === "en" ? "August 2026" : "agosto de 2026";
    expect(screen.getByRole("heading", { name: expected })).toBeInTheDocument();
  });

  it("links an entry to the place you can go and see it", () => {
    renderChangelog("en");
    const withHref = CHANGELOG.filter((e) => e.href);
    for (const entry of withHref) {
      const article = document.getElementById(entry.id)!.closest("article")!;
      const link = within(article as HTMLElement).getByRole("link");
      expect(link).toHaveAttribute("href", entry.href!);
    }
  });

  it.each(["en", "es"] as const)("states in %s that the record starts here", (locale) => {
    // Forward-only: the page backfills nothing, so a two-entry list must read as
    // deliberate rather than abandoned. The lede is the only thing that does that.
    const { container } = renderChangelog(locale);
    const lede = container.querySelector("header p:last-of-type");
    expect(lede?.textContent?.length ?? 0).toBeGreaterThan(40);
  });

  it("says so plainly when there is nothing to show", () => {
    // Reachable only through the prop. Entries are never deleted, so the live
    // page will not hit this — but an untested branch behind a shipped i18n
    // string is how dead copy accumulates.
    renderChangelog("en", []);
    expect(screen.getByText(/nothing has shipped/i)).toBeInTheDocument();
  });

  it("renders no emoji anywhere", () => {
    const { container } = renderChangelog("en");
    expect(container.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
