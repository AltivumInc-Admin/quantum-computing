"use client";

import type { ReactNode } from "react";
import { NotebookLink } from "@/components/notebook-link";
import { PrevNext } from "@/components/prev-next";
import { SectionProgress } from "@/components/section-progress";
import { TableOfContents } from "@/components/table-of-contents";
import type { Heading } from "@/lib/extract-headings";
import type { NotebookEntry } from "@/lib/content";
import { useLocale } from "@/i18n";

interface LessonBodyProps {
  slug: string;
  sectionDir: string;
  /** Server-rendered English GUIDE (markdown, KaTeX and highlighting resolved). */
  bodyEn: ReactNode;
  /** Server-rendered Spanish GUIDE; the page falls back to English when absent. */
  bodyEs: ReactNode;
  /** Outline of the English GUIDE, extracted from the same source the body was rendered from. */
  headingsEn: Heading[];
  /** Outline of the Spanish GUIDE. */
  headingsEs: Heading[];
  notebooks: NotebookEntry[];
}

/**
 * Client lesson shell: picks the English or Spanish GUIDE from the learner's
 * locale preference so both languages stay fully interactive.
 *
 * It renders neither GUIDE itself. MarkdownRenderer carries react-markdown +
 * remark-gfm + remark-math + rehype-katex + rehype-highlight, and calling it
 * from inside this "use client" module drags that whole pipeline into the
 * browser bundle. It did: until 2026-09-05 these seven lesson pages each loaded
 * TWO chunks for it (the markdown/KaTeX pipeline at 115 KB gz plus highlight.js
 * at 62 KB gz) and, via the same mistake in term-detail.tsx, 89 glossary pages
 * loaded the first one besides. Both locales therefore arrive already rendered,
 * as ReactNode props built by the SERVER page component; the toggle is a swap
 * between two finished trees. Headings come in the same way rather than being
 * re-derived here, since the page has already scanned both GUIDEs to build the
 * renderer's slug maps.
 *
 * THE TRADEOFF, measured rather than asserted (gzipped, same machine, same
 * `npm run build`, base bc6e647 vs this commit):
 *
 *   first load of /learn/01-foundations   204 KB -> 57 KB   (-72%)
 *   first load of /glossary/qubit         121 KB ->  7 KB   (-95%)
 *   total client JS across all chunks     4.13 MB -> 3.54 MB raw
 *
 * The cost is real and lands on the RSC flight segment, which is what the
 * sidebar's TransitionLink actually fetches when a learner moves between
 * lessons. Rendering BOTH locales server-side puts both in that payload:
 * learn/01-foundations.txt goes 22 KB -> 51 KB gz, and the sum over all 126
 * exported pages goes 687 KB -> 1.10 MB gz.
 *
 * That is still the right trade, and the break-even is worth writing down
 * because it is not obvious. The old chunks were SHARED and cached after the
 * first page, so the question is how many pages a session visits before the
 * cached chunk beats the fatter per-page payload. For lessons that break-even
 * is ~6 pages, and there are 7; for glossary terms it is ~137 pages, and there
 * are 89. So only a learner who reads every lesson in one uninterrupted session
 * comes out level, and every shallower visit — which is nearly all of them, and
 * every first impression — is far ahead.
 *
 * If the payload ever becomes the binding constraint, the lever is to stop
 * rendering both locales eagerly, not to move rendering back to the client.
 */
export function LessonBody({
  slug,
  sectionDir,
  bodyEn,
  bodyEs,
  headingsEn,
  headingsEs,
  notebooks,
}: LessonBodyProps) {
  const { locale, t } = useLocale();
  const spanish = locale === "es";
  const body = spanish ? bodyEs : bodyEn;
  const headings = spanish ? headingsEs : headingsEn;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
      <div className="mx-auto w-full max-w-3xl xl:mx-0">
        <div className="animate-fade-up">{body}</div>

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
