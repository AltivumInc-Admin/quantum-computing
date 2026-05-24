import { notFound } from "next/navigation";
import { getSectionBySlug } from "@/lib/sections";
import { getContent } from "@/lib/content";
import { Sidebar } from "@/components/sidebar";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { NotebookLink } from "@/components/notebook-link";
import { PrevNext } from "@/components/prev-next";

interface PageProps {
  params: Promise<{ section: string }>;
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <MarkdownRenderer content={content.markdown} />

          {content.notebooks.length > 0 && (
            <section className="mt-12">
              <h2 className="text-xl font-semibold mb-4">Notebooks</h2>
              <div className="grid gap-2 sm:grid-cols-2">
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

          <PrevNext currentSlug={slug} />
        </div>
      </div>
    </div>
  );
}
