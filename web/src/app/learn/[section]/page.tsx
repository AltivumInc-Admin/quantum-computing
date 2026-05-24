import { notFound } from "next/navigation";
import { getSections, getSectionBySlug } from "@/lib/sections";
import { getContent } from "@/lib/content";
import { Sidebar } from "@/components/sidebar";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { NotebookLink } from "@/components/notebook-link";
import { PrevNext } from "@/components/prev-next";

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

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 lg:ml-72">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="animate-fade-up">
            <MarkdownRenderer content={content.markdown} />
          </div>

          {content.notebooks.length > 0 && (
            <section className="mt-16 animate-fade-up" style={{ animationDelay: "150ms" }}>
              <div className="flex items-center gap-4 mb-6">
                <h2 className="font-display text-2xl text-gray-900 dark:text-white">Notebooks</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {content.notebooks.map((nb) => (
                  <NotebookLink
                    key={nb}
                    filename={nb}
                    sectionDir={section.dirName}
                  />
                ))}
              </div>
            </section>
          )}

          <div className="animate-fade-up" style={{ animationDelay: "250ms" }}>
            <PrevNext currentSlug={slug} />
          </div>
        </div>
      </div>
    </div>
  );
}
