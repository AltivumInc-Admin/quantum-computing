import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSections, getSectionBySlug, hueFor } from "@/lib/sections";
import { getContent, getContentSummary } from "@/lib/content";
import { articleMetadata, truncateAtWord } from "@/lib/seo";
import { extractHeadings, lineSlugMapFrom } from "@/lib/extract-headings";
import { Sidebar } from "@/components/sidebar";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { NotebookLink } from "@/components/notebook-link";
import { PrevNext } from "@/components/prev-next";
import { SectionProgress } from "@/components/section-progress";
import { TableOfContents } from "@/components/table-of-contents";
import { SITE_NAME } from "@/lib/site";
import { LESSON_CONTENT_ID } from "@/lib/layout-regions";

interface PageProps {
  params: Promise<{ section: string }>;
}

export function generateStaticParams() {
  return getSections().map((s) => ({ section: s.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { section: slug } = await params;
  const section = getSectionBySlug(slug);
  if (!section) return { title: "Not Found" };
  // Describe the lesson with its own opening prose (the same summary the home
  // curriculum cards show), truncated to meta-description length.
  const summary = await getContentSummary(slug);
  const description = summary
    ? truncateAtWord(summary, 155)
    : `${section.title}: hands-on lessons and runnable notebooks in the ${SITE_NAME} curriculum.`;
  return {
    ...articleMetadata({
      title: `${section.title} — ${SITE_NAME}`,
      ogTitle: section.title,
      description,
      path: `/learn/${section.slug}`,
    }),
    // Behind the sign-up wall — keep the gate URL out of search indexes. Note
    // this hides the URL, not the content: the lesson still ships in the
    // exported page payload (see auth-wall.tsx for the boundary's limits).
    robots: { index: false, follow: false },
  };
}

export default async function SectionPage({ params }: PageProps) {
  const { section: slug } = await params;
  const section = getSectionBySlug(slug);
  if (!section) notFound();

  const content = await getContent(slug);
  if (!content) notFound();

  const headings = extractHeadings(content.markdown);
  // Reuse the headings the TOC already computed to build the renderer's
  // line -> slug map, so the GUIDE isn't scanned for headings a second time.
  const lineSlugs = lineSlugMapFrom(headings);

  // The section's identity hue cascades to the sidebar active pill, the "On this
  // page" rail, the Notebooks divider, and the completion toggle — so the color
  // the home card established carries through the whole lesson (see .hue-* in
  // globals.css).
  const hue = hueFor(section.index);

  return (
    <div className="flex" style={{ "--hue": hue } as React.CSSProperties}>
      {/* Reading-progress rail — its width tracks scroll depth through the lesson
          (pure CSS scroll-driven animation; collapsed/invisible where unsupported). */}
      <div
        aria-hidden="true"
        className="read-progress fixed inset-x-0 top-16 z-40 h-0.5 bg-gradient-to-r from-accent to-warm"
      />
      <div id={LESSON_CONTENT_ID} className="flex-1 lg:ml-72">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
          <div className="mx-auto w-full max-w-3xl xl:mx-0">
            <div className="animate-fade-up">
              <MarkdownRenderer content={content.markdown} lineSlugs={lineSlugs} />
            </div>

            {content.notebooks.length > 0 && (
              <section className="mt-16 reveal">
                <div className="flex items-center gap-4 mb-6">
                  <h2 className="font-display text-display-md text-gray-900 dark:text-white">Notebooks</h2>
                  <div className="flex-1 h-px hue-divider" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {content.notebooks.map((nb) => (
                    <NotebookLink
                      key={nb.filename}
                      filename={nb.filename}
                      sectionDir={section.dirName}
                      browserRunnable={nb.browserRunnable}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* One hairline (the system --bd token) opens the shared lesson
                footer block; PrevNext below deliberately draws no second rule. */}
            <div className="mt-16 flex flex-wrap items-center gap-4 border-t border-(--bd) pt-10 reveal">
              <SectionProgress slug={slug} />
              <p className="text-sm text-caption">
                Mark this lesson done to track your progress through the path.
              </p>
            </div>

            <div className="reveal">
              <PrevNext currentSlug={slug} />
            </div>
          </div>

          {headings.length > 0 && (
            <aside className="hidden xl:block">
              {/* The sticky rail caps its height under the header and scrolls
                  internally: a long outline (00-prereqs has 18 entries) would
                  otherwise clip its tail below short xl viewports with no way
                  to ever scroll it into view. */}
              <div
                className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain animate-fade-up"
                style={{ animationDelay: "300ms" }}
              >
                <TableOfContents headings={headings} />
              </div>
            </aside>
          )}
        </div>
      </div>
      {/* The sidebar renders AFTER the lesson so "Skip to content" lands
          keyboard users in the lesson body, not in front of the same 7-link
          learning-path block on every page turn. Its aside is position:fixed
          (out of flow), so DOM order changes tab order with zero visual
          change — and the mobile FAB ends up last, matching its
          bottom-corner position. */}
      <Sidebar />
    </div>
  );
}
