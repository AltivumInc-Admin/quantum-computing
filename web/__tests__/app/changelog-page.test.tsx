/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import ChangelogPage, { metadata } from "@/app/changelog/page";
import { LocaleProvider } from "@/i18n";
import { bannedClaimHits } from "../_support/changelog-ban-list";

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

/**
 * Every string the `metadata` export ships, flattened depth-first with its path.
 *
 * Recursive on purpose, and lifted in shape (not by import — nothing there is
 * exported) from the pricing page's guard: `title` and `description` are what
 * matter today, but Next.js metadata grows sideways (openGraph.images carry alt
 * text, `keywords` is an array, `other` is free-form) and a scan that enumerated
 * today's keys by hand would silently skip whatever gets added next. The path
 * rides along so a failure names the field that has to change.
 */
function metadataStrings(value: unknown, path = "metadata"): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => metadataStrings(v, `${path}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => metadataStrings(v, `${path}.${k}`));
  return [];
}

describe("ChangelogPage", () => {
  it("carries honest, indexable metadata", () => {
    expect(metadata.title).toMatch(/changelog/i);
    expect(String(metadata.description ?? "")).not.toHaveLength(0);
    // A freshness page that is in the sitemap and reached through fragments and
    // tracking parameters must name its own canonical URL.
    expect(metadata.alternates?.canonical).toBe("/changelog");
  });

  it("advertises nothing the deployed system cannot do, in the METADATA export", () => {
    // The surface no rendered-text scan can reach: these strings never enter the
    // React tree. Next.js emits them into <title> and <meta name="description">,
    // which is what a search result quotes — so on a public indexed page this is
    // the copy the most people read, and the rule-13 ban list has to see it.
    const strings = metadataStrings(metadata);
    // Non-vacuity, pinned to the exact paths. If the export is restructured — an
    // openGraph block added, a description moved behind a helper — this fails
    // loudly and the new field gets consciously admitted to the scan, rather
    // than the scan quietly reading a shorter list and passing.
    expect(strings.map(({ path }) => path).sort()).toEqual([
      "metadata.alternates.canonical",
      "metadata.description",
      "metadata.title",
    ]);
    expect(strings.flatMap(({ path, text }) => bannedClaimHits(text, path))).toEqual([]);
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
