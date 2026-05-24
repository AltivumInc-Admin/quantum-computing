interface NotebookLinkProps {
  filename: string;
  sectionDir: string;
}

export function NotebookLink({ filename, sectionDir }: NotebookLinkProps) {
  const repoUrl = process.env.NEXT_PUBLIC_GITHUB_REPO || "https://github.com/altivum/quantum";
  const href = `${repoUrl}/blob/main/${sectionDir}/notebooks/${filename}`;
  const label = filename.replace(".ipynb", "").replace(/^\d+-/, "").replace(/-/g, " ");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-gray-900/40 hover:-translate-y-px hover:shadow-md hover:border-accent/30 dark:hover:border-accent/30 transition-all duration-200 interactive focus-ring group"
    >
      <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-800/50 flex items-center justify-center">
        <svg className="w-4.5 h-4.5 text-gray-400 group-hover:text-accent transition-colors duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize truncate group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200">
          {label}
        </p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5 font-mono">{filename}</p>
      </div>
      <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 ml-auto shrink-0 group-hover:text-accent/60 transition-colors duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}
