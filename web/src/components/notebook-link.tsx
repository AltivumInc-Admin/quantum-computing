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
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-accent dark:hover:border-accent transition-colors group"
    >
      <svg className="w-5 h-5 text-gray-400 group-hover:text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize truncate">
          {label}
        </p>
        <p className="text-xs text-gray-500 truncate">{filename}</p>
      </div>
    </a>
  );
}
