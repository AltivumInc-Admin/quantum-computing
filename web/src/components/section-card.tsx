import Link from "next/link";

interface SectionCardProps {
  slug: string;
  index: number;
  title: string;
  summary: string;
  notebookCount: number;
}

const gradients = [
  "from-cyan-500/10 to-blue-600/10 dark:from-cyan-400/10 dark:to-blue-500/10",
  "from-violet-500/10 to-purple-600/10 dark:from-violet-400/10 dark:to-purple-500/10",
  "from-amber-500/10 to-orange-600/10 dark:from-amber-400/10 dark:to-orange-500/10",
  "from-emerald-500/10 to-teal-600/10 dark:from-emerald-400/10 dark:to-teal-500/10",
  "from-rose-500/10 to-pink-600/10 dark:from-rose-400/10 dark:to-pink-500/10",
  "from-sky-500/10 to-indigo-600/10 dark:from-sky-400/10 dark:to-indigo-500/10",
];

const accentColors = [
  "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
  "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  "text-rose-600 dark:text-rose-400 bg-rose-500/10",
  "text-sky-600 dark:text-sky-400 bg-sky-500/10",
];

export function SectionCard({ slug, index, title, summary, notebookCount }: SectionCardProps) {
  const gradient = gradients[index % gradients.length];
  const accent = accentColors[index % accentColors.length];

  return (
    <Link
      href={`/learn/${slug}`}
      className="group relative block rounded-2xl border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-gray-900/60 backdrop-blur-sm overflow-hidden interactive focus-ring hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-accent/5 transition-all duration-300"
    >
      {/* Gradient header band */}
      <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />

      <div className="p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className={`shrink-0 w-9 h-9 rounded-lg font-bold flex items-center justify-center text-sm ${accent}`}>
            {String(index).padStart(2, "0")}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums mt-1">
            {notebookCount} {notebookCount === 1 ? "notebook" : "notebooks"}
          </span>
        </div>

        <h3 className="font-display text-lg text-gray-900 dark:text-white leading-snug group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200">
          {title}
        </h3>

        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-3">
          {summary}
        </p>

        {/* Arrow indicator */}
        <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200">
          <span>Explore section</span>
          <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
