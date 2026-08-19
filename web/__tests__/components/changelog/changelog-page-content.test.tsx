/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ChangelogPageContent } from "@/components/changelog/changelog-page-content";
import { LocaleProvider } from "@/i18n";
import { CHANGELOG, type ChangeEntry } from "@/lib/changelog";
import { CHANGELOG_ES } from "@/lib/changelog-es";
import { bannedClaimHits } from "../../_support/changelog-ban-list";

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
    //
    // TITLE as well as body: a twin whose title was never translated satisfies
    // both the body assertion here and the data test's parity check (which asks
    // only that the title be non-empty), so the untranslated half would render
    // to every Spanish reader with the suite green.
    renderChangelog("es");
    for (const entry of CHANGELOG) {
      expect(screen.getByText(CHANGELOG_ES[entry.id].title)).toBeInTheDocument();
      expect(screen.getByText(CHANGELOG_ES[entry.id].body)).toBeInTheDocument();
      expect(screen.queryByText(entry.title)).not.toBeInTheDocument();
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

  it("links an entry to the place you can go and see it, and only that entry", () => {
    // Driven by synthetic entries rather than CHANGELOG: `href` is optional, so
    // a record whose entries all omit it would leave a loop over CHANGELOG
    // iterating zero times and passing green over a link that never renders.
    const linked: ChangeEntry = {
      id: "2026-08-19-linked",
      shipped: "2026-08-19",
      kind: "new",
      title: "Carries a link",
      body: "Has somewhere to send you.",
      href: "/learn/03-algorithms",
    };
    const unlinked: ChangeEntry = {
      id: "2026-08-19-unlinked",
      shipped: "2026-08-19",
      kind: "fixed",
      title: "Carries no link",
      body: "Has nowhere to send you.",
    };
    renderChangelog("en", [linked, unlinked]);

    const withHref = document.getElementById(linked.id)!.closest("article")!;
    expect(within(withHref as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      "/learn/03-algorithms",
    );
    const withoutHref = document.getElementById(unlinked.id)!.closest("article")!;
    expect(within(withoutHref as HTMLElement).queryByRole("link")).toBeNull();
  });

  it.each(["en", "es"] as const)("states in %s that the record starts here", (locale) => {
    // Forward-only: the page backfills nothing, so a short list must read as
    // deliberate rather than abandoned. The lede is the only thing that does
    // that, and spec section 2 assigns it that job specifically.
    //
    // Asserted on the CLAIM, not on a length. "length > 40" passes for any
    // paragraph of any prose — the forward-only sentence could be deleted
    // wholesale and this would stay green, which is the one regression it
    // exists to catch.
    const { container } = renderChangelog(locale);
    const lede = container.querySelector("header p:last-of-type");
    const expected = locale === "en" ? "The record starts here" : "El registro empieza aquí";
    expect(lede?.textContent ?? "").toContain(expected);
  });

  it("says so plainly when there is nothing to show", () => {
    // Reachable only through the prop. Entries are never deleted, so the live
    // page will not hit this — but an untested branch behind a shipped i18n
    // string is how dead copy accumulates.
    renderChangelog("en", []);
    expect(screen.getByText(/nothing has shipped/i)).toBeInTheDocument();
  });

  it.each(["en", "es"] as const)(
    "advertises nothing the deployed system cannot do, in RENDERED %s",
    (locale) => {
      // Spec section 6 asks for the ban list over rendered text in both locales,
      // in the shape the pricing page uses. The data scan in
      // __tests__/lib/changelog.test.ts reads CHANGELOG and CHANGELOG_ES only,
      // which leaves the page chrome unguarded — changelogUi.lead, .eyebrow,
      // .seeIt and .empty are i18n strings shipping to the same public, indexed
      // page as the entries, and a promise reads the same to a learner whichever
      // module it came from.
      const populated = renderChangelog(locale).container.textContent ?? "";
      // Non-vacuity: a scan over an empty tree passes while asserting nothing,
      // and it has to be THIS locale's copy — an es render that fell back to
      // English would still be a long string full of words.
      const shown = locale === "en" ? CHANGELOG[0] : CHANGELOG_ES[CHANGELOG[0].id];
      expect(populated).toContain(shown.title);
      expect(populated).toContain(shown.body);
      expect(populated.length).toBeGreaterThan(200);
      expect(bannedClaimHits(populated, locale)).toEqual([]);

      // The empty state is copy too, and it renders on no other path.
      cleanup();
      const empty = renderChangelog(locale, []).container.textContent ?? "";
      expect(empty.length).toBeGreaterThan(100);
      expect(bannedClaimHits(empty, `${locale} (empty state)`)).toEqual([]);
    },
  );

  it("renders no emoji anywhere", () => {
    const { container } = renderChangelog("en");
    expect(container.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
