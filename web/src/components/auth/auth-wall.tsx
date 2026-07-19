"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * Routes that never require an account. The marketing funnel (`/`, `/pricing`)
 * is the conversion surface; the auth routes (`/login`, `/auth/callback`) would
 * loop if gated; `/privacy` is legal and must always be reachable; the
 * `/e2e-fixtures/*` pages are Playwright scaffolding. Everything else — the
 * whole learning platform — sits behind the sign-up wall.
 */
const PUBLIC_PATHS = new Set(["/", "/pricing", "/login", "/auth/callback", "/privacy"]);
const PUBLIC_PREFIXES = ["/e2e-fixtures"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function GateScreen() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-4 py-16">
      <p className="flex items-center gap-3 text-sm text-caption" role="status">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-(--bd) border-t-accent"
          aria-hidden="true"
        />
        Checking your access…
      </p>
    </div>
  );
}

/**
 * The sign-up wall. Only learning-platform routes are gated; the funnel, auth,
 * and legal routes stay public. Keyed entirely on the auth provider's status,
 * which is "unconfigured" whenever Cognito env is absent (unit tests, static
 * export without env, local dev) — so the wall is fully inert there and the
 * site renders exactly as before.
 *
 * In the configured production build the provider starts in "configuring", so
 * protected routes pre-render as the gate rather than their content: the
 * content never ships in the static HTML and never reaches a search index —
 * the deliberate trade for a hard wall. A signed-out visitor who deep-links to
 * a protected route is redirected to `/login?mode=signup&next=…` — sign-up
 * framing because a walled-off visitor is most likely a brand-new prospect
 * (the form still offers "Already have an account? Sign in" one tap away),
 * with the destination preserved. A signed-in visitor passes straight through.
 */
export function AuthWall({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const publicPath = isPublicPath(pathname ?? "");
  const blocked = status === "unauthenticated" && !publicPath;

  useEffect(() => {
    if (!blocked) return;
    const target = pathname && pathname !== "/" ? pathname : null;
    router.replace(
      target
        ? `/login?mode=signup&next=${encodeURIComponent(target)}`
        : "/login?mode=signup"
    );
  }, [blocked, pathname, router]);

  // Render freely when auth isn't configured, on a public route, or when the
  // visitor is signed in. Otherwise hold on the gate: "configuring" is still
  // resolving the session; "unauthenticated" is mid-redirect.
  if (status === "unconfigured" || publicPath || status === "authenticated") {
    return <>{children}</>;
  }
  return <GateScreen />;
}
