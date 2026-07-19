"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

// href is narrowed to a plain string: every call site passes a template
// literal, and the View Transitions path feeds the value straight into
// router.push — a UrlObject (which LinkProps would otherwise invite) would
// coerce to "[object Object]" and navigate to garbage, but only on primary
// clicks with the API present. Narrowing turns that latent, hard-to-diagnose
// inconsistency into a compile error.
type TransitionLinkProps = Omit<LinkProps, "href"> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    href: string;
    children: ReactNode;
  };

/**
 * Clicks the browser must own — new tab / window / download: modified keys, a
 * non-primary button, or something upstream already handled the event. Shared
 * with drawer consumers (sidebar.tsx) so their "should this close the drawer?"
 * decision can never drift from the navigation guard here.
 */
export function isModifiedClick(e: {
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}): boolean {
  return (
    e.defaultPrevented ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey ||
    e.button !== 0
  );
}

// The pending view transition's release: set when an animated navigation
// starts, called when the new route commits (pathname change) or the fallback
// timer fires. The browser runs at most one view transition at a time, so a
// single module-scoped slot suffices.
let resolveNav: (() => void) | null = null;

// An aborted/failed navigation must not stall the capture: rendering stays
// frozen while the update callback's promise is pending (browsers hard-cap it
// around 4s), so release after 1s if no commit arrived.
const NAV_COMMIT_TIMEOUT_MS = 1000;

/**
 * A drop-in <Link> that routes in-app navigation through the View Transitions
 * API, so moving between lessons cross-fades/slides like turning a page (styled
 * via ::view-transition-* in globals.css) instead of hard-cutting.
 *
 * The update callback returns a promise that resolves when the route COMMITS
 * (pathname change), not when router.push returns — push resolves immediately
 * while the route renders asynchronously, and returning early would snapshot
 * the "new" frame before the swap: a fade to identical content followed by
 * exactly the hard cut this component exists to prevent, precisely on the slow
 * (non-prefetched) navigations where smoothness matters most.
 *
 * It degrades cleanly: modified / non-primary clicks fall through to the browser
 * (new tab, etc.); where the API is absent (Firefox, older Safari) or the reader
 * prefers reduced motion, it does a normal client navigation with no transition.
 * The underlying <Link> still renders and prefetches.
 */
export function TransitionLink({ href, children, onClick, ...props }: TransitionLinkProps) {
  const router = useRouter();
  const pathname = usePathname();

  // The route committed — release the pending capture so the transition
  // animates old content into the NEW content. Every mounted instance shares
  // the module slot; the first effect to run resolves it, the rest no-op.
  useEffect(() => {
    resolveNav?.();
  }, [pathname]);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // Let the browser handle new-tab / modified / non-primary clicks.
    if (isModifiedClick(e)) return;
    // No API, or the reader opted out of motion → plain client navigation.
    if (typeof document === "undefined" || !document.startViewTransition) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    e.preventDefault();
    document.startViewTransition(() => {
      router.push(href);
      return new Promise<void>((resolve) => {
        function finish() {
          window.clearTimeout(timer);
          if (resolveNav === finish) resolveNav = null;
          resolve();
        }
        const timer = window.setTimeout(finish, NAV_COMMIT_TIMEOUT_MS);
        resolveNav = finish;
      });
    });
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
