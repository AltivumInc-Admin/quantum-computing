import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSections, getSectionBySlug, hueFor } from "@/lib/sections";
import { getContent, getContentSummary } from "@/lib/content";
import { articleMetadata, truncateAtWord } from "@/lib/seo";
import { Sidebar } from "@/components/sidebar";
import { LessonBody } from "@/components/lesson-body";
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
        className="read-progress fixed inset-x-0 top-16 z-40 h-0.5 bar-fill"
      />
      <div id={LESSON_CONTENT_ID} className="min-w-0 flex-1 lg:ml-72">
        <LessonBody
          slug={slug}
          sectionDir={section.dirName}
          markdownEn={content.markdown}
          markdownEs={content.markdownEs}
          notebooks={content.notebooks}
        />
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
