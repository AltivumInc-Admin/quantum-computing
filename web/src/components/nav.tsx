"use client";

import Link from "next/link";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { ReviewNavBadge } from "./review-nav-badge";
import { AccountMenu } from "./auth/account-menu";
import { LanguageSelector } from "./language-selector";
import { SITE_HEADER_ID } from "@/lib/layout-regions";
import { useLocale } from "@/i18n";

// One link treatment for both pill rows (lg+ centered pill, small-screen row)
// so the two renderings can never drift. `shrink-0` only matters in the
// scrollable small-screen row; it is inert inside the lg+ pill.
const pillLink =
  "shrink-0 rounded-chip px-3 py-1.5 text-sm font-medium text-(--mut) transition-colors hover:bg-(--field) hover:text-(--ink) focus-ring";

function PillLinks() {
  const { t } = useLocale();
  const NAV = [
    { href: "/playground", label: t("nav.playground") },
    { href: "/runbook", label: t("nav.runbook") },
    { href: "/credentials", label: t("nav.credentials") },
    { href: "/pricing", label: t("nav.pricing") },
  ];
  return (
    <>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={pillLink}>
          {n.label}
        </Link>
      ))}
    </>
  );
}

export function Nav() {
  const { t } = useLocale();
  return (
    <header
      id={SITE_HEADER_ID}
      className="sticky top-0 z-50 border-b border-(--bd) bg-(--glass) backdrop-blur-xl backdrop-saturate-150"
    >
      <nav className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Below lg this is a plain two-end flex row; the three-zone grid (which
            exists ONLY to center the glass pill) starts where the pill does.
            Two overflow bugs came out of doing it the other way: below md the
            hidden pill still left an empty third track whose gap ate 12px, and
            at md itself the pill appeared ~100px before there was room for
            brand + pill + actions (43px of sideways scroll at 768).

            The outer tracks are minmax(0,1fr), not 1fr: a bare `1fr` is
            minmax(AUTO,1fr), and an auto minimum is min-content — so the track
            refuses to shrink and the page scrolls sideways instead. With a 0
            minimum the actions column can compress and the account email (which
            already truncates) gives up width first. */}
        <div className="flex h-16 items-center justify-between gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <Link
            href="/"
            style={{ viewTransitionName: "brand" } as React.CSSProperties}
            // The accessible name is pinned here because the wordmark below is
            // display:none under sm — without it the home link would have no
            // name at all on phones.
            aria-label={t("nav.brand")}
            className="group -mx-2 flex shrink-0 items-center gap-2.5 justify-self-start rounded-lg px-2 py-1.5 interactive focus-ring"
          >
            {/* The |Q⟩ dial-Q mark (which retired the old atom glyph): notation
                strokes in the ink, the Q dial in the commissioned gold. Bare —
                the mark carries its own geometry, no tile chrome. */}
            <LogoMark size={28} className="shrink-0 text-(--ink)" />
            {/* Mark-only on phones. The wordmark is 95px of the row's budget,
                and keeping it is what forced "Quantum Learner" to wrap onto two
                lines at every width under 1024. */}
            <span className="hidden font-display text-lg whitespace-nowrap text-(--ink) transition-colors group-hover:text-accent sm:inline">
              {t("nav.brand")}
            </span>
          </Link>

          {/* Centered glass pill */}
          <div className="hidden items-center gap-0.5 justify-self-center rounded-chip border border-(--bd) bg-(--glass-2) px-1.5 py-1 backdrop-blur-md lg:flex">
            <PillLinks />
          </div>

          {/* min-w-0 lets this column actually compress inside the lg grid
              (the account email truncates rather than pushing the page wide). */}
          <div className="flex min-w-0 items-center gap-1.5 justify-self-end">
            {/* Below lg, Review rides in the pill row with the other
                destinations — it is a nav destination, not an account control. */}
            <ReviewNavBadge className="hidden lg:inline-flex" />
            <AccountMenu />
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>

        {/* Small-screen pill — the same destinations on a compact second row
            under the bar (the centered pill above is hidden below lg), plus
            Review. A single scrollable row keeps every link reachable on the
            narrowest phones without stacking the header taller; each chip is
            a 32px-tall touch target. */}
        <div className="flex justify-center pb-2.5 lg:hidden">
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-chip border border-(--bd) bg-(--glass-2) px-1.5 py-1 backdrop-blur-md">
            {/* Review leads here, unlike the lg pill where it sits in the
                action rail: this row scrolls on narrow phones, and Review is
                the one destination carrying a live due-count — a number the
                reader must not have to scroll sideways to discover. */}
            <ReviewNavBadge className={`${pillLink} inline-flex items-center gap-1.5`} />
            <PillLinks />
          </div>
        </div>
      </nav>
    </header>
  );
}
