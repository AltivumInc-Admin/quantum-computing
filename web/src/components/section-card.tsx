import Link from "next/link";

interface SectionCardProps {
  slug: string;
  index: number;
  title: string;
  summary: string;
  notebookCount: number;
}

export function SectionCard({ slug, index, title, summary, notebookCount }: SectionCardProps) {
  return (
    <Link
      href={`/learn/${slug}`}
      className="group block p-6 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-accent dark:hover:border-accent transition-all hover:shadow-lg"
    >
      <div className="flex items-start gap-4">
        <span className="shrink-0 w-10 h-10 rounded-lg bg-accent/10 text-accent font-bold flex items-center justify-center text-sm">
          {String(index).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-accent transition-colors">
            {title}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {summary}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
            {notebookCount} {notebookCount === 1 ? "notebook" : "notebooks"}
          </p>
        </div>
      </div>
    </Link>
  );
}
