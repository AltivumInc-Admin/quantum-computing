import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GLOSSARY, getTermBySlug, termSlug, plainText } from "@/lib/glossary";
import { GLOSSARY_ES } from "@/lib/glossary-es";
import { articleMetadata, truncateAtWord } from "@/lib/seo";
import { InlineMarkdown } from "@/components/glossary/inline-markdown";
import { TermDetail } from "@/components/glossary/term-detail";

interface PageProps {
  params: Promise<{ term: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return GLOSSARY.map((t) => ({ term: termSlug(t.term) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { term: slug } = await params;
  const term = getTermBySlug(slug);
  if (!term) return { title: "Not Found" };
  return {
    ...articleMetadata({
      title: `${term.term} — Quantum Glossary`,
      ogTitle: term.term,
      description: truncateAtWord(plainText(term.definition), 155),
      path: `/glossary/${termSlug(term.term)}`,
    }),
    // Behind the sign-up wall — keep it out of the index (see auth-wall.tsx).
    robots: { index: false, follow: false },
  };
}

export default async function GlossaryTermPage({ params }: PageProps) {
  const { term: slug } = await params;
  const term = getTermBySlug(slug);
  if (!term) notFound();

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere" />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        {/* The definition (markdown + KaTeX) is rendered HERE, on the server, at
            build — once in English and once in Spanish. The client <TermDetail>
            only picks which one to show from the learner's locale, so the
            react-markdown/remark-math/rehype-katex pipeline never ships to the
            browser. Rendering it inside the client shell instead is what put a
            384 KB KaTeX chunk on all 89 of these pages; the same split already
            keeps it off /glossary (see glossary/page.tsx). */}
        <TermDetail
          term={term}
          definitionEn={<InlineMarkdown>{term.definition}</InlineMarkdown>}
          definitionEs={
            <InlineMarkdown>
              {GLOSSARY_ES[term.term] ?? term.definition}
            </InlineMarkdown>
          }
        />
      </div>
    </div>
  );
}
