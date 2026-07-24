"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  GLOSSARY,
  groupByLetter,
  matchesQuery,
  ALPHABET,
  type GlossaryTerm,
} from "@/lib/glossary";
import { GLOSSARY_ES, GLOSSARY_TERM_ES } from "@/lib/glossary-es";
import { useLocale } from "@/i18n";

interface GlossaryProps {
  /**
   * Prerendered English entry nodes keyed by English term name.
   */
  entriesEn: Record<string, ReactNode>;
  /**
   * Prerendered Spanish entry nodes keyed by English term name (stable key).
   */
  entriesEs: Record<string, ReactNode>;
}

function matchesLocaleQuery(term: GlossaryTerm, query: string, locale: string): boolean {
  if (matchesQuery(term, query)) return true;
  if (locale !== "es" || !query.trim()) return false;
  const q = query.trim().toLowerCase();
  const esTerm = (GLOSSARY_TERM_ES[term.term] ?? "").toLowerCase();
  const esDef = (GLOSSARY_ES[term.term] ?? "").toLowerCase();
  return esTerm.includes(q) || esDef.includes(q);
}

export function Glossary({ entriesEn, entriesEs }: GlossaryProps) {
  const { locale, t } = useLocale();
  const [query, setQuery] = useState("");
  const searchId = useId();
  const entries = locale === "es" ? entriesEs : entriesEn;

  const filtered = useMemo(
    () => GLOSSARY.filter((term) => matchesLocaleQuery(term, query, locale)),
    [query, locale],
  );
  const groups = useMemo(() => groupByLetter(filtered), [filtered]);
  const present = useMemo(() => new Set(groups.map((g) => g.letter)), [groups]);

  return (
    <div>
      <div className="sticky top-16 z-10 -mx-4 px-4 py-4 bg-(--surface-base)/80 backdrop-blur-md">
        <label htmlFor={searchId} className="sr-only">
          {t("glossaryUi.searchLabel")}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("glossaryUi.searchPlaceholder")}
          autoComplete="off"
          className="w-full rounded-control border border-(--bd) bg-(--surface-1) px-4 py-2.5 text-sm text-(--ink) placeholder:text-gray-400 focus-ring shadow-(--shadow-resting)"
        />
        <nav aria-label={t("glossaryUi.jumpToLetter")} className="mt-3 flex flex-wrap gap-1">
          {ALPHABET.map((letter) =>
            present.has(letter) ? (
              <a
                key={letter}
                href={`#letter-${letter}`}
                aria-label={t("glossaryUi.jumpTo", { letter })}
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
            ),
          )}
        </nav>
      </div>

      <p role="status" className="sr-only">
        {t("glossaryUi.termCount", { count: filtered.length }, filtered.length)}
      </p>

      {groups.length === 0 ? (
        <p className="py-16 text-center text-gray-500 dark:text-gray-400">
          {t("glossaryUi.noMatch", { query })}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.letter} aria-labelledby={`letter-${group.letter}`} className="mt-8">
            <h2
              id={`letter-${group.letter}`}
              className="scroll-mt-36 font-display text-display-lg text-accent-dark dark:text-accent-light"
            >
              {group.letter}
            </h2>
            <ul role="list" className="mt-2">
              {group.terms.map((term) => (
                <li key={term.term}>{entries[term.term]}</li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
