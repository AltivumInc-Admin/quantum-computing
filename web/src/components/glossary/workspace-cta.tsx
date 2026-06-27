// Env-gated sign-up CTA, mirroring AskTutor's NEXT_PUBLIC_TUTOR_URL gate: a live
// link when NEXT_PUBLIC_SIGNUP_URL is configured in Amplify, a "coming soon" teaser
// otherwise. The free Quantum Workspace (Cognito sign-up) does not exist yet.
export function WorkspaceCta() {
  const url = process.env.NEXT_PUBLIC_SIGNUP_URL;
  return (
    <aside className="mt-12 rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 shadow-(--shadow-resting)">
      <p className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
        The Quantum Workspace
      </p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Track your progress and go deeper across the whole curriculum. Free account.
      </p>
      <div className="mt-4">
        {url ? (
          <a href={url} className="surface-accent inline-flex items-center rounded-control px-4 py-2 text-sm font-medium">
            Sign up free
          </a>
        ) : (
          <span className="inline-flex items-center rounded-control border border-gray-200 dark:border-white/10 px-4 py-2 text-sm font-medium text-gray-400 dark:text-gray-500">
            Sign-up coming soon
          </span>
        )}
      </div>
    </aside>
  );
}
