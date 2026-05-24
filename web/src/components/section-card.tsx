import Link from "next/link";

interface SectionCardProps {
  slug: string;
  index: number;
  title: string;
  summary: string;
  notebookCount: number;
}

const gradients = [
  "from-cyan-500/20 to-blue-600/10 dark:from-cyan-400/15 dark:to-blue-500/5",
  "from-violet-500/20 to-purple-600/10 dark:from-violet-400/15 dark:to-purple-500/5",
  "from-amber-500/20 to-orange-600/10 dark:from-amber-400/15 dark:to-orange-500/5",
  "from-emerald-500/20 to-teal-600/10 dark:from-emerald-400/15 dark:to-teal-500/5",
  "from-rose-500/20 to-pink-600/10 dark:from-rose-400/15 dark:to-pink-500/5",
  "from-sky-500/20 to-indigo-600/10 dark:from-sky-400/15 dark:to-indigo-500/5",
];

const accentColors = [
  "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
  "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  "text-rose-600 dark:text-rose-400 bg-rose-500/10",
  "text-sky-600 dark:text-sky-400 bg-sky-500/10",
];

const glowColors = [
  "oklch(0.7 0.15 192 / 0.15)",
  "oklch(0.7 0.15 290 / 0.15)",
  "oklch(0.7 0.12 75 / 0.15)",
  "oklch(0.7 0.15 160 / 0.15)",
  "oklch(0.7 0.15 15 / 0.15)",
  "oklch(0.7 0.15 230 / 0.15)",
];

export function SectionCard({ slug, index, title, summary, notebookCount }: SectionCardProps) {
  const gradient = gradients[index % gradients.length];
  const accent = accentColors[index % accentColors.length];
  const glow = glowColors[index % glowColors.length];

  return (
    <Link
      href={`/learn/${slug}`}
      className="group relative block rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/90 dark:bg-white/[0.03] backdrop-blur-md overflow-hidden interactive focus-ring hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-black/10 dark:hover:shadow-black/40 hover:border-gray-300/80 dark:hover:border-white/[0.12] transition-all duration-300"
    >
      {/* Hover glow border */}
      <div
        className="absolute inset-[-1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${glow} 0%, transparent 60%)` }}
      />

      {/* Gradient bleed area */}
      <div className={`relative h-20 bg-gradient-to-br ${gradient}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/90 dark:to-[#0d1117]" />
      </div>

      <div className="relative p-6 -mt-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className={`shrink-0 w-10 h-10 rounded-lg font-bold flex items-center justify-center text-base ${accent}`}>
            {String(index).padStart(2, "0")}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums mt-1">
            {notebookCount} {notebookCount === 1 ? "notebook" : "notebooks"}
          </span>
        </div>

        <h3 className="font-display text-xl tracking-tight text-gray-900 dark:text-white leading-snug group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200">
          {title}
        </h3>

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">
          {summary}
        </p>

        {/* Divider + Arrow indicator */}
        <div className="h-px bg-gradient-to-r from-gray-200/50 dark:from-gray-700/30 to-transparent mt-4 mb-4" />
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200">
          <span>Explore section</span>
          <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
