import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/60 dark:border-gray-800/40 bg-white/80 dark:bg-[color-mix(in_oklab,var(--surface-2)_80%,transparent)] backdrop-blur-xl">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link
          href="/"
          style={{ viewTransitionName: "brand" } as React.CSSProperties}
          className="flex items-center gap-2.5 interactive focus-ring rounded-lg px-2 py-1.5 -mx-2 group"
        >
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-display text-lg text-gray-900 dark:text-white group-hover:text-accent dark:group-hover:text-accent-light transition-colors">
            Quantum Workspace
          </span>
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
