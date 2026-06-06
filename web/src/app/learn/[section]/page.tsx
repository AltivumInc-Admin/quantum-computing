import { notFound } from "next/navigation";
import { getSections, getSectionBySlug, hueFor } from "@/lib/sections";
import { getContent } from "@/lib/content";
import { extractHeadings } from "@/lib/extract-headings";
import { Sidebar } from "@/components/sidebar";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { NotebookLink } from "@/components/notebook-link";
import { PrevNext } from "@/components/prev-next";
import { SectionProgress } from "@/components/section-progress";
import { TableOfContents } from "@/components/table-of-contents";

interface PageProps {
  params: Promise<{ section: string }>;
}

export function generateStaticParams() {
  return getSections().map((s) => ({ section: s.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { section: slug } = await params;
  const section = getSectionBySlug(slug);
  if (!section) return { title: "Not Found" };
  return {
    title: `${section.title} — Quantum Workspace`,
    description: `Learn ${section.title.toLowerCase()} with Amazon Braket`,
  };
}

export default async function SectionPage({ params }: PageProps) {
  const { section: slug } = await params;
  const section = getSectionBySlug(slug);
  if (!section) notFound();

  const content = await getContent(slug);
  if (!content) notFound();

  const headings = extractHeadings(content.markdown);

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
      <div className="flex-1 lg:ml-72">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
          <div className="mx-auto w-full max-w-3xl xl:mx-0">
            <div className="animate-fade-up">
              <MarkdownRenderer content={content.markdown} />
            </div>

            {content.notebooks.length > 0 && (
              <section className="mt-16 reveal">
                <div className="flex items-center gap-4 mb-6">
                  <h2 className="font-display text-2xl text-gray-900 dark:text-white">Notebooks</h2>
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
              <p className="text-sm text-gray-400 dark:text-gray-500">
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
