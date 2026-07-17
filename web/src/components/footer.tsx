import Link from "next/link";

const REPO_URL = "https://github.com/AltivumInc-Admin/quantum-computing";

const linkClass =
  "text-gray-600 dark:text-gray-400 hover:text-accent dark:hover:text-accent-light interactive focus-ring rounded transition-colors";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-gray-200/60 dark:border-gray-800/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-caption">
          Quantum Workspace — learn quantum computing with Amazon Braket.
        </p>
        <nav aria-label="Footer" className="flex items-center gap-6 text-sm font-medium">
          <Link href="/playground" className={linkClass}>
            Playground
          </Link>
          <Link href="/runbook" className={linkClass}>
            Runbook
          </Link>
          <Link href="/credentials" className={linkClass}>
            Credentials
          </Link>
          <Link href="/glossary" className={linkClass}>
            Glossary
          </Link>
          <Link href="/review" className={linkClass}>
            Review
          </Link>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
            GitHub
          </a>
          <Link
            href="/privacy"
            className="text-caption hover:text-accent dark:hover:text-accent-light interactive focus-ring rounded transition-colors"
          >
            Privacy
          </Link>
        </nav>
      </div>
      <p className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 text-xs text-caption">
        Altivum Inc. — built with Amazon Braket.
      </p>
    </footer>
  );
}
