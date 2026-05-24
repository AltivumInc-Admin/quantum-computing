import { getSections } from "@/lib/sections";
import { getContentSummary } from "@/lib/content";
import { SectionCard } from "@/components/section-card";

export default async function HomePage() {
  const sections = getSections();
  const summaries = await Promise.all(
    sections.map((s) => getContentSummary(s.slug))
  );

  return (
    <div className="relative overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0 dark:bg-[radial-gradient(ellipse_at_top,_oklch(0.18_0.03_250)_0%,_transparent_50%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-accent/5 dark:bg-accent/[0.03] rounded-full blur-3xl" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        {/* Hero */}
        <section className="mb-24 animate-fade-up">
          <p className="text-sm font-medium tracking-widest uppercase text-accent dark:text-accent-light mb-4">
            Amazon Braket Learning Platform
          </p>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-tight leading-[1.05] max-w-4xl">
            <span className="text-gray-900 dark:text-white">Master </span>
            <span className="text-gradient">Quantum Computing</span>
            <span className="text-gray-900 dark:text-white"> from First Principles</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
            A progressive curriculum spanning circuit fundamentals through production
            hybrid workloads. Build real quantum algorithms with hands-on notebooks.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: "200ms" }}>
            {["Amazon Braket", "PennyLane", "OpenFermion", "IonQ", "IQM"].map((tech) => (
              <span
                key={tech}
                className="px-4 py-1.5 text-xs font-semibold tracking-wide rounded-full border border-gray-200 dark:border-gray-700/50 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-300"
              >
                {tech}
              </span>
            ))}
          </div>
        </section>

        {/* Section grid */}
        <section>
          <div className="flex items-center gap-4 mb-10 animate-fade-up" style={{ animationDelay: "250ms" }}>
            <h2 className="font-display text-3xl text-gray-900 dark:text-white">Learning Path</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent" />
            <span className="text-sm text-gray-500 dark:text-gray-500 tabular-nums">{sections.length} sections</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section, i) => (
              <div
                key={section.slug}
                className="animate-fade-up"
                style={{ animationDelay: `${300 + i * 100}ms` }}
              >
                <SectionCard
                  slug={section.slug}
                  index={section.index}
                  title={section.title}
                  summary={summaries[i] || ""}
                  notebookCount={section.notebookCount}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
