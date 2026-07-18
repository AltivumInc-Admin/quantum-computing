import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { ReviewNavBadge } from "./review-nav-badge";
import { AccountMenu } from "./auth/account-menu";

const NAV = [
  { href: "/playground", label: "Playground" },
  { href: "/runbook", label: "Runbook" },
  { href: "/credentials", label: "Credentials" },
  { href: "/pricing", label: "Pricing" },
];

export function Nav() {
  return (
    <header
      id="site-header"
      className="sticky top-0 z-50 border-b border-(--bd) bg-(--glass) backdrop-blur-xl backdrop-saturate-150"
    >
      {/* Three-zone grid keeps the glass pill perfectly centered between the
          brand and the actions at every width. */}
      <nav className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          style={{ viewTransitionName: "brand" } as React.CSSProperties}
          className="group -mx-2 flex items-center gap-2.5 justify-self-start rounded-lg px-2 py-1.5 interactive focus-ring"
        >
          {/* The favicon's atom mark, in the site's olive with a warm-gold electron. */}
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-(--bd) bg-(--field) text-accent">
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <g stroke="currentColor" strokeWidth="1.4">
                <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(45 12 12)" />
                <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-45 12 12)" />
              </g>
              <circle cx="12" cy="12" r="1.9" fill="currentColor" />
              <circle cx="18.4" cy="5.6" r="1.5" fill="var(--color-warm)" />
            </svg>
          </span>
          <span className="font-display text-lg text-(--ink) transition-colors group-hover:text-accent">
            Quantum Learner
          </span>
        </Link>

        {/* Centered glass pill */}
        <div className="hidden items-center gap-0.5 justify-self-center rounded-chip border border-(--bd) bg-(--glass-2) px-1.5 py-1 backdrop-blur-md md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-chip px-3 py-1.5 text-sm font-medium text-(--mut) transition-colors hover:bg-(--field) hover:text-(--ink) focus-ring"
            >
              {n.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1.5 justify-self-end">
          <ReviewNavBadge />
          <AccountMenu />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
