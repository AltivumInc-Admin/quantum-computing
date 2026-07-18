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
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-(--bd) bg-(--field)">
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </span>
          <span className="font-display text-lg text-(--ink) transition-colors group-hover:text-accent">
            Quantum Workspace
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
