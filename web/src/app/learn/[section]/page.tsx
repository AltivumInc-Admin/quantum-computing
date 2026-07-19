import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSections, getSectionBySlug, hueFor } from "@/lib/sections";
import { getContent, getContentSummary } from "@/lib/content";
import { articleMetadata, truncateAtWord } from "@/lib/seo";
import { extractHeadings } from "@/lib/extract-headings";
import { Sidebar } from "@/components/sidebar";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { NotebookLink } from "@/components/notebook-link";
import { PrevNext } from "@/components/prev-next";
import { SectionProgress } from "@/components/section-progress";
import { TableOfContents } from "@/components/table-of-contents";
import { SITE_NAME } from "@/lib/site";

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
    // Behind the sign-up wall — keep it out of the index (see auth-wall.tsx).
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
  const lineSlugs = new Map(headings.map((h) => [h.line, h.slug]));

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
      <Sidebar />
      <div id="lesson-content" className="flex-1 lg:ml-72">
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

            <div className="mt-16 flex flex-wrap items-center gap-4 border-t border-gray-200/60 dark:border-gray-800/40 pt-10 reveal">
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
              <div
                className="sticky top-24 animate-fade-up"
                style={{ animationDelay: "300ms" }}
              >
                <TableOfContents headings={headings} />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
