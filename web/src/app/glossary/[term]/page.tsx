import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GLOSSARY, getTermBySlug, termSlug, plainText } from "@/lib/glossary";
import { TermDetail } from "@/components/glossary/term-detail";

function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

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
  const description = truncateAtWord(plainText(term.definition), 155);
  const url = `/glossary/${termSlug(term.term)}`;
  return {
    title: `${term.term} — Quantum Glossary`,
    description,
    alternates: { canonical: url },
    openGraph: { title: term.term, description, url, type: "article" },
    twitter: { card: "summary", title: term.term, description },
  };
}

export default async function GlossaryTermPage({ params }: PageProps) {
  const { term: slug } = await params;
  const term = getTermBySlug(slug);
  if (!term) notFound();

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <TermDetail term={term} />
      </div>
    </div>
  );
}
