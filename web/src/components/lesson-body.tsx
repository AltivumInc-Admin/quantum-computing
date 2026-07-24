"use client";

import { useMemo } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { NotebookLink } from "@/components/notebook-link";
import { PrevNext } from "@/components/prev-next";
import { SectionProgress } from "@/components/section-progress";
import { TableOfContents } from "@/components/table-of-contents";
import { extractHeadings, lineSlugMapFrom } from "@/lib/extract-headings";
import type { NotebookEntry } from "@/lib/content";
import { useLocale } from "@/i18n";

interface LessonBodyProps {
  slug: string;
  sectionDir: string;
  markdownEn: string;
  markdownEs: string;
  notebooks: NotebookEntry[];
}

/**
 * Client lesson shell: picks English or Spanish GUIDE markdown from the
 * learner's locale preference and re-derives TOC / heading slugs so both
 * languages stay fully interactive.
 */
export function LessonBody({
  slug,
  sectionDir,
  markdownEn,
  markdownEs,
  notebooks,
}: LessonBodyProps) {
  const { locale, t } = useLocale();
  const markdown = locale === "es" ? markdownEs : markdownEn;

  const { headings, lineSlugs } = useMemo(() => {
    const h = extractHeadings(markdown);
    return { headings: h, lineSlugs: lineSlugMapFrom(h) };
  }, [markdown]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
      <div className="mx-auto w-full max-w-3xl xl:mx-0">
        <div className="animate-fade-up">
          <MarkdownRenderer content={markdown} lineSlugs={lineSlugs} />
        </div>

        {notebooks.length > 0 && (
          <section className="mt-16 reveal">
            <div className="flex items-center gap-4 mb-6">
              <h2 className="font-display text-display-md text-(--ink)">
                {t("lesson.notebooks")}
              </h2>
              <div className="flex-1 h-px hue-divider" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {notebooks.map((nb) => (
                <NotebookLink
                  key={nb.filename}
                  filename={nb.filename}
                  sectionDir={sectionDir}
                  browserRunnable={nb.browserRunnable}
                />
              ))}
            </div>
          </section>
        )}

        <div className="mt-16 flex flex-wrap items-center gap-4 border-t border-(--bd) pt-10 reveal">
          <SectionProgress slug={slug} />
          <p className="text-sm text-caption">{t("lesson.completionSaved")}</p>
        </div>

        <div className="reveal">
          <PrevNext currentSlug={slug} />
        </div>
      </div>

      {headings.length > 0 && (
        <aside className="hidden xl:block">
          <div
            className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain animate-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            <TableOfContents headings={headings} />
          </div>
        </aside>
      )}
    </div>
  );
}
