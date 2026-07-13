import Link from "next/link";
import { isAuthConfigured } from "@/lib/auth-config";

// Env-gated sign-up CTA, mirroring the tutor's gate: a live link to the in-app
// /login (create-account) when Cognito is configured, a "coming soon" teaser
// otherwise. Gated on isAuthConfigured() — the four NEXT_PUBLIC_COGNITO_* / region
// vars set in Amplify — which replaced the old NEXT_PUBLIC_SIGNUP_URL.
export function WorkspaceCta() {
  const configured = isAuthConfigured();
  return (
    <aside className="mt-12 rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 shadow-(--shadow-resting)">
      <p className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
        The Quantum Workspace
      </p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Track your progress and go deeper across the whole curriculum. Free account.
      </p>
      <div className="mt-4">
        {configured ? (
          <Link
            href="/login?mode=signup"
            className="surface-accent inline-flex items-center rounded-control px-4 py-2 text-sm font-medium"
          >
            Sign up free
          </Link>
        ) : (
          <span className="inline-flex items-center rounded-control border border-gray-200 dark:border-white/10 px-4 py-2 text-sm font-medium text-caption">
            Sign-up coming soon
          </span>
        )}
      </div>
    </aside>
  );
}
