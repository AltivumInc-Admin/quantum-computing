"use client";

import { getRepoUrl } from "@/lib/manifest";
import { CopyButton } from "./copy-button";

interface NotebookLinkProps {
  filename: string;
  sectionDir: string;
  browserRunnable?: boolean;
}

export function NotebookLink({
  filename,
  sectionDir,
  browserRunnable = false,
}: NotebookLinkProps) {
  // Canonical repo URL comes from the content manifest; an explicit env var
  // (set in Amplify) can still override it for forks/previews.
  const repoUrl = process.env.NEXT_PUBLIC_GITHUB_REPO || getRepoUrl();
  const githubHref = `${repoUrl}/blob/main/${sectionDir}/notebooks/${filename}`;
  const runHref = `/lab/lab/index.html?path=${encodeURIComponent(
    `${sectionDir}/notebooks/${filename}`
  )}`;
  const label = filename
    .replace(".ipynb", "")
    .replace(/^\d+-/, "")
    .replace(/-/g, " ");

  return (
    <div className="flex items-center gap-3 p-4 rounded-card glass shadow-(--shadow-resting) hover:border-accent/30 dark:hover:border-accent/30 transition-colors duration-200 group">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-800/50 flex items-center justify-center">
        <svg
          className="w-4.5 h-4.5 text-caption"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-(--ink) capitalize truncate">
          {label}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-[11px] text-caption truncate font-mono">
            {filename}
          </p>
          <CopyButton
            getText={() => `${sectionDir}/notebooks/${filename}`}
            label="Copy notebook path"
            className="h-6 w-6 [&_svg]:h-3 [&_svg]:w-3"
          />
          {browserRunnable && (
            <span className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-accent/10 text-accent-dark dark:text-accent-light">
              Pyodide
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {browserRunnable ? (
          <a
            href={runHref}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg surface-accent interactive focus-ring"
            aria-label={`Run ${label} in browser`}
          >
            Run in browser
          </a>
        ) : (
          // aria-disabled is not a supported state on a generic span (axe:
          // aria-allowed-attr), so the chip reads as descriptive text instead:
          // an sr-only qualifier carries the reason the hover title shows,
          // matching the sidebar's sr-only "completed" idiom.
          <span
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-caption cursor-not-allowed"
            title="Requires AWS Braket hardware access"
          >
            Run in browser
            <span className="sr-only"> — unavailable, requires AWS Braket hardware access</span>
          </span>
        )}
        <a
          href={githubHref}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-caption hover:text-accent hover:bg-accent/10 transition-colors interactive focus-ring"
          aria-label={`View ${label} on GitHub`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
