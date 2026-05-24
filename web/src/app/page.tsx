import { getSections } from "@/lib/sections";
import { getContentSummary } from "@/lib/content";
import { SectionCard } from "@/components/section-card";

export default async function HomePage() {
  const sections = getSections();
  const summaries = await Promise.all(
    sections.map((s) => getContentSummary(s.slug))
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <section className="text-center mb-16">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Quantum Computing Workspace
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          A progressive learning path through quantum computing with Amazon Braket,
          from circuit fundamentals to production hybrid workloads.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["Amazon Braket", "PennyLane", "OpenFermion"].map((tech) => (
            <span
              key={tech}
              className="px-3 py-1 text-xs font-medium rounded-full bg-accent/10 text-accent"
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-8">Learning Path</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section, i) => (
            <SectionCard
              key={section.slug}
              slug={section.slug}
              index={section.index}
              title={section.title}
              summary={summaries[i] || ""}
              notebookCount={section.notebookCount}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
