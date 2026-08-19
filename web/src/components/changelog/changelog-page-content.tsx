"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useLocale, localeCode } from "@/i18n";
import {
  CHANGELOG,
  groupByMonth,
  monthLabel,
  type ChangeEntry,
  type ChangeKind,
} from "@/lib/changelog";
import { CHANGELOG_ES } from "@/lib/changelog-es";

const KIND_LABEL_KEY: Record<ChangeKind, string> = {
  new: "changelogUi.kindNew",
  improved: "changelogUi.kindImproved",
  fixed: "changelogUi.kindFixed",
};

// Hues from the curriculum palette (lib/sections.ts sectionHue), so the chips
// sit inside the product's existing colour language rather than introducing a
// second one. The chip itself is the same hue-soft-bg/hue-text pair the
// glossary's CategoryChip uses.
const KIND_HUE: Record<ChangeKind, number> = { new: 160, improved: 192, fixed: 15 };

export function ChangelogPageContent({
  entries = CHANGELOG,
}: {
  /** Defaults to CHANGELOG. Present so the empty state is reachable in a test. */
  entries?: readonly ChangeEntry[];
}) {
  const { t, locale } = useLocale();
  const tag = localeCode(locale);
  const groups = groupByMonth(entries);

  // A plain Record has no dictionary fallback chain, so an unmatched id would
  // render nothing at all. Fall back to English explicitly; the bidirectional
  // parity test in __tests__/lib/changelog.test.ts keeps this path unused.
  const copy = (entry: ChangeEntry) =>
    locale === "es" ? (CHANGELOG_ES[entry.id] ?? { title: entry.title, body: entry.body }) : entry;

  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <header className="mb-12">
        <p className="mb-4 text-sm font-medium tracking-widest uppercase text-accent-dark dark:text-accent-light">
          {t("changelogUi.eyebrow")}
        </p>
        <h1 className="font-display text-display-2xl tracking-tight text-(--ink)">
          {t("changelogUi.title")}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-600 dark:text-gray-400">
          {t("changelogUi.lead")}
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="py-16 text-center text-gray-500 dark:text-gray-400">
          {t("changelogUi.empty")}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-labelledby={`month-${group.key}`} className="mt-10">
            <h2
              id={`month-${group.key}`}
              className="scroll-mt-24 font-display text-display-lg tabular-nums text-accent-dark dark:text-accent-light"
            >
              {monthLabel(group.key, tag)}
            </h2>

            <ul role="list" className="mt-2">
              {group.entries.map((entry) => {
                const { title, body } = copy(entry);
                return (
                  <li key={entry.id}>
                    <article className="border-b border-gray-200/50 py-5 dark:border-white/[0.06]">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                        <h3
                          id={entry.id}
                          className="scroll-mt-24 font-display text-display-md tracking-tight text-(--ink)"
                        >
                          {title}
                        </h3>
                        <span
                          style={{ "--hue": KIND_HUE[entry.kind] } as CSSProperties}
                          className="hue-soft-bg hue-text rounded-chip px-2 py-0.5 text-xs font-medium"
                        >
                          {t(KIND_LABEL_KEY[entry.kind])}
                        </span>
                      </div>

                      <p className="mt-2 leading-relaxed text-gray-600 dark:text-gray-300">{body}</p>

                      {entry.href ? (
                        <Link
                          href={entry.href}
                          className="interactive focus-ring mt-3 inline-block rounded text-sm font-medium text-accent-dark hover:underline dark:text-accent-light"
                        >
                          {t("changelogUi.seeIt")}
                        </Link>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
