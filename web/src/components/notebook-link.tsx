"use client";

import { getRepoUrl, humanizeNotebook, notebookHref } from "@/lib/manifest";
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
  // Both the lab route and the label rule come from manifest.ts, which already
  // owns the manifest-derived link helpers. They used to be re-derived inline
  // here, in parallel with a second copy in workspace.ts whose docstring named
  // THIS component as the source — two definitions of the lab URL shape, and a
  // comment that sent maintainers to the wrong one.
  const runHref = notebookHref(sectionDir, filename);
  const { label } = humanizeNotebook(filename);

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
        {/* Wraps rather than crushing. Unwrapped, this row gave the filename
            whatever the copy button and chip left over — about 14px at 375px,
            i.e. one character and an ellipsis, for the exact string the copy
            button copies. Flex line-breaking uses each item's HYPOTHETICAL main
            size, so the filename's full nowrap width (~139px) already exceeds
            the ~118px column on its own: it takes the line, the two fixed-size
            siblings move to a second one, and only then does it shrink to the
            column and truncate. max-w-full keeps that shrink inside the card. */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
          <p className="max-w-full text-[11px] text-caption truncate font-mono">
            {filename}
          </p>
          {/* size="sm" as a PROP, not a trailing className: the old override
              string lost to CopyButton's own h-8 w-8 base (Tailwind resolves
              same-layer conflicts by stylesheet order), so this rendered a 32px
              pill in a row built for 11px text and a 10px chip. */}
          <CopyButton
            getText={() => `${sectionDir}/notebooks/${filename}`}
            label="Copy notebook path"
            size="sm"
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
          //
          // The reason is deliberately reason-AGNOSTIC. It used to read
          // "Requires AWS Braket hardware access", which is false for 2 of the
          // 13 non-runnable notebooks: 04-quantum-ml/04-pennylane-braket and
          // 05-quantum-chemistry/04-vqe-lih touch no AWS at all and are excluded
          // only because PennyLane cannot install under Pyodide. Telling a
          // chemistry learner they need paid quantum hardware is precisely the
          // misconception the free browser lab exists to remove. This sentence is
          // true for all 13; the "View on GitHub" link beside it is the next step.
          // validate_runnable.py already distinguishes the two causes
          // (DENIED_IMPORT_PREFIXES vs DENIED_NAMES), so a per-notebook `reason`
          // could ride along `runnable: false` in the manifest later.
          <span
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-caption cursor-not-allowed"
            title="Not available in the browser runtime — run this one locally with the full Python environment"
          >
            Run in browser
            <span className="sr-only">
              {" "}
              — unavailable in the browser runtime; run it locally with the full Python environment
            </span>
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
