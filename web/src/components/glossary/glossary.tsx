"use client";

import { useId, useMemo, useState } from "react";
import { GLOSSARY, groupByLetter, matchesQuery, ALPHABET } from "@/lib/glossary";
import { GlossaryEntry } from "./glossary-entry";

export function Glossary() {
  const [query, setQuery] = useState("");
  const searchId = useId();

  const filtered = useMemo(() => GLOSSARY.filter((t) => matchesQuery(t, query)), [query]);
  const groups = useMemo(() => groupByLetter(filtered), [filtered]);
  const present = useMemo(() => new Set(groups.map((g) => g.letter)), [groups]);

  return (
    <div>
      <div className="sticky top-16 z-10 -mx-4 px-4 py-4 bg-(--surface-base)/80 backdrop-blur-md">
        <label htmlFor={searchId} className="sr-only">
          Search glossary terms
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms..."
          autoComplete="off"
          className="w-full rounded-control border border-gray-200 dark:border-white/10 bg-(--surface-1) px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus-ring shadow-(--shadow-resting)"
        />
        <nav aria-label="Jump to letter" className="mt-3 flex flex-wrap gap-1">
          {ALPHABET.map((letter) =>
            present.has(letter) ? (
              <a
                key={letter}
                href={`#letter-${letter}`}
                aria-label={`Jump to ${letter}`}
                className="w-7 h-7 flex items-center justify-center rounded-chip text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 interactive focus-ring"
              >
                {letter}
              </a>
            ) : (
              <span
                key={letter}
                aria-hidden="true"
                className="w-7 h-7 flex items-center justify-center rounded-chip text-xs font-medium text-gray-300 dark:text-gray-700 select-none"
              >
                {letter}
              </span>
            )
          )}
        </nav>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {filtered.length} terms
      </p>

      {groups.length === 0 ? (
        <p className="py-16 text-center text-gray-500 dark:text-gray-400">
          No terms match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.letter} aria-labelledby={`letter-${group.letter}`} className="mt-8">
            <h2
              id={`letter-${group.letter}`}
              className="scroll-mt-36 font-display text-display-lg text-accent dark:text-accent-light"
            >
              {group.letter}
            </h2>
            <ul role="list" className="mt-2">
              {group.terms.map((term) => (
                <li key={term.term}>
                  <GlossaryEntry term={term} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
